// Email automation (Phase 7): the template catalogue, defaults, and a pure renderer (no server
// dependencies) used by the worker and by the template editor's preview. Every value that comes
// from data is HTML-escaped; owners customise only the subject, intro and sign-off (with a few
// whitelisted placeholders) — required details and links are always rendered by the system.

import { formatCents } from './service.ts';

export const CUSTOMER_TEMPLATES = [
  { key: 'request_received', label: 'Booking request received', when: 'A customer sends a booking request (approval mode).' },
  { key: 'booking_confirmed', label: 'Booking confirmed', when: 'You approve a request, a customer books instantly, or you add an appointment.' },
  { key: 'booking_declined', label: 'Booking declined', when: 'You decline a request.' },
  { key: 'time_proposed', label: 'New time proposed', when: 'You suggest a different time for a request.' },
  { key: 'proposal_accepted', label: 'Proposed time accepted', when: 'The customer accepts the time you suggested.' },
  { key: 'proposal_declined', label: 'Proposed time declined', when: 'The customer declines the time you suggested.' },
  { key: 'booking_rescheduled', label: 'Appointment rescheduled', when: 'You move an appointment.' },
  { key: 'booking_cancelled', label: 'Appointment cancelled', when: 'An appointment is cancelled, by you or the customer.' },
  { key: 'appointment_reminder', label: 'Appointment reminder', when: 'Before each appointment, at the times you choose.' },
  { key: 'quote_sent', label: 'Quote sent', when: 'You send a quote.' },
  { key: 'quote_accepted', label: 'Quote accepted', when: 'The customer accepts a quote.' },
  { key: 'quote_declined', label: 'Quote declined', when: 'The customer declines a quote.' },
  { key: 'quote_expiring', label: 'Quote expiring soon', when: 'The day before an unanswered quote expires (customers can unsubscribe).' },
  { key: 'quote_expired', label: 'Quote expired', when: 'An unanswered quote expires (customers can unsubscribe).' },
] as const;
export type CustomerTemplate = (typeof CUSTOMER_TEMPLATES)[number]['key'];

export const OWNER_TEMPLATES = [
  { key: 'owner_new_request', label: 'New booking requests', when: 'A customer sends a request to approve.' },
  { key: 'owner_new_appointment', label: 'New confirmed bookings', when: 'A customer books an open time instantly.' },
  { key: 'owner_new_lead', label: 'New leads', when: 'Someone sends an inquiry from your booking page.' },
  { key: 'owner_customer_response', label: 'Customer responses', when: 'A customer answers a quote or a proposed time, or cancels.' },
  { key: 'owner_daily_summary', label: 'Daily schedule', when: 'Each morning you have appointments: the day’s schedule.' },
  { key: 'owner_overdue_followups', label: 'Overdue follow-ups', when: 'Once a day when leads or quotes are past their follow-up date.' },
] as const;
export type OwnerTemplate = (typeof OWNER_TEMPLATES)[number]['key'];
export type EmailTemplate = CustomerTemplate | OwnerTemplate | 'connection_test';

export const REMINDER_CHOICES = [2, 4, 12, 24, 48, 72] as const;
export const PLACEHOLDERS = ['customer_first_name', 'business_name'] as const;

type Defaults = { subject: string; intro: string; signoff: string };
const SIGN = 'Thanks,\n{{business_name}}';
export const DEFAULTS: Record<CustomerTemplate, Defaults> = {
  request_received: { subject: 'We received your booking request', intro: 'Hi {{customer_first_name}}, thanks for your request. We’ll review it and confirm the time, or suggest another one, soon.', signoff: SIGN },
  booking_confirmed: { subject: 'Your appointment is confirmed', intro: 'Hi {{customer_first_name}}, you’re booked. Here are the details.', signoff: SIGN },
  booking_declined: { subject: 'About your booking request', intro: 'Hi {{customer_first_name}}, unfortunately we can’t take this booking.', signoff: SIGN },
  time_proposed: { subject: 'We suggested a new time for your booking', intro: 'Hi {{customer_first_name}}, the time you asked for isn’t available. Could this time work instead?', signoff: SIGN },
  proposal_accepted: { subject: 'Your appointment is confirmed', intro: 'Hi {{customer_first_name}}, thanks for accepting the new time — you’re booked.', signoff: SIGN },
  proposal_declined: { subject: 'Your booking request', intro: 'Hi {{customer_first_name}}, you declined the time we suggested. We’ll be in touch about another time.', signoff: SIGN },
  booking_rescheduled: { subject: 'Your appointment has moved', intro: 'Hi {{customer_first_name}}, your appointment has a new time.', signoff: SIGN },
  booking_cancelled: { subject: 'Your appointment is cancelled', intro: 'Hi {{customer_first_name}}, your appointment has been cancelled.', signoff: SIGN },
  appointment_reminder: { subject: 'Reminder: your appointment is coming up', intro: 'Hi {{customer_first_name}}, a quick reminder about your appointment.', signoff: SIGN },
  quote_sent: { subject: 'Your quote from {{business_name}}', intro: 'Hi {{customer_first_name}}, here’s your quote. You can review it and accept or decline online.', signoff: SIGN },
  quote_accepted: { subject: 'Thanks — you accepted your quote', intro: 'Hi {{customer_first_name}}, thanks for accepting. We’ll be in touch to confirm a time.', signoff: SIGN },
  quote_declined: { subject: 'Your quote', intro: 'Hi {{customer_first_name}}, thanks for letting us know. If anything changes, just get in touch.', signoff: SIGN },
  quote_expiring: { subject: 'Your quote expires tomorrow', intro: 'Hi {{customer_first_name}}, just a heads-up: your quote expires tomorrow.', signoff: SIGN },
  quote_expired: { subject: 'Your quote has expired', intro: 'Hi {{customer_first_name}}, your quote has expired. If you’re still interested, get in touch and we’ll send a new one.', signoff: SIGN },
};

// --- Rendering ------------------------------------------------------------------------------------

export type EmailContext = {
  template: EmailTemplate;
  category: string;
  response?: string | null;
  hours?: string | null;
  business: { name: string; timezone: string; phone: string | null; email: string | null; logo: string | null; primary_color: string | null; website: string | null };
  custom: { subject: string | null; intro: string | null; signoff: string | null };
  request?: {
    number: number;
    first_name: string;
    requested_start: string;
    proposed_start: string | null;
    proposal_message: string | null;
    decline_message: string | null;
    estimated_total_cents: number | null;
    estimate_is_minimum: boolean;
    services: string[];
    vehicle: string;
    location: string | null;
    customer_name?: string;
    phone?: string | null;
    email?: string | null;
    customer_notes?: string | null;
  };
  appointment?: {
    number: number;
    starts_at: string;
    ends_at: string;
    previous_start: string | null;
    first_name: string | null;
    services: string[];
    estimated_total_cents: number | null;
    customer_message: string | null;
    cancelled_by: string | null;
    location: string | null;
    customer_name?: string | null;
  };
  quote?: { number: number; total_cents: number; valid_until: string | null; first_name: string | null; customer_name?: string | null; vehicle: string | null; items: string[] };
  lead?: { name: string; phone: string | null; email: string | null; request: string | null; vehicle: string };
  summary?: { starts_at: string; customer: string; services: string | null; location: string | null }[];
  pending_requests?: number;
  overdue?: { kind: string; name: string; due: string; note: string | null }[];
};
export type EmailLinks = { action?: { label: string; url: string }; logo?: string | null; unsubscribe?: string | null; dashboard?: string | null };
export type RenderedEmail = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');

export function when(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
}
const day = (date: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
const time = (iso: string, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

type Detail = [string, string];

function customerParts(c: EmailContext): { details: Detail[]; note?: string } {
  const tz = c.business.timezone;
  const r = c.request;
  const a = c.appointment;
  const q = c.quote;
  const estimate = (cents: number | null | undefined, min = false) => (cents == null ? null : `${min ? 'From ' : ''}${formatCents(cents)} (estimate)`);
  const details: Detail[] = [];
  const add = (k: string, v: string | null | undefined) => v && details.push([k, v]);
  switch (c.template) {
    case 'request_received':
    case 'booking_declined':
    case 'proposal_declined':
      add('Requested time', r && when(r.requested_start, tz));
      add('Services', r?.services.join(', '));
      add('Vehicle', r?.vehicle);
      add('Estimate', estimate(r?.estimated_total_cents, r?.estimate_is_minimum));
      return { details, note: c.template === 'booking_declined' ? (r?.decline_message ?? undefined) : undefined };
    case 'time_proposed':
      add('Suggested time', r?.proposed_start ? when(r.proposed_start, tz) : null);
      add('You asked for', r && when(r.requested_start, tz));
      add('Services', r?.services.join(', '));
      return { details, note: r?.proposal_message ?? undefined };
    case 'booking_confirmed':
    case 'proposal_accepted':
    case 'appointment_reminder':
    case 'booking_rescheduled':
    case 'booking_cancelled': {
      if (a) {
        add(c.template === 'booking_rescheduled' ? 'New time' : 'When', when(a.starts_at, tz));
        if (c.template === 'booking_rescheduled' && a.previous_start) add('Was', when(a.previous_start, tz));
        add('Where', a.location);
        add('Services', a.services.join(', '));
        add('Estimate', estimate(a.estimated_total_cents));
      } else if (r) {
        add('When', when(r.proposed_start ?? r.requested_start, tz));
        add('Services', r.services.join(', '));
      }
      return { details, note: c.template === 'booking_cancelled' ? (a?.customer_message ?? undefined) : undefined };
    }
    case 'quote_sent':
    case 'quote_accepted':
    case 'quote_declined':
    case 'quote_expiring':
    case 'quote_expired':
      add('Quote', q ? `#${q.number}` : null);
      add('Vehicle', q?.vehicle);
      add('Work', q?.items.join(', '));
      add('Total', q ? formatCents(q.total_cents) : null);
      if (c.template === 'quote_sent' || c.template === 'quote_expiring') add('Valid until', q?.valid_until ? day(q.valid_until) : null);
      return { details };
    default:
      return { details };
  }
}

// "Northside Detail Co." + "." → one full stop.
const endSentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

const RESPONSE: Record<string, string> = {
  proposal_accepted: 'accepted the time you proposed',
  proposal_declined: 'declined the time you proposed',
  quote_accepted: 'accepted a quote',
  quote_declined: 'declined a quote',
  appointment_cancelled: 'cancelled an appointment',
};

function ownerParts(c: EmailContext): { subject: string; intro: string; details: Detail[]; list?: string[] } {
  const tz = c.business.timezone;
  const r = c.request;
  const a = c.appointment;
  const q = c.quote;
  const details: Detail[] = [];
  const add = (k: string, v: string | null | undefined) => v && details.push([k, v]);
  switch (c.template) {
    case 'owner_new_request':
    case 'owner_new_appointment':
      add('Customer', r?.customer_name);
      add('When', r && when(r.proposed_start ?? r.requested_start, tz));
      add('Services', r?.services.join(', '));
      add('Vehicle', r?.vehicle);
      add('Phone', r?.phone);
      add('Email', r?.email);
      add('Notes', r?.customer_notes);
      return c.template === 'owner_new_request'
        ? { subject: `New booking request from ${r?.customer_name ?? 'a customer'}`, intro: 'A customer sent a booking request. Approve it, decline it, or suggest another time.', details }
        : { subject: `New booking: ${r?.customer_name ?? 'a customer'}`, intro: 'A customer booked an open time. It’s on your calendar.', details };
    case 'owner_new_lead':
      add('Name', c.lead?.name);
      add('Phone', c.lead?.phone);
      add('Email', c.lead?.email);
      add('Vehicle', c.lead?.vehicle);
      add('Request', c.lead?.request);
      return { subject: `New lead: ${c.lead?.name ?? 'someone'}`, intro: 'Someone sent an inquiry from your booking page.', details };
    case 'owner_customer_response': {
      const who = r?.customer_name ?? a?.customer_name ?? q?.customer_name ?? 'A customer';
      add('When', a ? when(a.starts_at, tz) : r?.proposed_start ? when(r.proposed_start, tz) : null);
      add('Quote', q ? `#${q.number} · ${formatCents(q.total_cents)}` : null);
      return { subject: `${who} ${RESPONSE[c.response ?? ''] ?? 'responded'}`, intro: `${who} ${RESPONSE[c.response ?? ''] ?? 'responded'}.`, details };
    }
    case 'owner_daily_summary':
      return {
        subject: `Today: ${c.summary?.length ?? 0} appointment${c.summary?.length === 1 ? '' : 's'}`,
        intro: `Here’s your schedule for today${c.pending_requests ? `. ${c.pending_requests} request${c.pending_requests === 1 ? ' is' : 's are'} waiting for your answer` : ''}.`,
        details,
        list: (c.summary ?? []).map((s) => `${time(s.starts_at, tz)} — ${s.customer || 'Customer'}${s.services ? ` · ${s.services}` : ''}${s.location ? ` · ${s.location}` : ''}`),
      };
    case 'owner_overdue_followups':
      return {
        subject: `${c.overdue?.length ?? 0} follow-up${c.overdue?.length === 1 ? '' : 's'} overdue`,
        intro: 'These follow-ups are past their date:',
        details,
        list: (c.overdue ?? []).slice(0, 15).map((o) => `${o.name}${o.note ? ` — ${o.note}` : ''}`),
      };
    default:
      return { subject: 'Test email from DetailerHQ', intro: `This is a test from ${endSentence(c.business.name)} If you can read this, automatic emails will send from this address.`, details };
  }
}

/** Renders any template to subject, HTML (inline styles, 600 px, works in Gmail, Outlook and Apple Mail) and text. */
export function renderEmail(c: EmailContext, links: EmailLinks): RenderedEmail {
  const vars = {
    customer_first_name: c.request?.first_name || c.appointment?.first_name || c.quote?.first_name || 'there',
    business_name: c.business.name,
  };
  let subject: string;
  let intro: string;
  let signoff: string;
  let details: Detail[];
  let note: string | undefined;
  let list: string[] | undefined;
  if (c.category === 'owner' || c.template === 'connection_test') {
    const o = ownerParts(c);
    ({ subject, intro, details, list } = o);
    signoff = c.template === 'connection_test' ? '— DetailerHQ' : '— DetailerHQ notifications';
  } else {
    const d = DEFAULTS[c.template as CustomerTemplate];
    subject = fill(c.custom.subject ?? d.subject, vars);
    intro = fill(c.custom.intro ?? d.intro, vars);
    signoff = fill(c.custom.signoff ?? d.signoff, vars);
    ({ details, note } = customerParts(c));
  }
  if (c.template === 'appointment_reminder' && c.hours && !c.custom.subject) subject = `Reminder: your appointment ${Number(c.hours) >= 24 ? (Number(c.hours) === 24 ? 'tomorrow' : `in ${Number(c.hours) / 24} days`) : `in ${c.hours} hours`}`;
  subject = subject.replace(/[\r\n]+/g, ' ').slice(0, 150);

  const color = c.business.primary_color && /^#[0-9a-f]{6}$/i.test(c.business.primary_color) ? c.business.primary_color : '#171716';
  const ink = '#171716';
  const muted = '#6b6b66';
  const para = (s: string) => esc(s).replace(/\n/g, '<br>');
  const contact = [c.business.phone, c.business.email, c.business.website?.replace(/^https:\/\//, '')].filter(Boolean) as string[];
  const header = links.logo
    ? `<img src="${esc(links.logo)}" alt="${esc(c.business.name)}" height="48" style="display:block;height:48px;width:auto;max-width:240px;border:0;outline:none">`
    : `<span style="font-size:18px;font-weight:600;color:${ink}">${esc(c.business.name)}</span>`;
  const button = links.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:6px;background:${esc(color)}">` +
      `<a href="${esc(links.action.url)}" style="display:inline-block;padding:12px 20px;font-weight:600;font-size:15px;color:${textOnHex(color)};text-decoration:none;border-radius:6px">${esc(links.action.label)}</a></td></tr></table>`
    : '';
  const rows = details
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:${muted};font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-size:15px;color:${ink}">${para(v)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e9e9e6;border-radius:8px">
<tr><td style="padding:24px 28px 8px">${header}</td></tr>
<tr><td style="padding:8px 28px 0;font-size:16px;line-height:24px">
<p style="margin:0 0 16px">${para(intro)}</p>
${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:1px solid #e9e9e6;padding-top:8px;width:100%">${rows}</table>` : ''}
${list?.length ? `<ul style="margin:0 0 8px;padding-left:20px">${list.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join('')}</ul>` : ''}
${note ? `<p style="margin:12px 0;padding:12px 14px;background:#f4f4f2;border-radius:6px;font-size:15px">${para(note)}</p>` : ''}
${button}
<p style="margin:20px 0 0">${para(signoff)}</p>
</td></tr>
<tr><td style="padding:20px 28px 24px;font-size:13px;line-height:20px;color:${muted}">
${contact.length ? `${esc(c.business.name)} · ${contact.map(esc).join(' · ')}<br>` : ''}${links.unsubscribe ? `<a href="${esc(links.unsubscribe)}" style="color:${muted}">Unsubscribe from reminders about quotes</a><br>` : ''}${
    c.category === 'owner' && links.dashboard ? `<a href="${esc(links.dashboard)}" style="color:${muted}">Change which emails you get</a>` : ''
  }
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    c.business.name,
    '',
    intro,
    '',
    ...details.map(([k, v]) => `${k}: ${v}`),
    ...(list ?? []).map((l) => `- ${l}`),
    ...(note ? ['', note] : []),
    ...(links.action ? ['', `${links.action.label}: ${links.action.url}`] : []),
    '',
    signoff,
    ...(contact.length ? ['', contact.join(' · ')] : []),
    ...(links.unsubscribe ? ['', `Unsubscribe from quote reminders: ${links.unsubscribe}`] : []),
  ].join('\n');
  return { subject, html, text };
}

// White or graphite text on the button (same rule as the booking page, domain/branding).
function textOnHex(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0586 ? '#ffffff' : '#171716';
}

/** Owner-editable fields: lengths as the database allows; only known placeholders. */
export function checkCustomText(field: 'subject' | 'intro' | 'signoff', value: string): string | null {
  const max = { subject: 150, intro: 1000, signoff: 300 }[field];
  if (value.length > max) return `Use ${max} characters or fewer.`;
  if (field === 'subject' && /[\r\n]/.test(value)) return 'Keep the subject on one line.';
  const unknown = [...value.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!).filter((k) => !(PLACEHOLDERS as readonly string[]).includes(k));
  return unknown.length ? `Unknown placeholder: {{${unknown[0]}}}. Use {{customer_first_name}} or {{business_name}}.` : null;
}
