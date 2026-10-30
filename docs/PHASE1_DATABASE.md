# Phase 1 — Database foundation

> **Date:** 2026-10-30 · **Plan:** PRODUCT_PLAN revision 4.1 · **Scope:** local Supabase only; nothing deployed.
> Decision labels: D-n approved, REC-n recommendation (PRODUCT_PLAN §17).

## How to run

Prerequisites: Docker running, Node ≥ 22.

```bash
npm install
```

```bash
npm run db:start
```

```bash
npm test
```

`npm test` = `supabase db reset` (all migrations from an empty database) → `supabase test db` (pgTAP) → Node tests (`tests/node/*.test.js`, Node's built-in runner). The local stack uses the Supabase CLI's fixed development keys, read at test time from `supabase status`; no real credentials exist in the repository.

## What was built

| Migration | Contents |
|---|---|
| `20261030120000_foundation.sql` | Default-privilege revocations (tables/sequences/functions in `public`; global `EXECUTE` from `PUBLIC`), schemas `app` and `public_api`, extensions, `booking_api` role (NOLOGIN by default), enums, validation helpers |
| `20261030120100_tables.sql` | 23 tables with composite foreign keys including `business_id`, checks and indexes |
| `20261030120200_integrity_and_scheduling.sql` | Immutable `business_id`/snapshots/numbers, status-transition triggers, deferred "approved ⇒ appointment" check, quote rules, per-business numbering, **capacity engine**, appointment↔block sync, `expire_stale` housekeeping |
| `20261030120300_rls_and_grants.sql` | RLS on every table, membership policies, explicit grants (owner-writable vs read-only tables) |
| `20261030120400_owner_workflow.sql` | `app.*_impl` (SECURITY DEFINER, unexposed) + `public.*` SECURITY INVOKER wrappers |
| `20261030120500_public_api.sql` | `public_api.*` functions for the restricted booking role; rate limits; `pg_cron` schedule |
| `20261030120600_business_deletion.sql` | Explicit, ordered business data deletion (operator/system only) |

### Tables

- **Tenancy:** `businesses`, `memberships`, `business_counters`.
- **Configuration:** `booking_settings`, `availability_rules`, `time_off`, `schedule_resources`, `vehicle_size_classes`, `service_categories`, `services`, `service_prices`.
- **Customers:** `customers`, `vehicles`.
- **Leads and quotes:** `leads`, `quotes`, `quote_items`.
- **Booking:** `booking_requests`, `booking_request_items`, `appointments`, `appointment_items`, `schedule_blocks` (appointments, holds, proposals).
- **History and abuse:** `activity_events` (append-only status and scheduling history), `rate_limit_events`.

Not built in Phase 1 (later phases per plan): tasks, communications, notes, notifications, message templates, audit log, subscriptions/billing.

## Security architecture (as implemented)

| Path | Role | Can do |
|---|---|---|
| Browser → Data API, no session | `anon` | Nothing on any application table or function (verified) |
| Owner session → Data API / server action | `authenticated` | Read own business rows (RLS); CRUD on owner-writable tables (config, services, customers, vehicles, leads, quotes); **no direct writes** to requests, appointments, schedule blocks, resources, history (D-24); call `public.*` workflow wrappers |
| Workflow wrappers | invoker → `app.*_impl` (definer, `search_path=''`) | Each checks membership + `can_write`, takes the resource lock, enforces state |
| Our server → pooler → `booking_api` | `booking_api` (LOGIN set per environment) | `EXECUTE` on 8 `public_api` functions only; no table access; cannot switch roles |
| Secret key (`service_role`) | `service_role` | No grants on application tables or functions (a leaked key cannot read data through the Data API — verified) |
| Housekeeping | `pg_cron` as `postgres` | `app.expire_stale()` every 5 minutes |

Customer status links: our server generates the token and sends only its SHA-256 hash; the database never sees raw tokens. Client IPs arrive already hashed.

## Capacity engine

- **Blocks:** one row in `schedule_blocks` holds one unit of capacity on one resource over `[start, end)`.
- **What counts:** appointment blocks while the appointment is scheduled or in progress; holds and proposals only while `expires_at > now()`.
- **The check (`BEFORE INSERT/UPDATE` trigger):**
  1. Locks the resource row (`FOR UPDATE`).
  2. In a separate statement, computes peak usage over the new interval with `app.peak_usage`, a `VOLATILE` function.
  3. Rejects with `DH001 capacity_exceeded` if peak + 1 exceeds capacity.
- **Lock order:** resource → request → appointment.
- **Release:** completed, cancelled and no-show appointments give their capacity back. Reopening re-checks capacity.
- **Errors:** `src/db/errors.js` classifies errors. `withRetry` retries only `40001` and `40P01`, never business-rule errors.

## Tests and results (executed 2026-10-30, local stack)

| Suite | Assertions | Result |
|---|---|---|
| `01_schema_privileges` — catalog, grants, default ACLs, definer placement, volatility, role attributes | 26 | pass |
| `02_constraints` — cross-business FKs, vehicle ownership, immutability, checks, transitions, deferred invariant | 32 | pass |
| `03_rls_matrix` — 23 tables × {select, insert, update, delete} × {owner B, user U, anon, owner A} + fixture coverage | 391 | pass |
| `04_workflow_authorization` — other business, no business, anon, booking_api, internal functions, restricted account | 28 | pass |
| `05_capacity` — C=1/2/3, adjacency, holds, proposals, expiry, cancel/reschedule/complete, capacity changes, 48 h job, separate resources | 36 | pass |
| `06_public_api` — allow-listed output, validation, idempotency, duplicates, open-request cap, rate limit, masking, proposal accept, cancel, withdraw | 32 | pass |
| `07_deletion_and_migrations` — migration history, full deletion, isolation of other businesses | 7 | pass |
| **pgTAP total** | **552** | **pass** |
| `concurrency.test.js` — 10/12 parallel approvals, mixed holds/proposals/approvals, lock-wait snapshot (both directions), 25-round approve/withdraw race, expiry across transactions, separate resources, retry helper with a real deadlock | 9 tests | pass |
| `data-api.test.js` — real Auth users through PostgREST: cross-business read/write/RPC, D-24 direct-write denial, anon, unexposed schemas, secret key, parallel RPC capacity | 9 tests | pass |
| `booking-api.test.js` — `booking_api` through local Supavisor and direct: page, submit, masked status, no table/owner/internal access, no `SET ROLE` | 6 tests | pass |
| **Node total** | **24 tests** | **pass** |

Full `npm test` (clean reset + all suites) passed 3 consecutive times. The concurrency file was additionally run 25 times. All 15 runs after the last fixture fix passed. One earlier failure was a test-fixture slug collision, since fixed; no capacity violation was observed in any run.

## Findings during implementation

1. **Supabase defaults confirmed on the real local image (PostgreSQL 17.11):** `postgres` has `BYPASSRLS` and is not a superuser. With auto-expose off, new `public` tables still grant `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` to the Data API roles, exactly as documented — the migrations revoke them.
2. **Custom login role through Supavisor works locally** (`booking_api.pooler-dev`). After a password change, Supavisor briefly kept the old secret: the first login failed (`28P01`), the next succeeded. **Plan for password rotation accordingly** (expect a short window of failed logins; retry on startup).
3. **Business deletion via `ON DELETE CASCADE` failed** because of intentional NO ACTION references between business tables; replaced with an explicit ordered function.
4. **Deferred-trigger subtlety:** a deferred check must re-read the row at commit; fixed after the deletion test exposed it.
5. `supabase db lint`: no errors.

## Working defaults implemented from unapproved recommendations

These are **not** approved decisions. They were needed to build a working foundation and are easy to change:

| Recommendation | Implemented as |
|---|---|
| REC-01, REC-02 | Holds 2–72 h (default 24 h, never past the requested start); proposals default 48 h (2–72 h) |
| REC-03 | No override path: a hold blocking capacity must be released before another booking can use that capacity |
| REC-05 | Max 3 open requests per contact; 5 submissions per IP per business per 10 minutes, 20 per IP per day, 60 per business per hour; 30 token actions per IP per 10 minutes |
| REC-10 | Status responses mask phone and email |
| REC-12 | All request status changes go through functions (no direct owner writes to requests) |
| REC-14 | Buffers are not part of the capacity rule (and are not yet checked at submission — Phase 3 slot engine) |
| REC-15, REC-19 | Capacity decreases rejected when future bookings exceed the new value; maximum 20 |
| REC-18 | Completed appointments release capacity |
| REC-20 | Owner workflow functions are callable with the owner's own session (identical checks) |
| REC-21–REC-26 | RLS not forced; row lock; peak-usage algorithm; no exclusion constraint; definer only in `app`; pooler settings |
| Q-5 (open) | Mobile-only businesses are kept at capacity 1 (raising it is rejected until Q-5 is decided) |
| Activation | Activated accounts become `pilot` (pilot stage); trial states arrive in Phase 8 |

## Known limitations / not yet done

- **Public submission checks:** notice, horizon, working hours, time off and capacity. Not yet checked: slot-interval alignment and buffers (Phase 3 slot engine).
- **Owner soft warnings** (buffer, hours, daily cap) are an application-layer feature for Phase 4. The database enforces the hard rules only.
- **`booking_api` password:** set per environment out of band. The hosted-project username format (`booking_api.<project-ref>`) and pooler behaviour **have not been tested against a hosted project**.
- **Not built yet:**
  - customer anonymization and account-closure flows;
  - CSV export;
  - deletion scheduling. Automated deletion stays disabled under D-18.
- **No CI pipeline yet.** Running the local Supabase stack in GitHub Actions is untested.
- **Tests run against the local stack only.** Hosted Supabase defaults can differ by project age, so the catalog test must be run against the hosted project before the pilot.
