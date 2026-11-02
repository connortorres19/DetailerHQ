#!/usr/bin/env node
// Dev/test-only stand-in for Stripe (TEST MODE semantics), for machines that can't reach
// api.stripe.com and for automated tests. NOTHING HERE IS REAL: no card is charged, no money moves.
//
// The app's official Stripe SDK talks to it when .env.local has STRIPE_MOCK_URL=http://localhost:12111
// (honoured only when the site is localhost). It implements the small part of the Stripe API that
// DetailerHQ uses, hosted Checkout / Customer Portal look-alike pages, and signed webhooks to
// http://localhost:3000/api/billing/webhook using STRIPE_WEBHOOK_SECRET from .env.local.
//
// Test controls (JSON):  GET /_test/state
//   POST /_test/subscriptions/:id/{trial_end|payment_failed|recover|period_end}
//   POST /_test/sessions/:id/expire     POST /_test/replay/:eventId     POST /_test/refund/:paymentIntent
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const env = (n, d) => process.env[n] ?? envFile.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1]?.trim() ?? d;
const PORT = Number(env('STRIPE_MOCK_PORT', 12111));
const BASE = `http://localhost:${PORT}`;
const WEBHOOK_URL = env('STRIPE_MOCK_WEBHOOK_URL', 'http://localhost:3000/api/billing/webhook');
const SECRET = env('STRIPE_WEBHOOK_SECRET', '');
const PRICE_FOUNDING = env('STRIPE_PRICE_FOUNDING', 'price_founding_mock');
const PRICE_STANDARD = env('STRIPE_PRICE_STANDARD', 'price_standard_mock');
const signer = new Stripe('sk_test_mock_signer');

const now = () => Math.floor(Date.now() / 1000);
const newId = (p) => `${p}_mock_${randomBytes(9).toString('hex')}`;
const db = { customers: {}, sessions: {}, subscriptions: {}, setupIntents: {}, charges: {}, refunds: [], events: [], idem: {} };
const prices = {
  [PRICE_FOUNDING]: { id: PRICE_FOUNDING, object: 'price', active: true, livemode: false, currency: 'usd', unit_amount: 3000, type: 'one_time', recurring: null, product: 'prod_mock_founding' },
  [PRICE_STANDARD]: { id: PRICE_STANDARD, object: 'price', active: true, livemode: false, currency: 'usd', unit_amount: 3000, type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, product: 'prod_mock_standard' },
};

// --- Stripe-style form bodies (a[b][0][c]=x) -----------------------------------------------------------
function parseForm(text) {
  const out = {};
  for (const [rawK, v] of new URLSearchParams(text)) {
    const keys = rawK.replace(/\]/g, '').split('[');
    let o = out;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) o[k] = v;
      else o = o[k] ??= {};
    });
  }
  const arrays = (o) => {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) o[k] = arrays(o[k]);
      const ks = Object.keys(o);
      if (ks.length && ks.every((k, i) => String(i) === k)) return ks.map((k) => o[k]);
    }
    return o;
  };
  return arrays(out);
}

// --- Webhooks (signed exactly like Stripe's) ----------------------------------------------------------
let queue = Promise.resolve();
function emit(type, object) {
  const event = { id: newId('evt'), object: 'event', api_version: Stripe.API_VERSION, created: now(), livemode: false, type, data: { object: structuredClone(object) }, pending_webhooks: 1 };
  db.events.push(event);
  deliver(event);
  return event;
}
function deliver(event) {
  queue = queue.then(async () => {
    const payload = JSON.stringify(event);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    try {
      const res = await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
      event.delivery = res.status;
    } catch {
      event.delivery = 'unreachable';
    }
  });
  return queue;
}

// --- Objects ---------------------------------------------------------------------------------------------
const subscriptionItems = (sub, priceId, periodEnd) => ({ object: 'list', data: [{ id: newId('si'), object: 'subscription_item', price: prices[priceId], quantity: 1, current_period_start: now(), current_period_end: periodEnd }] });
const setPeriodEnd = (sub, t) => { for (const i of sub.items.data) i.current_period_end = t; };
const hasCard = (sub) => Boolean(sub.default_payment_method || db.customers[sub.customer]?.invoice_settings.default_payment_method);
function invoice(sub, paid) {
  return { id: newId('in'), object: 'invoice', customer: sub.customer, amount_paid: paid ? 3000 : 0, amount_due: 3000, currency: 'usd', status: paid ? 'paid' : 'open',
           parent: { type: 'subscription_details', subscription_details: { subscription: sub.id } }, livemode: false };
}
function sessionView(s, expand) {
  const v = structuredClone(s);
  if (!expand.includes('line_items')) delete v.line_items;
  return v;
}

function createSession(p) {
  const line = p.line_items?.[0];
  const price = line ? prices[line.price] : null;
  if (line && !price) throw Object.assign(new Error(`No such price: '${line.price}'`), { status: 400 });
  const id = newId('cs_test');
  const s = {
    id, object: 'checkout.session', livemode: false, mode: p.mode, status: 'open', payment_status: p.mode === 'setup' ? 'no_payment_required' : 'unpaid',
    customer: p.customer ?? null, client_reference_id: p.client_reference_id ?? null, metadata: p.metadata ?? {},
    amount_total: price ? price.unit_amount * Number(line.quantity ?? 1) : null, currency: price ? price.currency : (p.currency ?? null),
    expires_at: Number(p.expires_at ?? now() + 86400), success_url: p.success_url, cancel_url: p.cancel_url,
    payment_method_collection: p.payment_method_collection ?? 'always', subscription_data: p.subscription_data ?? null,
    payment_intent: null, subscription: null, setup_intent: null, url: `${BASE}/pay/${id}`, custom_text: p.custom_text ?? null,
    line_items: { object: 'list', data: line ? [{ id: newId('li'), object: 'item', price, quantity: Number(line.quantity ?? 1), amount_total: price.unit_amount }] : [] },
  };
  if (s.mode === 'payment' && s.expires_at < now() + 1800) throw Object.assign(new Error('expires_at must be at least 30 minutes from now'), { status: 400 });
  db.sessions[id] = s;
  return s;
}

function completeSession(s, action) {
  if (s.status !== 'open') return { error: `This checkout is ${s.status}.` };
  if (s.expires_at < now()) return { error: 'This checkout expired.' };
  const card = action === 'card' || action === 'pay';
  if (action === 'declined') return { error: 'Your card was declined (test card 4000 0000 0000 0002). Nothing was charged.' };
  const customer = db.customers[s.customer];
  const pm = card ? newId('pm_card_visa') : null;
  if (s.mode === 'payment') {
    s.payment_intent = newId('pi');
    s.payment_status = 'paid';
    db.charges[s.payment_intent] = { id: newId('ch'), object: 'charge', payment_intent: s.payment_intent, amount: s.amount_total, currency: s.currency, livemode: false };
  } else if (s.mode === 'subscription') {
    const trialEnd = s.subscription_data?.trial_end ? Number(s.subscription_data.trial_end)
      : s.subscription_data?.trial_period_days ? now() + Number(s.subscription_data.trial_period_days) * 86400 : null;
    const trialDays = trialEnd ? 1 : 0;
    if (!card && s.payment_method_collection !== 'if_required') return { error: 'A card is required.' };
    if (!trialDays && !card) return { error: 'A card is required for this subscription.' };
    const sub = {
      id: newId('sub'), object: 'subscription', livemode: false, customer: s.customer, status: trialDays ? 'trialing' : 'active',
      trial_end: trialEnd, cancel_at_period_end: false, cancel_at: null, canceled_at: null,
      default_payment_method: pm, metadata: s.subscription_data?.metadata ?? {}, trial_settings: s.subscription_data?.trial_settings ?? null,
    };
    sub.items = subscriptionItems(sub, s.line_items.data[0].price.id, trialDays ? sub.trial_end : now() + 30 * 86400);
    db.subscriptions[sub.id] = sub;
    s.subscription = sub.id;
    s.payment_status = trialDays ? 'no_payment_required' : 'paid';
    if (pm && customer) customer.invoice_settings.default_payment_method = pm;
    emit('customer.subscription.created', sub);
    if (!trialDays) emit('invoice.paid', invoice(sub, true));
  } else if (s.mode === 'setup') {
    if (!card) return { error: 'Enter a card.' };
    const si = { id: newId('seti'), object: 'setup_intent', payment_method: pm, customer: s.customer, status: 'succeeded' };
    db.setupIntents[si.id] = si;
    s.setup_intent = si.id;
  }
  s.status = 'complete';
  emit('checkout.session.completed', sessionView(s, []));
  return { redirect: s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id) };
}

function expireSession(s) {
  if (s.status === 'open') {
    s.status = 'expired';
    emit('checkout.session.expired', sessionView(s, []));
  }
  return s;
}

function cancelSubscription(sub) {
  if (sub.status !== 'canceled') {
    sub.status = 'canceled';
    sub.canceled_at = now();
    emit('customer.subscription.deleted', sub);
  }
  return sub;
}

// --- Stripe API (/v1) ------------------------------------------------------------------------------------
function api(method, path, p, query) {
  const expand = [].concat(query.getAll('expand[]'), query.getAll('expand[0]'), p.expand ?? []).flat();
  let m;
  const notFound = (what) => { throw Object.assign(new Error(`No such ${what}`), { status: 404 }); };
  if (method === 'POST' && path === '/v1/customers') {
    const c = { id: newId('cus'), object: 'customer', livemode: false, email: p.email ?? null, name: p.name ?? null, metadata: p.metadata ?? {}, invoice_settings: { default_payment_method: null }, deleted: false };
    return (db.customers[c.id] = c);
  }
  if ((m = path.match(/^\/v1\/customers\/([^/]+)$/))) {
    const c = db.customers[m[1]] ?? notFound('customer');
    if (method === 'POST' && p.invoice_settings?.default_payment_method) c.invoice_settings.default_payment_method = p.invoice_settings.default_payment_method;
    return c;
  }
  if ((m = path.match(/^\/v1\/prices\/([^/]+)$/))) return prices[m[1]] ?? notFound('price');
  if (method === 'GET' && path === '/v1/prices') {
    const keys = [...query.entries()].filter(([k]) => k.startsWith('lookup_keys')).map(([, v]) => v);
    return { object: 'list', data: Object.values(prices).filter((x) => !keys.length || keys.includes(x.lookup_key)), has_more: false };
  }
  if (method === 'POST' && path === '/v1/products') {
    const prod = { id: newId('prod'), object: 'product', livemode: false, active: true, name: p.name, description: p.description ?? null, metadata: p.metadata ?? {} };
    return (db.products ??= {})[prod.id] = prod;
  }
  if (method === 'POST' && path === '/v1/prices') {
    const price = { id: newId('price'), object: 'price', livemode: false, active: true, product: p.product, currency: p.currency, unit_amount: Number(p.unit_amount),
      type: p.recurring ? 'recurring' : 'one_time', recurring: p.recurring ? { interval: p.recurring.interval, interval_count: Number(p.recurring.interval_count ?? 1) } : null,
      lookup_key: p.lookup_key ?? null, nickname: p.nickname ?? null, metadata: p.metadata ?? {} };
    return (prices[price.id] = price);
  }
  if (method === 'POST' && path === '/v1/checkout/sessions') return sessionView(createSession(p), []);
  if ((m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)\/line_items$/))) return (db.sessions[m[1]] ?? notFound('checkout session')).line_items;
  if ((m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/))) {
    const s = db.sessions[m[1]] ?? notFound('checkout session');
    if (s.status === 'complete') throw Object.assign(new Error('Only open sessions can be expired'), { status: 400 });
    return sessionView(expireSession(s), []);
  }
  if ((m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/))) return sessionView(db.sessions[m[1]] ?? notFound('checkout session'), expand);
  if ((m = path.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
    const sub = db.subscriptions[m[1]] ?? notFound('subscription');
    if (method === 'DELETE') return cancelSubscription(sub);
    if (method === 'POST') {
      if (p.default_payment_method) sub.default_payment_method = p.default_payment_method;
      if (p.cancel_at_period_end !== undefined) sub.cancel_at_period_end = p.cancel_at_period_end === 'true';
      emit('customer.subscription.updated', sub);
    }
    return sub;
  }
  if ((m = path.match(/^\/v1\/setup_intents\/([^/]+)$/))) return db.setupIntents[m[1]] ?? notFound('setup intent');
  if (method === 'POST' && path === '/v1/billing_portal/sessions') {
    if (!db.customers[p.customer]) notFound('customer');
    return { id: newId('bps'), object: 'billing_portal.session', customer: p.customer, return_url: p.return_url, url: `${BASE}/portal/${p.customer}?return=${encodeURIComponent(p.return_url)}` };
  }
  if (method === 'POST' && path === '/v1/refunds') {
    const charge = db.charges[p.payment_intent] ?? notFound('payment intent');
    const r = { id: newId('re'), object: 'refund', payment_intent: p.payment_intent, amount: charge.amount, status: 'succeeded', metadata: p.metadata ?? {} };
    db.refunds.push(r);
    emit('charge.refunded', { ...charge, refunded: true });
    return r;
  }
  throw Object.assign(new Error(`Unrecognized request URL (${method}: ${path})`), { status: 404 });
}

// --- Hosted pages ----------------------------------------------------------------------------------------
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}.flag{background:#fff4ce;padding:.5rem .75rem;border-radius:6px;font-size:14px}
button{display:block;width:100%;margin:.5rem 0;padding:.75rem;font:inherit;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer}button.primary{background:#635bff;color:#fff;border-color:#635bff}.err{color:#b00020}</style></head>
<body><p class="flag">Simulated Stripe (local test stand-in) — no real card or payment.</p>${body}</body></html>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function checkoutPage(s, error) {
  const trial = s.mode === 'subscription' && Boolean(s.subscription_data?.trial_end || s.subscription_data?.trial_period_days);
  const trialEnd = trial && s.subscription_data.trial_end ? new Date(Number(s.subscription_data.trial_end) * 1000).toUTCString() : null;
  const title = s.mode === 'payment' ? 'Founding 5 — $30.00 once' : s.mode === 'setup' ? 'Save a card' : trial ? 'Standard — free trial, then $30.00/month' : 'Standard — $30.00/month';
  const buttons =
    s.mode === 'payment' ? `<button class="primary" name="action" value="pay">Pay $30.00 (test card 4242)</button><button name="action" value="declined">Use a declined test card</button>`
    : s.mode === 'setup' ? `<button class="primary" name="action" value="card">Save test card 4242</button><button name="action" value="declined">Use a declined test card</button>`
    : trial && s.payment_method_collection === 'if_required' ? `<button class="primary" name="action" value="trial">Start free trial (no card)</button><button name="action" value="card">Start trial and save test card 4242</button>`
    : trial ? `<p>Due today: <strong>$0.00</strong>${trialEnd ? ` · then $30.00/month starting ${esc(trialEnd)}` : ''}</p><button class="primary" name="action" value="card">Start trial (test card 4242)</button><button name="action" value="declined">Use a declined test card</button>`
    : `<button class="primary" name="action" value="card">Subscribe — pay $30.00 (test card 4242)</button><button name="action" value="declined">Use a declined test card</button>`;
  return page(title, `<h1>${title}</h1>${s.custom_text?.submit?.message ? `<p>${esc(s.custom_text.submit.message)}</p>` : ''}
    ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/pay/${s.id}">${buttons}</form><p><a href="${esc(s.cancel_url)}">Back to DetailerHQ</a></p>`);
}

function portalPage(customerId, back, note) {
  const subs = Object.values(db.subscriptions).filter((s) => s.customer === customerId);
  const live = subs.filter((s) => s.status !== 'canceled').at(-1);
  const body = live
    ? `<p>Plan: DetailerHQ Standard — $30.00/month · status <strong>${live.status}</strong>${live.cancel_at_period_end ? ' · cancels at period end' : ''}</p>
       <form method="post">${live.cancel_at_period_end ? '<button class="primary" name="action" value="reactivate">Renew subscription</button>' : '<button name="action" value="cancel">Cancel subscription</button>'}
       <button name="action" value="card">Update payment method (test card 4242)</button></form>`
    : '<p>No active subscription. Invoices and receipts appear here.</p>';
  return page('Billing', `<h1>Manage billing</h1>${note ? `<p role="status">${esc(note)}</p>` : ''}${body}<p><a href="${esc(back)}">Return to DetailerHQ</a></p>`);
}

// --- Test controls ------------------------------------------------------------------------------------------
function control(path) {
  let m;
  if ((m = path.match(/^\/_test\/subscriptions\/([^/]+)\/(trial_end|payment_failed|card_expired|card_updated|recover|period_end)$/))) {
    const sub = db.subscriptions[m[1]];
    if (!sub) return { status: 404, body: { error: 'no such subscription' } };
    const step = m[2];
    if (step === 'trial_end') {
      if (!hasCard(sub)) return { body: cancelSubscription(sub) }; // trial_settings: cancel without a payment method
      sub.status = 'active'; sub.trial_end = now() - 1; setPeriodEnd(sub, now() + 30 * 86400);
      emit('invoice.paid', invoice(sub, true));
    } else if (step === 'payment_failed' || step === 'card_expired') {
      // A renewal (or the first charge after the trial) is declined — e.g. insufficient funds or an expired card.
      sub.status = 'past_due';
      emit('invoice.payment_failed', { ...invoice(sub, false), last_finalization_error: null, decline: step === 'card_expired' ? 'expired_card' : 'card_declined' });
    } else if (step === 'card_updated') {
      // The card network updated an expiring card (Stripe's automatic card updater).
      const pm = sub.default_payment_method ?? db.customers[sub.customer]?.invoice_settings.default_payment_method;
      emit('payment_method.automatically_updated', { id: pm ?? newId('pm_card_visa'), object: 'payment_method', customer: sub.customer, card: { exp_year: 2031 } });
    } else if (step === 'recover') {
      sub.status = 'active';
      emit('invoice.paid', invoice(sub, true));
    } else if (step === 'period_end') {
      if (sub.cancel_at_period_end) return { body: cancelSubscription(sub) };
      setPeriodEnd(sub, now() + 30 * 86400);
      emit('invoice.paid', invoice(sub, true));
    }
    emit('customer.subscription.updated', sub);
    return { body: sub };
  }
  if ((m = path.match(/^\/_test\/sessions\/([^/]+)\/expire$/))) {
    const s = db.sessions[m[1]];
    return s ? { body: expireSession(s) } : { status: 404, body: { error: 'no such session' } };
  }
  if ((m = path.match(/^\/_test\/replay\/([^/]+)$/))) {
    const e = db.events.find((x) => x.id === m[1]);
    if (!e) return { status: 404, body: { error: 'no such event' } };
    deliver(e);
    return { body: { replayed: e.id } };
  }
  if ((m = path.match(/^\/_test\/refund\/([^/]+)$/))) return { body: api('POST', '/v1/refunds', { payment_intent: m[1] }, new URLSearchParams()) };
  return { status: 404, body: { error: 'unknown control' } };
}

// --- Server --------------------------------------------------------------------------------------------------
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'request-id': newId('req') }); res.end(JSON.stringify(body)); };
    const html = (status, body) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    try {
      if (url.pathname.startsWith('/v1/')) {
        if (!/^Bearer (sk|rk)_test_/.test(req.headers.authorization ?? '')) return json(401, { error: { type: 'invalid_request_error', message: 'Invalid API Key (test keys only)' } });
        const key = req.headers['idempotency-key'];
        if (req.method === 'POST' && key && db.idem[key]) return json(200, db.idem[key]);
        const out = api(req.method, url.pathname, parseForm(raw), url.searchParams);
        if (req.method === 'POST' && key) db.idem[key] = out;
        return json(200, out);
      }
      let m;
      if ((m = url.pathname.match(/^\/pay\/([^/]+)$/))) {
        const s = db.sessions[m[1]];
        if (!s) return html(404, page('Not found', '<p>This checkout doesn’t exist.</p>'));
        if (req.method === 'GET') return html(200, s.status === 'open' ? checkoutPage(s) : page('Checkout', `<p>This checkout is ${s.status}.</p><p><a href="${esc(s.cancel_url)}">Back to DetailerHQ</a></p>`));
        const result = completeSession(s, new URLSearchParams(raw).get('action'));
        if (result.error) return html(402, checkoutPage(s, result.error));
        await queue; // like Stripe, the completion event is usually delivered around the redirect
        res.writeHead(303, { location: result.redirect });
        return res.end();
      }
      if ((m = url.pathname.match(/^\/portal\/([^/]+)$/))) {
        const back = url.searchParams.get('return') ?? '/';
        let note = '';
        if (req.method === 'POST') {
          const action = new URLSearchParams(raw).get('action');
          const live = Object.values(db.subscriptions).filter((s) => s.customer === m[1] && s.status !== 'canceled').at(-1);
          if (live && action === 'cancel') { live.cancel_at_period_end = true; note = 'Your subscription will end at the end of the current period.'; emit('customer.subscription.updated', live); }
          if (live && action === 'reactivate') { live.cancel_at_period_end = false; note = 'Your subscription will continue.'; emit('customer.subscription.updated', live); }
          if (live && action === 'card') { live.default_payment_method = newId('pm_card_visa'); db.customers[m[1]].invoice_settings.default_payment_method = live.default_payment_method; note = 'Payment method saved.'; emit('customer.subscription.updated', live); }
          await queue;
        }
        return html(200, portalPage(m[1], back, note));
      }
      if (url.pathname === '/_test/state') return json(200, db);
      if (url.pathname.startsWith('/_test/') && req.method === 'POST') {
        const r = control(url.pathname);
        await queue;
        return json(r.status ?? 200, r.body);
      }
      return json(404, { error: 'not found' });
    } catch (e) {
      return json(e.status ?? 500, { error: { type: 'invalid_request_error', message: e.message } });
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`dev-stripe-mock: ${BASE} → webhooks to ${WEBHOOK_URL}${SECRET ? '' : ' (no STRIPE_WEBHOOK_SECRET: deliveries will be refused)'}`));
