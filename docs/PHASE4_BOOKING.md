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
- `/book/[slug]` — the business's public page: name, initials mark or the published logo (Phase 6), service area or shop address, phone/text, description (`booking_settings.intro_text`), services grouped by category, booking policies. Unknown, unpublished, suspended or closing businesses all get the same 404 "This booking page isn't available".
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
- (Phase 6: logos, cover, gallery and service photos — see docs/PHASE6_BRANDING.md; without a logo the header shows the business's initials.) No emails or texts are sent: the customer keeps the status link shown on screen (copy-link button).
- Business email is not shown publicly (Phase 1 allow-list); phone is.
- One vehicle and one main service per booking (plus add-ons); several main services in one booking is possible in the database but not offered in the UI.
- Approval-mode requests can't yet be approved from the dashboard — that's Phase 4D (owner request management).
- The rate-limit key is the client IP from `x-forwarded-for`; correct behind Vercel, needs proxy configuration elsewhere.

## 4D — Owner booking management

Built on the Phase 1 owner workflow functions (approve, propose, retract, decline, close duplicate, request holds, reschedule, cancel, complete, no-show), which already take the business's capacity lock and are re-checked by the capacity trigger. No booking logic is duplicated in the app.

**Screens**
- `/app/bookings` — inbox. Filters All · Pending (incl. proposed) · Confirmed (incl. in progress) · Completed · Cancelled (incl. no-show) · Declined (incl. withdrawn, expired, proposal declined, closed duplicate), with counts. Rows: date/time, duration, customer, phone/email, services + add-ons, vehicle + size, price, notes, status. Sorted: waiting requests (soonest first), upcoming jobs (soonest first), then the rest (newest first).
- `/app/bookings/[id]` — detail: actions, time and place, price breakdown, customer (call/text/email links), vehicle, notes, history (activity events), possible-duplicate warning with links, repeat-request notice, hold and proposal notices.
- `/app/calendar` — day, week and agenda in the business time zone: confirmed jobs (solid), pending requests (dashed, amber), proposed times (dashed, blue), holds (hatched); completed/no-show muted. Hold form and active-holds list with Release.
- Navigation: Bookings and Calendar after Today; on phones the tab bar shows Today · Bookings · Calendar · Customers · More (DESIGN_SYSTEM §11.3). Today links pending requests and today's jobs to their bookings.

**Actions by status**
| Status | Actions |
|---|---|
| Pending | Confirm (new customer record by default, or an existing customer/vehicle the owner picks) · Propose another time (open times from the availability engine, re-verified on the server) · Hold / release the requested time · Decline (private reason; optional message shown to the customer) · Close as duplicate (when flagged) |
| Proposed | Withdraw proposal · Decline (the customer accepts/declines on `/r/[token]`; acceptance re-checks capacity and returns the request to pending if the time is gone) |
| Confirmed | Reschedule (open times, or any time — capacity always enforced; one statement, so no overbooking window) · Cancel (frees capacity; private reason, optional customer message) · Complete / No-show (after the start time) |
| In progress | Complete · Cancel |

**Migration 12 (`20261031150000_booking_management.sql`)**
- **Calendar holds:** `schedule_blocks.note`; a hold may stand alone (no request). Same table, capacity trigger and expiry rule as request holds: one unit of capacity for [start, end) until it expires (2–72 h, never past its start), refused if the time is full (never overrides an appointment). `public.place_calendar_hold` / `release_calendar_hold` (owners only; another business's hold is "not found").
- **Complete from scheduled:** the transition rule allows scheduled → completed directly, and the guard refuses completing a job before its start time (mirroring the existing no-show rule). `02_constraints` updated accordingly.

**Duplicates**: the detail page lists active customers with the same phone or email. Nothing merges automatically; the owner can choose one when confirming (the request's vehicle is added to them unless an existing vehicle is chosen). Phase 4C's instant bookings keep creating new records.

### Tests (2026-10-31)

| Suite | Result |
|---|---|
| Unit | 41/41 (6 new: display status, filters, sort order, history wording, date/time inputs) |
| pgTAP | 727/727 — new `11_booking_management` (54): approve (new records; owner-chosen existing customer), overlapping approval refused, approve twice refused, decline privacy on the status link, propose → accept / reject / expired / no longer available → pending, proposal into a full time refused, calendar holds (capacity, never over an appointment, validation, B can't see or release A's, release, expiry stops counting, notes only on calendar holds), cancel frees capacity, reschedule refused into a full time / allowed over its own time / block moves with it, complete only after start, no-show, cross-business refusals, privileges |
| Node | 28/28 — 3 new races: approval vs instant public booking vs calendar hold for one slot (exactly one wins, 15 rounds); two reschedules into one slot (one moves, 10 rounds); cancel vs approve (never over capacity, 15 rounds) |
| E2E `bookings.spec.ts` | 9/9 — inbox, filters, detail, confirm, overbooking refused, private decline with a customer message; duplicate warning and owner-chosen linking; propose → customer accepts / rejects on the status link; request hold + calendar hold (shown on the calendar, refused over an appointment, released); reschedule refused/allowed, cancel frees time, complete and no-show; calendar day/week/agenda with real data; cross-business 404 + tampered action refused; layouts at 390/1280 px |
| All E2E (production build) | 66/66 |
| Build, bundle scan (35 browser files), `db lint`, marketing film, CSP | pass / clean / clean / unchanged / no violations |

### Findings and limits

- **Fixed during 4D:** leaving "Show a message to the customer" unticked made decline/cancel fail (the absent field was rejected). Optional text now accepts being absent; the e2e cancel test covers it.
- **Fixed during 4D:** a controlled checkbox inside an action form desynced after React's post-action form reset; replaced by a toggle button.
- No messages are sent: the customer sees decisions on their status link; the owner can call, text or email from the detail page (opens their own apps).
- The inbox shows the 300 most recent requests and appointments (a note says so); no pagination yet.
- Calendar holds are on the single schedule resource (as all capacity is in the MVP). Converting a hold into an appointment for a phone customer is not built (owner-created appointments are a later phase).
- History shows activity events; requests created before an event existed (or inserted directly) show "No history yet".

## 4E — Owner-created appointments

For customers who call, text, walk in or are booked in person. They use the same availability engine, saved prices and capacity rules as the booking page; no booking logic is duplicated.

**Screens**
- `/app/appointments/new` — source (phone, text, walk-in, in person, other) → customer (search existing by name/phone/email, or add new) → vehicle (theirs, or add one) → vehicle size → service + add-ons (saved prices, live estimate) → date + open start time → where (address prefilled from the customer; required for mobile jobs) → internal notes → save. Confirmed straight away.
- Entry points: "New appointment" on Today, Bookings, Calendar and each customer page (`?customer=`); "Book this hold" on calendar holds (`?hold=`).
- Booking detail shows the source and internal notes; the inbox shows the source; customer pages list their appointments (both booking-page and owner-created).

**Migration 13 (`20261031160000_owner_appointments.sql`)**
| Piece | What it does |
|---|---|
| `appointments.source` (`appointment_source` enum) | booking_page · phone · text · walk_in · in_person · other. Existing rows backfilled; a trigger forces `booking_page` for appointments from requests. |
| `app.time_problem(..., check_alignment)` | The migration-11 engine body, moved; `public_time_problem` now calls it with alignment on. Owners skip start-time alignment only (a 1:15 PM hold stays convertible). |
| `app.slots_for(business, duration, …)` | The shared slot loop; the public listing and the owner listing both use it. |
| `public.owner_available_slots` | Open times for any active, priced service (including ones not offered online). Quote-only services are refused (no saved price). |
| `public.create_owner_appointment` | One transaction under the capacity lock: optional hold conversion (must be this business's active calendar hold; removed while the lock is held, so the time is never free in between) → existing or new customer (never merged) → existing or new vehicle → saved prices for the chosen size (validated first) → full availability check (hours, breaks, blocked time, notice, window, buffer, daily cap, capacity) → insert (capacity trigger re-checks). Any failure rolls back everything, including new records and the hold removal. |

### Tests (2026-10-31)

| Suite | Result |
|---|---|
| Unit | 45/45 (4 new: payload has no price/duration/business, new records, all errors at once, rules) |
| pgTAP | 779/779 — new `12_owner_appointments` (52): new and existing customers/vehicles, all five sources, booking-page source refused, saved prices and durations (incl. size override and phone-only services), quote-only refused, size required, validation, alignment not required for owners, every availability rule refusing (capacity, buffer, hours, blocked time, daily cap, notice, window) with nothing left behind, owner slot listing, hold conversion (start from hold, hold removed, history, fills the time, refused conversion keeps the hold, expired and unknown holds refused), cross-business refusals, JSON-null handling, mobile address required |
| Node | 31/31 — 3 new races: 10 simultaneous owner bookings for one slot (one wins); one hold converted twice at once (one wins, the other "not found"); hold conversion vs instant public booking (conversion always wins) |
| E2E `appointments.spec.ts` | 7/7 — phone booking for a new customer/vehicle (saved prices; injected price fields ignored; shows in inbox, day/week/agenda calendar and customer history); existing customer with existing vehicle (text) and new vehicle (walk-in), in person, other, no duplicates; tampered unavailable time refused with choices kept and nothing created; missing details all reported; hold → appointment in one step; expired hold; two tabs booking the same slot (one created); cross-business; phone layout |
| All E2E (production build) | 73/73 |
| Build, bundle scan (34 browser files), `db lint`, marketing film, CSP | pass / clean / clean / unchanged / no violations |

### Findings and limits

- **Found during 4E:** the Data API sends a JSON `null` for a jsonb argument as the jsonb value `null`, not SQL NULL; the function now treats both as "not given" (regression-tested).
- **Found during 4E:** a mobile appointment needs a street address (Phase 1 table rule); the form now requires it (prefilled from the customer).
- **Test fix (4C):** the capacity-conflict test assumed the taken time's day still had open times; late in the day the list opens on the next day. It now checks the booked day itself.
- Minimum notice applies to owner bookings too (as specified): a walk-in starting right now needs a low minimum notice (Availability → Booking rules).
- One vehicle size per booking; an existing vehicle keeps its stored size (it's only filled in when empty).
- Quote-only services can't be booked until quoting exists (later phase).
