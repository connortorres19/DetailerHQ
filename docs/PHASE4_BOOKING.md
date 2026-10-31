# Phase 4 — Booking system (Hybrid Booking, D-28–D-32)

Milestones 4A–4G are built one at a time, each tested and reviewed before the next. The plan (problems B1–B9, per-milestone scope) is in the Phase 4 planning handoff; decisions are recorded in PRODUCT_PLAN §17.1 (D-28–D-32).

## 4A — Services, packages, pricing, durations, add-ons

Status 2026-10-31: **done locally**. No new tables, no migrations (8 Phase 1 migrations unchanged).

| | |
|---|---|
| Tables reused | `services`, `service_prices`, `service_categories`, `vehicle_size_classes` (owner CRUD under RLS since Phase 1) |
| Pricing rule | Same as `app.priced_services()`: a per-size price or duration **replaces** the base; a blank one falls back to it. Verified end-to-end against the database function. |
| Packages | Services (D-30). Add-ons are services marked add-on (the database requires a main service in any booking). |
| Money | Integer cents everywhere; `parseMoney` accepts `180`, `$180.50`, `1,250.00`; max $100,000. |
| Durations | Hours + minutes in 15-minute steps, 15 min – 72 h (the database range). |
| Quote required | No price stored (base or per size; per-size durations kept); never bookable online — enforced in the form, the server action and the database check. |
| Archive | Services archive/restore (never deleted — past requests keep their lines). Categories delete only when empty (foreign key). |
| Ordering | Up/down for services within a category and for categories. |

Routes: `/app/services` (Active/Archived, grouped by category, categories panel), `/app/services/new`, `/app/services/[id]`. "Services" added to the app navigation and the Today setup checklist.

Code: `src/domain/service.ts` (validation, money, durations, summaries), `src/data/services.ts`, `src/app/app/services/*`.

Server-side validation: every save re-validates names, price type, prices, durations and the size grid; size IDs must be the business's own (read through RLS), anything else is rejected before any write. A failed price write while creating a service removes the just-created service (supabase-js has no multi-table transaction; a database function would need a migration).

### Tests (2026-10-31)

| Suite | Result |
|---|---|
| Unit (`npm run test:unit`) | 11/11 (5 new: money, durations, size grid, price rules, summaries) |
| E2E services (`tests/e2e/services.spec.ts`) | 6/6 — package with size pricing stored in cents and priced identically by `app.priced_services`; edit removes/updates overrides; quote-required + tampered bookable checkbox refused; add-ons; archive/restore; categories order and delete rules; isolation (URLs 404, lists, tampered server actions incl. another business's category and vehicle size, Data API reads/writes, database checks on negative money / bookable quote / short duration) |
| All E2E against the production build | 35/35 |
| Database | pgTAP 554/554, Node 25/25, `db lint` clean |
| Build + bundle secret scan | pass; 29 browser files clean |
| Marketing film regression | unchanged |

### Findings

- **F-4A-1 (low, Phase 1 schema):** `service_prices`' primary key is `(service_id, size_class_id)` without `business_id`. Inserting a price row for another business's (service, size) pair that already has a price fails with a duplicate-key error (23505) before the foreign key (23503) is checked, so the error reveals that the pair exists. It requires both of the other business's random UUIDs, returns no data and writes nothing. Fixing it means a migration (e.g. a trigger that checks ownership first, or a key including `business_id`); left for the owner to decide.
- **Dev-only warning (pre-existing, Phase 2):** Next.js asks for `data-scroll-behavior="smooth"` on `<html>` because the site uses smooth scrolling. Not changed, to keep the marketing root untouched.

### 4A follow-up (migration 9, `20261031120000_service_save.sql`)

- **Atomic saves:** `public.save_service(service_id, service, prices)` (SECURITY INVOKER, RLS applies) creates or updates a service and replaces its size grid in one transaction. The delete-on-failure fallback above is gone: any failing part leaves nothing saved.
- **Clear pricing errors / F-4A-1 fixed:** duplicate sizes in one save → DH004 `duplicate_size` ("each vehicle size can be priced once"); a size or service from another business → DH003 (`size_not_in_business` / `service_not_in_business`), checked by a trigger before the primary key, so the 23505 existence leak is closed. The owner sees a field-level message for each.
- **Form selects keep their value after a failed submit (fixed in 4B):** React 19 resets a form after its action runs, and a `<select>` resets to the option it mounted with, so a duration picked before a validation error reverted. Selects are now keyed on their value (`Field.tsx`, `ServiceForm.tsx`); regression checks in `services.spec.ts` and `availability.spec.ts`.

## 4B — Hours, availability, blocked dates, capacity, booking rules, booking mode

Migration 10 (`20261031130000_availability.sql`) reuses `availability_rules`, `time_off`, `booking_settings`, `schedule_resources` and `app.check_public_time`. New: one enum + column, two owner functions, three triggers.

| Area | What the owner does | Enforced in the database |
|---|---|---|
| Weekly hours | `/app/availability` → several windows per day (a lunch break = two windows), "Copy to Tue–Fri", closed days, windows up to midnight (24:00) | `save_weekly_hours(jsonb)` replaces the week in one transaction; a trigger refuses overlapping windows on the same weekday (DH004 `overlapping_hours`; touching windows allowed) under a per-business advisory lock, for direct table writes too |
| Blocked dates and times | All-day (one or many days) or timed (may cross midnight), optional note; upcoming blocks listed in local time; remove with confirmation | `add_time_off(...)` converts local dates/times to instants in the business time zone; past blocks stay but aren't listed |
| Booking rules | Minimum notice, booking window (days ahead), buffer between jobs, start-time interval, optional daily job cap, customer cancel cutoff | Existing `booking_settings` checks; server-side zod mirrors them |
| Capacity | Jobs at the same time (shop); mobile is fixed at 1. Moved here from Settings | Existing `set_capacity` + capacity trigger |
| Booking mode | Settings → "How customers book": Approval required (default) or Instant booking | `booking_mode` enum; a trigger refuses instant until there is an active, bookable, non-add-on, fixed/from-price service (`instant_needs_services`) and working hours (`instant_needs_hours`) |

**Public time check (`app.check_public_time`, used by every public booking path):** notice → booking window → one local day (may end exactly at midnight) → inside one working window using the job's real local end time → start aligned to the interval from the window start → no blocked time → capacity including the buffer around existing appointments and valid holds → daily cap (appointments and valid holds starting that local day). Pending requests consume nothing (D-32). The error detail names the rule that failed.

**DST:** all conversions are done by PostgreSQL in the business's IANA zone. An all-day block on a fall-back day is 25 h, on a spring-forward day 23 h; a local time that doesn't exist moves forward; a repeated time uses the later (standard-time) occurrence. The previous hours check added elapsed time to the local start, which was off by an hour for jobs crossing the change. It now uses the real local end time; this is tested both ways. The page names the zone ("Central Time") rather than an abbreviation, which changes with the date.

**Navigation:** "Availability" between Services and Settings; Today checklist gains "Set your working hours".

### Tests (2026-10-31)

| Suite | Result |
|---|---|
| Unit | 23/23 (12 new: windows, overlaps, touching merge, 24:00, payload limits, blocked-time and rules validation) |
| pgTAP `09_availability` | 55/55 — atomic week save, overlaps (function and direct insert), cross-business reads/writes, DST lengths (Nov 1 2026 = 25 h, Mar 8 2026 = 23 h, gap 01:30–03:30 = 1 h), hours/lunch/closed day/blocked time, DST job ends both directions, midnight, slot alignment, capacity 2 with confirmed jobs, buffer, pending requests not counted, daily cap with appointments and holds, booking mode prerequisites |
| All pgTAP + Node | 628/628 + 25/25, `db lint` clean |
| E2E `availability.spec.ts` | 10/10 (stable with `--repeat-each=2`) — hours with lunch break saved exactly, overlap and end-before-start refused with nothing saved, midnight, close a day; blocked all-day across DST (25 h / 23 h in the database), multi-day, timed in CST, local-time list, the booking check honouring a block, removal; rules saved and validated; instant mode refused without a bookable service (quote-only doesn't count) and without hours, then on/off; isolation (B can't see A's blocks, tampered remove refused, B's saves don't touch A); no horizontal scroll at 1280/390 px |
| All E2E against the production build | 46/46 |
| Build + bundle secret scan | pass; 29 browser files clean |
| Marketing film + CSP | unchanged; no CSP violations |

### Findings

- **F-4B-1 (fixed during 4B, security):** the new overlap trigger, and the 4A pricing trigger, ran before RLS's insert check. A signed-in owner inserting into another business's hours would get "working hours overlap", revealing those hours, instead of a permission error. Both triggers now defer to RLS for non-members (42501); pgTAP regression tests cover both.
- **F-4B-2 (fixed):** the public hours check was an hour off for jobs crossing a DST change, and refused jobs ending exactly at midnight.
- **F-4B-3 (fixed):** buffers, start-time alignment and the daily cap were stored but not enforced (finding B3, planned for 4D); they're enforced now.
- **Limits:** one schedule resource per business (a shop's capacity is shared, not per bay); the daily cap counts jobs by local start day; a single job can't span days in the public check (multi-day jobs remain owner-scheduled).

## 4C — Public booking pages

Migration 11 (`20261031140000_public_booking.sql`) builds on the Phase 1 restricted public API (migration 6) — no new tables.

**Routes**
- `/book/[slug]` — the business's public page: name, initials mark (no logo uploads yet), service area or shop address, phone/text, description (`booking_settings.intro_text`), services grouped by category, booking policies. Unknown, unpublished, suspended or closing businesses all get the same 404 "This booking page isn't available".
- `/book/[slug]/preview` — the signed-in owner's own page in any state (live or offline), with real times; booking disabled. Anyone else: 404.
- `/r/[token]` — the customer's status link (DESIGN_SYSTEM §13.11): status headline (PRODUCT_PLAN §6.4), time, price breakdown, vehicle, masked contact, withdraw / cancel / accept or decline a suggested time. `Referrer-Policy: no-referrer`, `noindex`, `no-store`.
- `/app/booking-page` — owner: Live/Offline, link + copy, preview, readiness checklist, description and policy text, online-cancellation switch. Nav item "Booking page"; Today checklist "Put your booking page live".

The plan and design system name the public route `/b/[slug]`; Phase 4C uses `/book/[slug]` as instructed. Settings shows the new link.

**Flow** (one screen per step on phones, summary rail on desktop, sticky estimate bar on phones): Service (vehicle size → service → add-ons, price for the chosen size) → Time (14-day date strip, 48px start-time buttons, business time zone, warning when the visitor's device is in another zone) → Details (name, email, mobile phone, vehicle year/make/model + notes, address for mobile jobs, notes) → Review (breakdown, estimate vs. confirmed wording, policies, consent) → status link.

**Database (migration 11)**
| Piece | What it does |
|---|---|
| `app.public_time_problem()` | One availability engine: returns the first rule a time breaks (notice, window, hours/breaks, slot alignment, blocked time, capacity incl. buffer, daily cap) or null. `check_public_time` now wraps it. |
| `public_api.get_available_slots(slug, services, size, from, days≤14, ip_hash)` | Lists open start times day by day using the same engine, so listed times and accepted times can't disagree. Rate-limited (120 calls / 10 min per hashed IP). |
| `public_api.get_booking_page` | Payload extended: booking mode, categories, shop address, policy flags (allow-listed; still no email, account status or capacity). |
| `submit_booking_request` | Unchanged validation (Phase 1 body moved to `app.submit_booking_request_core`). **Instant mode:** takes the capacity lock first, then creates the customer + vehicle (never merged) and the appointment in the same transaction; any failure rolls everything back. Approval mode: pending request only (pending requests take no capacity, D-32). |
| **R2 / D3 fixed** | Public functions return `{"error": {code, message, detail}}` instead of raising, so the failed attempt's rate-limit row is kept: failed submissions 10 / 10 min per hashed IP; failed status-link lookups 10 / 10 min per hashed IP (on top of the Phase 1 limits for successful calls). |
| `public.set_booking_page_live(bool)` | Going live needs an activated account, working hours and a bookable main service; offline = unpublished. |
| `public.preview_booking_page()`, `public.preview_available_slots()` | Owner-only preview (SECURITY INVOKER wrappers over `app.*_impl`). |

**Server (`src/lib/booking/server.ts`, server-only)**: connects as `booking_api` (`BOOKING_DATABASE_URL`) — the role can only execute `public_api` functions. Client IPs are HMAC-SHA256'd with `BOOKING_HASH_SECRET` before reaching the database. Status tokens are a 256-bit HMAC of the form's random idempotency key (only the SHA-256 hash is stored), so a retried submit returns the same link for the one stored request. The browser sends ids and a start time only; prices, durations, business and availability are derived and checked by the database.

**Local setup**: `npm run env:local` now also enables the local `booking_api` login and writes `BOOKING_DATABASE_URL` + `BOOKING_HASH_SECRET` (re-running keeps them). A database reset recreates the role without a login; `npm run db:reset` (and `npm test`) re-applies it from `.env.local`. **Production:** set both variables as server-only secrets; the client IP is read from the first `x-forwarded-for` entry, which must be set by the hosting platform (Vercel overwrites it) — behind another proxy, configure it to overwrite the header.

**Duplicates**: public bookings never merge. Instant bookings create a new customer + vehicle; approval-mode requests get theirs at approval. The owner's customer list shows a "Possible duplicate" badge and the customer page names the matching records (same phone or email).

### Tests (2026-10-31)

| Suite | Result |
|---|---|
| Unit | 35/35 (12 new: size pricing, estimates, validation, payload allow-list, error and status copy, policy wording, owner text limits) |
| pgTAP | 673/673 — new `10_public_booking` (43): slots with hours, breaks, blocked time, buffer, capacity, sizes, horizon, quote-only; listed time accepted / unlisted refused; pending don't remove times; instant booking (appointment + new customer + vehicle, not merged; overlap and buffer refused, nothing left behind; next slot books); price breakdown; cancellation cutoff both ways; rebook after cancel; 10 guessed links counted then refused; publishing prerequisites; preview; privileges. `06_public_api` updated for errors-as-results with two new R2 assertions |
| Node | 25/25 (race test updated for errors-as-results; booking role state restored after tests) |
| E2E `booking.spec.ts` | 10/10 — publish/preview/offline 404/owner text; approval flow with size pricing, add-on, invalid input, consent, pending (not confirmed) and withdraw; instant flow on a phone with duplicate flag; capacity conflict between two customers; double-click + replay → one booking, same link; rate limiting; status-link headers, wrong/altered/malformed links, cancellation cutoff; cross-business tampering; layouts at 1280/390 px |
| All E2E (production build) | 56/56 |
| Build, bundle scan (33 browser files), `db lint`, marketing film, CSP | pass / clean / unchanged / no violations |

### Findings and limits

- **Fixed during 4C:** the "Review" button became the submit button during the same click (same DOM element), submitting the form once before the customer pressed Send. Buttons now have distinct keys; regression-tested.
- **Fixed during 4C:** `db reset` left `booking_api` without a login (local booking pages broke after `npm test`); handled by `scripts/booking-role.mjs`.
- No logo uploads (no storage yet) — the header shows the business's initials. No emails or texts are sent: the customer keeps the status link shown on screen (copy-link button).
- Business email is not shown publicly (Phase 1 allow-list); phone is.
- One vehicle and one main service per booking (plus add-ons); several main services in one booking is possible in the database but not offered in the UI.
- Approval-mode requests can't yet be approved from the dashboard — that's Phase 4D (owner request management).
- The rate-limit key is the client IP from `x-forwarded-for`; correct behind Vercel, needs proxy configuration elsewhere.
