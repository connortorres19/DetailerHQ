import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { cleanup, db } from './support';
import { asVisitor, bookableBusiness, fillDetails, pickFirstTime } from './support-booking';

// Phase 7 email, end to end against the server's MOCK providers (EMAIL_TRANSPORT=mock, local only):
// Google/Microsoft OAuth + Gmail/Graph sending are simulated by /api/dev/email-mock, SMTP goes to the
// local dev mail sink (scripts/dev-mail-sink.mjs). No real provider is contacted — real-provider
// testing needs real OAuth apps and accounts (see docs/PHASE7_EMAIL.md).

test.afterAll(cleanup);

type Mail = { from: string; to: string[]; subject: string; html: string; headers: string };
const SINK = 'http://127.0.0.1:54330/messages';
const tag = () => randomUUID().slice(0, 8);

async function mailTo(address: string, subject?: RegExp, timeout = 20_000): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      async () => {
        const all = await inbox();
        found = all.filter((m) => m.to.includes(address) && (!subject || subject.test(m.subject))).at(-1);
        return Boolean(found);
      },
      { timeout, message: `email to ${address}${subject ? ` matching ${subject}` : ''}` },
    )
    .toBe(true);
  return found!;
}
// Subjects with non-ASCII characters arrive MIME-encoded (RFC 2047); decode them for matching.
const decodeHeader = (v: string) =>
  v.replace(/\?=\s+=\?/g, '?==?').replace(/=\?utf-8\?([qb])\?([^?]*)\?=/gi, (_, enc: string, text: string) =>
    enc.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64').toString('utf8')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
  );
const inbox = async () => ((await (await fetch(SINK)).json()) as Mail[]).map((m) => ({ ...m, subject: decodeHeader(m.subject) }));
const mailsTo = async (address: string) => (await inbox()).filter((m) => m.to.includes(address));
const link = (m: Mail, path: string) => m.html.match(new RegExp(`href="(https?://[^"]*${path}[^"]*)"`))?.[1]?.replace(/&amp;/g, '&') ?? null;
const runWorker = async () => {
  const secret = (await import('node:fs')).readFileSync('.env.local', 'utf8').match(/^EMAIL_WORKER_SECRET=(.+)$/m)![1];
  return fetch('http://localhost:3000/api/email/worker', { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
};
const outbox = async (businessId: string) =>
  (await db.query('select template, status, recipient, attempts, last_error from public.email_outbox where business_id = $1 order by created_at', [businessId])).rows;

async function connectOAuth(page: Page, provider: 'Gmail or Google Workspace' | 'Outlook or Microsoft 365', mailbox: string) {
  await page.goto('/app/settings/notifications');
  await page.getByRole('link', { name: `Connect ${provider}` }).click();
  await expect(page.getByRole('heading', { name: /Mock (Google|Microsoft) sign-in/ })).toBeVisible();
  await page.getByLabel('Mailbox').fill(mailbox);
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByText(/Email connected and verified/)).toBeVisible();
}

async function bookAsVisitor(visitor: Page, slug: string, email: string) {
  await visitor.goto(`/book/${slug}`);
  await visitor.getByRole('radio', { name: /^Car/ }).check();
  await visitor.getByRole('radio', { name: /^Full detail/ }).check();
  await pickFirstTime(visitor);
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await fillDetails(visitor, { Email: email });
  await visitor.getByRole('button', { name: 'Review' }).click();
  await visitor.getByLabel(/may contact me/).check();
  await visitor.getByRole('button', { name: 'Send request' }).click();
  await expect(visitor.getByText(/Request sent to/)).toBeVisible();
}

test('Gmail (mock OAuth): connect, verified by a test email, booking emails with working links, disconnect', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const biz = await bookableBusiness(page, 'mailg');
  // Not connected: everything works; the dashboard suggests connecting.
  await page.goto('/app');
  await expect(page.getByText(/Connect your email account to send booking confirmations/)).toBeVisible();

  const mailbox = `shop-${tag()}@gmail.example.com`;
  await connectOAuth(page, 'Gmail or Google Workspace', mailbox);
  await expect(page.getByText(mailbox)).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const testMail = await mailTo(biz.email, /Test email from DetailerHQ/);
  expect(testMail.from).toBe(mailbox);
  const { rows: [conn] } = await db.query('select status, provider, octet_length(secret) as n, encode(secret, $2) as s from public.email_connections where business_id = $1', [biz.businessId, 'escape']);
  expect(conn).toMatchObject({ status: 'verified', provider: 'google' });
  expect(conn.s).not.toMatch(/refresh|token|[0-9a-f]{32}/); // only ciphertext stored

  // A customer requests a booking: they get "request received" with a working status link; the owner is told.
  const customer = `cust-${tag()}@example.com`;
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await bookAsVisitor(visitor, biz.slug, customer);
  const received = await mailTo(customer, /We received your booking request/);
  expect(received.from).toBe(mailbox);
  expect(received.html).toContain('Full detail');
  const statusUrl = link(received, '/r/');
  expect(statusUrl).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);
  await visitor.goto(new URL(statusUrl!).pathname);
  await expect(visitor.getByRole('heading', { name: /not confirmed yet/ })).toBeVisible();
  await mailTo(biz.email, /New booking request from Jordan Reyes/);

  // The owner approves: the customer gets the confirmation.
  await page.goto('/app/bookings');
  await page.getByRole('link', { name: /Jordan Reyes/ }).first().click();
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await page.getByRole('form', { name: 'Confirm booking' }).getByRole('button', { name: 'Confirm booking' }).click();
  const confirmed = await mailTo(customer, /Your appointment is confirmed/);
  expect(confirmed.html).not.toMatch(/internal|decline_reason/i);
  // Exactly one of each (no duplicates even with the scheduler running too).
  await runWorker();
  expect((await mailsTo(customer)).map((m) => m.subject).sort()).toEqual(['We received your booking request', 'Your appointment is confirmed']);
  // A reminder is scheduled only when the appointment is more than 24 hours away.
  const { rows: [appt] } = await db.query("select starts_at > now() + interval '24 hours 5 minutes' as far from public.appointments where business_id = $1", [biz.businessId]);
  expect((await outbox(biz.businessId)).filter((r) => r.template === 'appointment_reminder')).toHaveLength(appt.far ? 1 : 0);

  // Activity shows what went out.
  await page.goto('/app/settings/notifications');
  const activity = page.getByRole('list', { name: 'Email activity' });
  await expect(activity).toContainText('Booking confirmed');
  if (appt.far) await expect(activity).toContainText('Appointment reminder');

  // Disconnect: asks first; credentials deleted; waiting emails cancelled; the reminder banner returns.
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('group', { name: 'Disconnect email' }).getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByText(/Email disconnected/)).toBeVisible();
  expect((await db.query('select count(*)::int as n from public.email_connections where business_id = $1', [biz.businessId])).rows[0].n).toBe(0);
  if (appt.far) expect((await outbox(biz.businessId)).find((r) => r.template === 'appointment_reminder')?.status).toBe('skipped');
});

test('Outlook (mock OAuth): revoked access holds emails, the dashboard asks to reconnect, reconnecting sends them', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const biz = await bookableBusiness(page, 'mailms');
  const mailbox = `shop-${tag()}@outlook.example.com`;
  await connectOAuth(page, 'Outlook or Microsoft 365', mailbox);
  await mailTo(biz.email, /Test email from DetailerHQ/);

  // The owner removes DetailerHQ's access at Microsoft.
  await fetch('http://localhost:3000/api/dev/email-mock/control', { method: 'POST', body: JSON.stringify({ action: 'revoke-all', email: mailbox }) });
  const customer = `held-${tag()}@example.com`;
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await bookAsVisitor(visitor, biz.slug, customer); // the booking itself still works
  await expect.poll(async () => (await db.query('select status from public.email_connections where business_id = $1', [biz.businessId])).rows[0]?.status, { timeout: 20_000 }).toBe('needs_attention');
  expect((await outbox(biz.businessId)).filter((r) => r.template === 'request_received').map((r) => r.status)).toEqual(['held']);
  expect(await mailsTo(customer)).toHaveLength(0);

  await page.goto('/app');
  await expect(page.getByText(/Your email needs attention/)).toBeVisible();
  await page.goto('/app/settings/notifications');
  await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
  await expect(page.getByText(/Emails are on hold/)).toBeVisible();

  // Reconnect → verified again → the held email goes out.
  await page.getByRole('link', { name: 'Reconnect' }).click();
  await page.getByLabel('Mailbox').fill(mailbox);
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByText(/Email connected and verified/)).toBeVisible();
  await runWorker();
  await mailTo(customer, /We received your booking request/);
});

test('SMTP (own domain): wrong password refused, code verification, failures visible with retry, quote email + unsubscribe', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const biz = await bookableBusiness(page, 'mailsmtp');
  const from = `hello-${tag()}@detailshop.example.com`;
  await page.goto('/app/settings/notifications');
  await page.getByText('Use another email address').click();
  const fillSmtp = async (password: string) => {
    await page.getByLabel('Send from (email address)').fill(from);
    await page.getByLabel('SMTP server').fill('localhost');
    await page.getByLabel('Port').selectOption('2525');
    await page.getByLabel('Username').fill(from);
    await page.getByLabel('Password or app password').fill(password);
    await page.getByRole('button', { name: 'Connect and send code' }).click();
  };
  // Private network hosts are refused in production; this local test server allows them (EMAIL_ALLOW_PRIVATE_SMTP).
  await fillSmtp('wrong-password');
  await expect(page.getByText(/The mail server refused the login/)).toBeVisible();
  await fillSmtp('app-password-123');
  await expect(page.getByText(/Enter the 6-digit code we emailed to/)).toBeVisible();
  const codeMail = await mailTo(from, /Your DetailerHQ code/);
  const code = codeMail.subject.match(/(\d{6})/)![1]!;
  await page.getByLabel('Verification code').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code isn’t right.').first()).toBeVisible();
  await page.getByLabel('Verification code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText(/Email connected and verified/)).toBeVisible();
  const { rows: [conn] } = await db.query("select status, encode(secret, 'escape') as s from public.email_connections where business_id = $1", [biz.businessId]);
  expect(conn.status).toBe('verified');
  expect(conn.s).not.toContain('app-password-123'); // encrypted

  // A permanently undeliverable address fails visibly; a busy one is retried with backoff.
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  const bounce = `nobody+bounce-${tag()}@example.com`;
  await bookAsVisitor(visitor, biz.slug, bounce);
  await expect.poll(async () => (await outbox(biz.businessId)).find((r) => r.recipient === bounce)?.status, { timeout: 20_000 }).toBe('failed');
  const busy = `someone+busy-${tag()}@example.com`;
  await visitor.context().clearCookies();
  await asVisitor(visitor);
  await bookAsVisitor(visitor, biz.slug, busy);
  // The temporary failure is retried later (backoff), not marked failed.
  await expect
    .poll(async () => (await db.query('select status, attempts, next_attempt_at > now() + $2::interval as later from public.email_outbox where business_id = $1 and recipient = $3', [biz.businessId, '30 seconds', busy])).rows[0], { timeout: 20_000 })
    .toEqual({ status: 'queued', attempts: 1, later: true });

  await page.goto('/app');
  await expect(page.getByText(/1 email failed to send this week/)).toBeVisible();
  await page.getByRole('link', { name: 'Review' }).click();
  const failedRow = page.getByRole('list', { name: 'Email activity' }).getByRole('listitem').filter({ hasText: bounce });
  await expect(failedRow).toContainText('Failed');
  await expect(failedRow).toContainText(/rejected the message \(550\)/);
  await failedRow.getByRole('button', { name: /^Retry/ }).click();
  await expect.poll(async () => (await outbox(biz.businessId)).find((r) => r.recipient === bounce)?.attempts, { timeout: 15_000 }).toBeGreaterThan(1);

  // Quotes: the email carries the secure quote link; an expired quote's follow-up can be unsubscribed from.
  const quoteTo = `quote-${tag()}@example.com`;
  const { rows: [cust] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164, email) values ($1, 'Quinn', '+15125550801', $2) returning id`, [biz.businessId, quoteTo]);
  await page.goto(`/app/quotes/new?customer=${cust.id}`);
  await page.getByLabel('Make').fill('Ford');
  await page.getByLabel('Model').fill('F-150');
  await page.getByRole('button', { name: 'Add custom line' }).click();
  await page.getByLabel('Line 1 name').fill('Ceramic coating');
  await page.getByRole('listitem', { name: 'Line 1' }).getByLabel('Price ($)').fill('900');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Send quote' }).click();
  await expect(page.getByText('Quote sent.')).toBeVisible();
  const quoteMail = await mailTo(quoteTo, /Your quote from/);
  const quoteUrl = link(quoteMail, '/q/');
  expect(quoteUrl).toBeTruthy();
  await visitor.goto(new URL(quoteUrl!).pathname);
  await expect(visitor.getByRole('article', { name: /Quote #/ })).toContainText('Ceramic coating');
  expect(quoteMail.html).not.toContain('Unsubscribe'); // transactional: no unsubscribe

  // The quote passes its date unanswered (as the daily expiry job records it): a follow-up goes out.
  await db.query(`update public.quotes set valid_until = current_date - 2, status = 'expired' where business_id = $1 and status = 'sent'`, [biz.businessId]);
  await runWorker();
  const expired = await mailTo(quoteTo, /Your quote has expired/, 30_000);
  expect(expired.headers).toMatch(/List-Unsubscribe:\s+<https?:\/\/[^>]+\/api\/email\/unsubscribe\//); // may be folded
  expect(expired.headers).toMatch(/List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  const unsub = link(expired, '/u/');
  await visitor.goto(new URL(unsub!).pathname);
  await expect(visitor.getByRole('heading', { name: /Quote reminders from Northside Detail Co\./ })).toBeVisible();
  await visitor.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(visitor.getByText(/You’re unsubscribed from quote follow-up emails/)).toBeVisible();
  expect((await db.query('select count(*)::int as n from public.email_suppressions where business_id = $1 and email = $2', [biz.businessId, quoteTo])).rows[0].n).toBe(1);
  expect((await visitor.goto('/u/forged.token'))?.status()).toBe(404);
});

test('templates: edit with a live desktop/phone preview; the next email uses it; reset to default; preferences saved', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const biz = await bookableBusiness(page, 'mailtpl');
  await connectOAuth(page, 'Gmail or Google Workspace', `shop-${tag()}@gmail.example.com`);
  await page.getByRole('link', { name: 'Edit Booking request received email' }).click();
  const subject = page.getByLabel('Subject');
  await subject.fill('Thanks {{customer_first_name}} — {{business_name}} got your request');
  await expect(page.getByTestId('preview-subject')).toContainText('Thanks Jordan — Northside Detail Co. got your request');
  await page.getByLabel('Opening message').fill('We read every request personally. <script>alert(1)</script>');
  const frame = page.frameLocator('iframe[title="Email preview"]');
  await expect(frame.locator('body')).toContainText('We read every request personally. <script>alert(1)</script>'); // shown as text, never run
  await page.getByRole('button', { name: 'Phone' }).click();
  await expect(page.locator('iframe[title="Email preview"]')).toHaveAttribute('data-width', 'mobile');
  await subject.fill('Hi {{customer_name}}');
  await expect(page.getByText('Unknown placeholder: {{customer_name}}.')).toBeVisible();
  await subject.fill('Thanks {{customer_first_name}} — {{business_name}} got your request');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByText('Email saved.')).toBeVisible();

  const customer = `tpl-${tag()}@example.com`;
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await bookAsVisitor(visitor, biz.slug, customer);
  const mail = await mailTo(customer, /Thanks Jordan — Northside Detail Co\. got your request/);
  const htmlPart = mail.html.slice(mail.html.indexOf('<!doctype html>'));
  expect(htmlPart).toContain('We read every request personally. &lt;script&gt;'); // escaped in HTML
  expect(htmlPart).not.toContain('<script>');

  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.getByText('Email saved.')).toBeVisible();
  await expect(subject).toHaveValue('');

  // Customer email switches, reminder timing and owner preferences save.
  await page.goto('/app/settings/notifications');
  await page.getByLabel(/Quote expiring soon/).uncheck();
  await page.getByLabel('2 days before').check();
  await page.getByRole('button', { name: 'Save customer emails' }).click();
  await expect(page.getByText('Customer emails saved.')).toBeVisible();
  expect((await db.query('select reminder_hours from public.email_settings where business_id = $1', [biz.businessId])).rows[0].reminder_hours.sort()).toEqual([24, 48]);
  await page.getByLabel(/New booking requests/).uncheck();
  await page.getByLabel('Send daily emails at').selectOption('6');
  await page.getByRole('button', { name: 'Save my notifications' }).click();
  await expect(page.getByText('Your notifications are saved.')).toBeVisible();
  expect((await db.query('select prefs, summary_hour from public.email_owner_prefs where business_id = $1', [biz.businessId])).rows[0]).toMatchObject({ summary_hour: 6, prefs: { owner_new_request: false } });
});

test('isolation and OAuth safety: another business sees nothing; forged or replayed callbacks are refused', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const a = await bookableBusiness(page, 'mailisoA');
  await connectOAuth(page, 'Gmail or Google Workspace', `a-${tag()}@gmail.example.com`);
  const pageB = await (await browser.newContext()).newPage();
  const b = await bookableBusiness(pageB, 'mailisoB', { name: 'Bravo Detailing' });
  await pageB.goto('/app/settings/notifications');
  await expect(pageB.getByRole('link', { name: 'Connect Gmail or Google Workspace' })).toBeVisible(); // B has no connection
  await expect(pageB.getByRole('list', { name: 'Email activity' })).toHaveCount(0);
  expect((await db.query('select count(*)::int as n from public.email_outbox where business_id = $1', [b.businessId])).rows[0].n).toBe(0);

  // A callback without the signed cookie (or with a different state) is refused.
  expect(new URL((await pageB.goto('/app/settings/notifications/callback/google?code=x&state=forged'))!.url()).searchParams.get('email')).toBe('invalid_state');
  await expect(pageB.getByText(/sign-in link expired or didn’t match/)).toBeVisible();
  // Starting a flow in B, then replaying A's state, is refused too.
  await pageB.goto('/app/settings/notifications');
  await pageB.getByRole('link', { name: 'Connect Gmail or Google Workspace' }).click();
  const consentUrl = new URL(pageB.url());
  await pageB.goto(`/app/settings/notifications/callback/google?code=stolen&state=${consentUrl.searchParams.get('state')}x`);
  await expect(pageB.getByText(/sign-in link expired or didn’t match/)).toBeVisible();
  // Denying access connects nothing.
  await pageB.goto('/app/settings/notifications/connect/google');
  await pageB.getByRole('button', { name: 'Deny' }).click();
  await expect(pageB.getByText('Access wasn’t granted, so nothing was connected.')).toBeVisible();
  expect((await db.query('select count(*)::int as n from public.email_connections where business_id = $1', [b.businessId])).rows[0].n).toBe(0);
  // The worker route needs the secret.
  expect((await fetch('http://localhost:3000/api/email/worker', { method: 'POST' })).status).toBe(404);
  // Credentials are bound to their business: A's encrypted token copied into B's row can't be used.
  await db.query(
    `insert into public.email_connections (business_id, provider, from_address, secret, status, verified_at)
     select $2, provider, 'stolen@gmail.example.com', secret, 'verified', now() from public.email_connections where business_id = $1`, [a.businessId, b.businessId]);
  const { rows: [{ email: ownerB }] } = await db.query('select u.email from auth.users u join public.memberships m on m.user_id = u.id where m.business_id = $1', [b.businessId]);
  await db.query(`insert into public.email_outbox (business_id, template, category, recipient, idempotency_key) values ($1, 'connection_test', 'system', $2, $3)`, [b.businessId, ownerB, `stolen-${b.businessId}`]);
  await runWorker();
  const { rows: [stolen] } = await db.query('select status, last_error from public.email_outbox where idempotency_key = $1', [`stolen-${b.businessId}`]);
  expect(stolen).toMatchObject({ status: 'failed', last_error: expect.stringMatching(/couldn’t be read/) });
  expect(await mailsTo(ownerB)).toHaveLength(0);
});

for (const [width, height] of [[390, 844], [1280, 900]] as const) {
  test(`email screens and a rendered email at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const biz = await bookableBusiness(page, `mail${width}`);
    await connectOAuth(page, 'Gmail or Google Workspace', `shop-${tag()}@gmail.example.com`);
    for (const path of ['/app/settings/notifications', '/app/settings/notifications/templates/booking_confirmed', '/app/settings/notifications/activity']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
      await page.screenshot({ path: `test-results/p7-${path.split('/').slice(3).join('-') || 'notifications'}-${width}.png`, fullPage: true });
    }
    const mail = await mailTo(biz.email, /Test email from DetailerHQ/);
    // The sink keeps the raw body (decoded as Latin-1): show just the HTML part, as UTF-8, like a mail app.
    const html = Buffer.from(mail.html.slice(mail.html.indexOf('<!doctype html>'), mail.html.indexOf('</html>') + 7), 'latin1').toString('utf8');
    expect(html).toContain('This is a test from Northside Detail Co. If you can read this');
    await page.setContent(html);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/p7-email-${width}.png`, fullPage: true });
  });
}
