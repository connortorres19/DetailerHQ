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
