# Phase 7 — Email automation

Each business sends from **its own mailbox, connected with SMTP**: Gmail / Google Workspace, Outlook /
Microsoft 365, a custom domain, or any provider with SMTP sign-in. There is no shared DetailerHQ
sender, no paid email service and no SMS. Without a verified connection every feature works and
automatic emails are simply off (the dashboard says so).

Google / Microsoft **OAuth sign-in is built but hidden** (off unless `EMAIL_OAUTH_ENABLED=1`): its
routes refuse, its buttons don't show, and no Google Cloud or Azure setup is needed. Connections made
with it earlier keep sending.

Migrations: `supabase/migrations/20261104120000_email_automation.sql`,
`20261105120000_email_smtp_settings.sql` (encryption setting, last successful connection, password
replacement).

## Connecting (Settings → Notifications)

1. **How to Connect Your Business Email** — collapsible steps for Gmail / Workspace (2-Step
   Verification → App passwords → `smtp.gmail.com`, 587, STARTTLS), Outlook / Microsoft 365 (SMTP
   AUTH must be on; settings from the administrator; basic-auth retirement), your own domain, and
   limits.
2. **The form** — provider (fills the usual settings), business email address, sender name, SMTP
   hostname, port (587 / 465 / 2525), encryption (STARTTLS or SSL/TLS), username, password or app
   password.
3. **Test connection** logs in to the server and saves nothing. **Connect email** logs in again, saves
   the details encrypted, and emails a 6-digit code to the address; entering it verifies the
   connection and turns automatic emails on.
4. Connected view: status (Connected / Needs attention / Waiting for verification), server, port and
   encryption, **last successful connection**, last email sent, **Test connection** (with the saved
   password), **Send test email**, **Update password or settings** (same address: takes effect at once
   and releases held emails; new address: new code), **Disconnect email** (deletes the credentials).

Errors are in plain language: unknown host, nothing answering on the port, wrong encryption for the
port, untrusted certificate, wrong password / app password needed, Microsoft SMTP AUTH disabled or
basic authentication not supported.

## What's sent

| Customers (each can be turned off; wording editable) | Owners (each owner chooses) |
|---|---|
| Booking request received (approval mode) · Booking confirmed (approved, instant, owner-added, proposal accepted) · Declined · New time proposed · Proposed time accepted / declined · Rescheduled · Cancelled · Reminder (2 h – 3 days before, up to two) · Quote sent · Quote accepted / declined · Quote expiring (the day before; unsubscribable) · Quote expired (unsubscribable) | New booking requests · New confirmed bookings (instant / accepted proposals) · New leads (booking-page inquiries, not ones you type in) · Customer responses (quotes, proposed times, customer cancellations) · Daily schedule (when there are appointments) · Overdue follow-ups (once a day) |

Emails include the published logo (PNG via `/media/<id>.png`), brand colour on the button, the
business's contact details, the details the customer needs, and links to the existing secure
status (`/r/…`) and quote (`/q/…`) pages. Never internal notes, internal decline reasons, or other
customers' data (the worker gets an allow-listed context: `email_api.context`). Owners edit the
subject, opening and sign-off (placeholders `{{customer_first_name}}`, `{{business_name}}`); the
details, links and contact block are always added.

## How it works

1. **Queueing** — database triggers on `booking_requests`, `appointments`, `quotes` and `leads` add
   rows to `email_outbox` in the same transaction as the change (new requests and appointments at
   commit, so an instant booking sends a confirmation, not "request received"). Each row has a
   unique idempotency key per event and recipient: repeated or retried events never send twice.
   Queueing is wrapped so an email problem can never fail a booking, quote or lead change.
2. **Sending** — the server's worker (`src/lib/email/worker.ts`, database role `email_worker`, which
   can only call `email_api.*`) claims due rows with `FOR UPDATE SKIP LOCKED` (concurrent workers
   never double-send; a crashed worker's lock expires), renders, sends, and records the outcome.
   It runs right after each change (`after()`, so responses never wait) and every minute from the
   database (`pg_cron` + `pg_net` → `POST /api/email/worker` with a shared secret stored in Vault).
3. **Failures** — temporary errors retry after 1 min, 5 min, 30 min, 2 h, 6 h, then fail; permanent
   ones (bad address) fail at once. Failed and held emails show in Settings → Notifications →
   Activity with Retry / Cancel, and on the dashboard. A refused login (revoked or expired OAuth
   access, changed password) marks the connection "Needs attention" and **holds** that business's
   emails; reconnecting sends held ones from the last 24 hours (and upcoming reminders) and skips
   older ones.
4. **Limits** — per business: 100 emails/hour, a daily limit (default 300, below Gmail's 2,000 and
   Microsoft's 10,000 recipients/day) and 5 test emails an hour. Over a limit,
   emails wait rather than fail.
5. **Unsubscribe** — only the non-essential quote follow-ups: a signed link to a confirmation page
   (`/u/…`, POST so link scanners can't unsubscribe anyone) and one-click `List-Unsubscribe`
   headers (RFC 8058). Transactional booking and quote emails are never affected.

## Connections and security

- **SMTP** — the login is checked before anything is saved (a mistake never replaces a working
  connection). The host must resolve to public addresses (SSRF guard; the connection is pinned to the
  checked address); ports 465 / 587 / 2525 only. **SSL/TLS** is TLS from the first byte; **STARTTLS**
  must upgrade before the login (`requireTLS`) — a password is never sent unencrypted. TLS 1.2+,
  certificates verified against the typed host name. Then a 6-digit code — generated by the
  database, stored only as a hash, 30 minutes, 5 attempts — is emailed to the sending address and
  must be entered. Connection checks are limited to 10 per business per 10 minutes (per server).
- **Verification** — nothing is queued or sent until the connection is verified.
- **Credentials** — SMTP passwords (and OAuth refresh tokens) are encrypted in the server with
  AES-256-GCM (`EMAIL_ENCRYPTION_KEY`, server-only), bound to the business and provider (associated
  data), and stored as ciphertext. Owners can't read even that column; only the worker role can. The
  browser never receives a saved password (the form asks for it again). Nothing logs credentials.
  Disconnecting deletes them.
- **Revoked or changed passwords** — a refused login (sending or Test connection) marks the
  connection "Needs attention" and holds its emails; entering the new password releases those from
  the last 24 hours (and upcoming reminders).
- **Isolation** — RLS on every table (members read their own business; owner preferences per
  user); all writes through membership-checked functions; credentials can't be used by another
  business (associated data); `npm run test:bundle` checks the browser bundle has no secrets.
- **OAuth (hidden)** — Google `gmail.send` / Microsoft `Mail.Send`, PKCE, signed state cookie; only
  with `EMAIL_OAUTH_ENABLED=1` (the start and callback routes refuse otherwise).

## Provider limits

| Provider | What to know |
|---|---|
| Gmail / Google Workspace | Needs 2-Step Verification and an app password (not available for every account: security-key-only, Advanced Protection, or turned off by a Workspace admin). About 500 recipients/day (free Gmail), about 2,000 (Workspace). |
| Microsoft 365 | SMTP AUTH must be enabled for the mailbox (often off; admin setting). Microsoft is retiring basic (password) SMTP auth: planned off by default for existing tenants from end of December 2026 (admins can re-enable for now), final removal date to be announced. Accounts with MFA may need an app password or can't use SMTP. |
| Outlook.com / Hotmail (personal) | Microsoft no longer accepts passwords for SMTP on most personal accounts — usually can't connect. |
| Custom domain | Settings from the host; SPF and DKIM on the domain matter for deliverability. |
| DetailerHQ | 100 emails/hour and 300/day per business (waits, never fails, over a limit); 5 test emails/hour. Bounces go to the business's inbox (not tracked). |

## Costs and accounts

| Item | Cost | Who sets it up |
|---|---|---|
| SMTP (Gmail, Microsoft 365, custom domains) | Free — the business's own email account. | Each business |
| Google Cloud / Microsoft Entra apps (only for the hidden OAuth option) | Not needed now. | — |
| pg_cron, pg_net, Vault | Included in Supabase. | — |
| Amazon SES / Resend / Postmark | **Not used** — optional future alternatives (delivery and bounce tracking). | Only with your approval |

**Delivery tracking:** Gmail and Microsoft confirm acceptance ("Sent"); bounces arrive in the
business's own inbox (we don't read it). SMTP likewise. True delivered/bounced tracking would need a
transactional provider (above).

## Setup

Environment (server-only; `npm run env:local` writes the first three locally):

```
EMAIL_WORKER_DATABASE_URL   postgres://email_worker:…  (restricted role)
EMAIL_ENCRYPTION_KEY        32 random bytes, base64 — keep it; a new key makes stored credentials unreadable
EMAIL_WORKER_SECRET         64 hex chars — also stored in Vault for the scheduler
EMAIL_OAUTH_ENABLED=1                            optional; shows the hidden OAuth sign-in (off by default)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET          optional, only with EMAIL_OAUTH_ENABLED
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET    optional, only with EMAIL_OAUTH_ENABLED
```

Only if OAuth is turned on later — Google: Google Cloud Console → new project → enable **Gmail API** → OAuth consent screen (External;
scopes `openid`, `email`, `.../auth/gmail.send`) → Credentials → OAuth client ID (Web) → redirect URI
`https://<your site>/app/settings/notifications/callback/google` (and `http://localhost:3000/...` for
local). Microsoft: Entra admin center → App registrations → New (accounts in any organizational
directory and personal Microsoft accounts) → redirect URI (Web)
`https://<your site>/app/settings/notifications/callback/microsoft` → Certificates & secrets → new
client secret → API permissions: Microsoft Graph delegated `Mail.Send`, `User.Read`, `offline_access`.

Production scheduler (once, as the database owner):
`select app.configure_email_worker('https://<your site>/api/email/worker', '<EMAIL_WORKER_SECRET>');`

**Local testing without real accounts:** `EMAIL_TRANSPORT=mock` (and `EMAIL_ALLOW_PRIVATE_SMTP=1`)
in `.env.local` — refused on any non-localhost site. SMTP to `localhost`, port `2525`, STARTTLS
(any password except `wrong-password`) delivers to the dev mail sink (`node scripts/dev-mail-sink.mjs`,
read at http://127.0.0.1:54330/messages). With `EMAIL_OAUTH_ENABLED=1` too, the OAuth buttons open a
mock consent page (`/api/dev/email-mock`).

## Tests

- `supabase/tests/database/17_email_automation.test.sql` (78) — every trigger → email mapping,
  instant vs approval, idempotency, disabled templates, suppressions, owner preferences, reminders
  (schedule, reschedule, cancel, settings change), quotes, leads, privileges, isolation, SMTP code,
  worker API, holding and releasing, disconnect, test-email limit.
- `tests/node/email-worker.test.js` — 12 concurrent workers never claim twice; crashed-worker
  recovery; concurrent duplicate events → one email; worker role limited.
- `tests/unit/email.test.ts` — every template renders; escaping and header-injection safety;
  customer vs owner content; brand-colour contrast; owner text rules; SSRF ranges.
- `supabase/tests/database/18_email_smtp_settings.test.sql` (26) — encryption setting, last
  successful connection, same-address password replacement keeps verification and releases held
  emails, new address needs a code, Test-connection recovery, privileges, isolation.
- `tests/unit/smtp-tls.test.ts` — real local TLS servers (simulated providers): STARTTLS, SSL/TLS,
  wrong password, mismatched encryption, no STARTTLS offered (password never sent), untrusted
  certificate, closed port; Gmail / Microsoft error messages.
- `tests/e2e/email.spec.ts` (simulated SMTP) — the guide (text, open/close, links), presets,
  validation (port, unknown host, wrong encryption, wrong password), Test connection saves nothing,
  Connect + code, last successful connection, Test connection with the saved password, needs
  attention → update password (wrong one changes nothing) → connected, disconnect; OAuth hidden
  (no buttons, routes refuse). Hidden OAuth backend (`E2E_OAUTH=1`, server with
  `EMAIL_OAUTH_ENABLED=1`): Gmail and Outlook connect/verify/disconnect, revoked access → held →
  reconnect, forged/replayed callbacks. SMTP wrong password, code verification;
  bounce → failed + retry, busy → backoff; booking and quote emails with working links; unsubscribe;
  template editing with preview; preferences; isolation; forged/replayed OAuth callbacks; credential
  binding; phone and desktop layouts and the rendered email.
