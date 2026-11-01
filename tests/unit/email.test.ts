import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCustomText, CUSTOMER_TEMPLATES, OWNER_TEMPLATES, renderEmail, type EmailContext } from '../../src/domain/email.ts';
import { isPrivateAddress } from '../../src/lib/email/net.ts';

const business = { name: 'Northside Detail Co.', timezone: 'America/Chicago', phone: '+15125550142', email: null, logo: null, primary_color: '#f5d76e', website: null };
const base = (template: string, extra: Partial<EmailContext> = {}): EmailContext => ({
  template: template as EmailContext['template'],
  category: template.startsWith('owner_') ? 'owner' : template.startsWith('quote_exp') ? 'follow_up' : 'transactional',
  business,
  custom: { subject: null, intro: null, signoff: null },
  request: {
    number: 1, first_name: 'Jordan', requested_start: '2026-11-09T16:00:00Z', proposed_start: '2026-11-10T19:00:00Z', proposal_message: 'Afternoon?',
    decline_message: 'Fully booked', estimated_total_cents: 18000, estimate_is_minimum: false, services: ['Full detail'], vehicle: '2021 Tesla Model Y',
    location: '1 Main St, Austin', customer_name: 'Jordan Reyes', phone: '+15125550100', email: 'j@example.com', customer_notes: 'Gate code',
  },
  appointment: { number: 2, starts_at: '2026-11-09T16:00:00Z', ends_at: '2026-11-09T19:00:00Z', previous_start: '2026-11-08T16:00:00Z', first_name: 'Jordan', services: ['Full detail'], estimated_total_cents: 18000, customer_message: 'Van broke down', cancelled_by: 'business', location: '1 Main St, Austin' },
  quote: { number: 7, total_cents: 120000, valid_until: '2026-11-20', first_name: 'Jordan', vehicle: 'Ford F-150', items: ['Ceramic coating'] },
  lead: { name: 'Sam Lee', phone: null, email: 'sam@example.com', request: 'Ceramic?', vehicle: '' },
  summary: [{ starts_at: '2026-11-09T15:00:00Z', customer: 'Jordan Reyes', services: 'Full detail', location: 'Austin' }],
  overdue: [{ kind: 'lead', name: 'Sam Lee', due: '2026-11-01T00:00:00Z', note: 'Call back' }],
  ...extra,
});

test('every template renders a subject, HTML and text, with the business name and no unfilled placeholders', () => {
  for (const t of [...CUSTOMER_TEMPLATES, ...OWNER_TEMPLATES].map((x) => x.key).concat('connection_test')) {
    const r = renderEmail(base(t), { action: { label: 'Open', url: 'https://example.com/x' } });
    assert.ok(r.subject.length > 3 && !/[\r\n]/.test(r.subject), t);
    assert.ok(r.html.startsWith('<!doctype html>') && r.html.includes('Northside Detail Co.'), t);
    assert.ok(!/\{\{|\}\}/.test(r.subject + r.html + r.text), `${t}: no raw placeholders`);
    assert.ok(r.text.includes('https://example.com/x'), `${t}: link in the text version`);
  }
});

test('data and owner text are escaped; only known placeholders are filled; header injection is impossible', () => {
  const evil = base('booking_confirmed', {
    business: { ...business, name: 'Bad <b>Co</b>' },
    custom: { subject: 'Hi {{customer_first_name}}\r\nBcc: victim@example.com', intro: '<img src=x onerror=alert(1)> {{secret}}', signoff: null },
  });
  const r = renderEmail(evil, { action: { label: 'View', url: 'https://example.com/r/"><script>' } });
  assert.ok(!r.html.includes('<img src=x') && r.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!r.html.includes('<b>Co</b>') && r.html.includes('Bad &lt;b&gt;Co&lt;/b&gt;'));
  assert.ok(!r.html.includes('"><script>'), 'URLs are attribute-escaped');
  assert.ok(!/[\r\n]/.test(r.subject) && r.subject.startsWith('Hi Jordan'), 'no header injection through the subject');
  assert.ok(r.html.includes(' ') && !r.html.includes('{{secret}}'), 'unknown placeholders render empty');
});

test('customer emails show what the customer needs; owner emails add the contact details', () => {
  const declined = renderEmail(base('booking_declined'), {});
  assert.ok(declined.text.includes('Fully booked'), 'the owner’s message to the customer');
  const proposed = renderEmail(base('time_proposed'), {});
  assert.ok(proposed.text.includes('Suggested time') && proposed.text.includes('Afternoon?'));
  const customerView = renderEmail(base('request_received'), {});
  assert.ok(!customerView.text.includes('Gate code') && !customerView.text.includes('+15125550100'), 'customer emails never echo other contact data or notes');
  const owner = renderEmail(base('owner_new_request'), {});
  assert.ok(owner.text.includes('Jordan Reyes') && owner.text.includes('Gate code') && owner.subject.includes('Jordan Reyes'));
  const summary = renderEmail(base('owner_daily_summary'), {});
  assert.match(summary.subject, /Today: 1 appointment$/);
  assert.match(renderEmail(base('appointment_reminder', { hours: '48' }), {}).subject, /in 2 days/);
  assert.match(renderEmail(base('appointment_reminder', { hours: '2' }), {}).subject, /in 2 hours/);
});

test('follow-ups carry an unsubscribe link; the button text stays readable on any brand colour', () => {
  const r = renderEmail(base('quote_expiring'), { unsubscribe: 'https://example.com/u/t' });
  assert.ok(r.html.includes('https://example.com/u/t') && r.text.includes('Unsubscribe'));
  const yellow = renderEmail(base('booking_confirmed'), { action: { label: 'View', url: 'https://x.example' } });
  assert.ok(yellow.html.includes('color:#171716'), 'dark text on a light brand colour');
  const navy = renderEmail(base('booking_confirmed', { business: { ...business, primary_color: '#1f2a44' } }), { action: { label: 'View', url: 'https://x.example' } });
  assert.ok(navy.html.includes('color:#ffffff'), 'white text on a dark brand colour');
});

test('owner-edited text: limits, one-line subjects, known placeholders only', () => {
  assert.equal(checkCustomText('subject', 'Thanks {{customer_first_name}}'), null);
  assert.match(checkCustomText('subject', 'a\nb')!, /one line/);
  assert.match(checkCustomText('intro', '{{password}}')!, /Unknown placeholder/);
  assert.match(checkCustomText('signoff', 'x'.repeat(301))!, /300 characters/);
});

test('SMTP hosts on private networks are refused (SSRF)', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])
    assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['142.250.80.109', '40.97.0.1', '8.8.8.8', '2607:f8b0::1']) assert.ok(!isPrivateAddress(ip), ip);
});
