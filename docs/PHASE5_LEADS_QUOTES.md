# Phase 5 — Leads & Quotes

Builds on the Phase 1 `leads`, `quotes`, `quote_items` and `activity_events` tables (no replacement
tables). One migration: `supabase/migrations/20261101120000_leads_quotes.sql`.

## Pipeline

- **Leads** (`/app/leads`): created manually; contact, vehicle (year/make/model/size), requested
  service or custom request, source, internal notes. Statuses New → Contacted → Quoted → Converted, or
  Lost (with a reason). Stored values reuse the Phase 1 enum (`quote_sent` = Quoted, `booked` = Converted).
- **Contact log and notes** write `activity_events`; logging a contact sets `last_contacted_at` and
  moves a New lead to Contacted. Status changes are logged by trigger.
- **Follow-ups**: a date + note on a lead or quote (`next_follow_up_at`); `/app/follow-ups` shows due or
  overdue, accepted quotes to book, quotes awaiting the customer, uncontacted leads and upcoming. Today
  shows counts under "Needs your action".
- **Convert to customer** creates (or links) a customer and vehicle; nothing is merged automatically.

## Quotes

- **Builder** (`/app/quotes/new`, prefilled from a lead or a customer): existing or new customer and
  vehicle, catalog lines (priced for the vehicle size) and custom lines, quantities, discount, expiry,
  optional proposed time, customer notes, terms, internal notes. Saved atomically by `public.save_quote`.
  Line prices are copied into `quote_items`, so later catalog changes never alter a quote.
- **Statuses**: draft → sent → accepted / declined / expired; accepted → converted (shown "Booked");
  sent → draft is "withdraw" (the link stops working). Amounts can change only in draft (trigger).
- **Sending** (`public.send_quote(quote, link_key)`, migration `20261101130000_quote_link_tokens.sql`):
  the database draws a random nonce (`gen_random_uuid`, CSPRNG) and derives
  `token = base64url(HMAC-SHA256(link_key, "quote-link:v2:" + nonce))` — 43 characters, 256 bits — and
  stores only the nonce and `sha256(token)`. `link_key` is a 32-byte subkey of `BOOKING_HASH_SECRET`
  that the server passes and the database never stores; the server derives the same token from the
  nonce to show the link again. Owners never choose a token: the randomness always comes from the
  database, and a copy of the database alone can't produce links. Re-sending keeps the link;
  withdrawing clears hash, nonce and version (the link dies); sending again makes a new one. Links
  sent before this migration are `link_version = 1` and keep working. No email or SMS is sent.
- **Customer page** `/q/[token]`: no login, no-referrer and noindex headers. Shows only an allow-listed
  set of fields (`app.quote_json`) — never internal notes. Accept/decline go through `public_api`
  (`booking_api` role), are rate-limited per IP, and are idempotent; a decided, expired or withdrawn
  quote can't be answered, and nothing can be answered while the business is suspended or closing.
- **Booking an accepted quote** (`public.convert_quote`): locks the quote, checks the time with the
  Phase 4 engine (`app.time_problem`) and the capacity trigger, creates one appointment
  (`source = 'quote'`, items and total from the quote), marks the quote converted and the lead booked.
  A unique index allows one appointment per quote.

## Security

Owners can no longer insert/update/delete `quotes` or `quote_items` directly (only internal notes and
follow-up columns); every other change goes through the functions above, so an owner can't fake a
customer's acceptance. All functions are SECURITY INVOKER wrappers over `app.*_impl` SECURITY DEFINER
functions that check business membership; foreign ids give DH003.

## Tests

`supabase/tests/database/13_leads_quotes.test.sql`, `14_quote_security.test.sql` and `15_quote_link_tokens.test.sql` (pgTAP), quote races in
`tests/node/concurrency.test.js`, `tests/unit/leads.test.ts`, `tests/e2e/leads-quotes.spec.ts`.
