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
