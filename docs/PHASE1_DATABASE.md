# Phase 1 — Database foundation

> **Date:** 2026-10-30 · **Plan:** PRODUCT_PLAN revision 4.1 · **Status: complete locally; hosted verification pending.**
> Decision labels: D-n approved, REC-n recommendation (PRODUCT_PLAN §17). Nothing has been deployed.

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

`npm test` = `supabase db reset` (all migrations applied to an empty database) → `supabase test db` (pgTAP) → Node tests (`tests/node/*.test.js`, Node's built-in runner). The local stack uses the Supabase CLI's fixed development keys, read at test time from `supabase status`; no real credentials exist in the repository.

**CI:** `.github/workflows/ci.yml` runs the same on every push and pull request on a free GitHub-hosted Ubuntu runner (repository is public): `npm ci` → `supabase start` → `supabase db lint --fail-on error` → `npm test` → `supabase stop`. Actions are pinned to commit SHAs. No secrets are used.

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
| `20261030120700_harden_search_path.sql` | Review fix: `search_path = pg_catalog, pg_temp` on every application function (see review finding R1) |

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
| Browser → Data API, no session | `anon` | Nothing on any application table or function |
| Owner session → Data API / server action | `authenticated` | Read own business rows (RLS); CRUD on owner-writable tables (config, services, customers, vehicles, leads, quotes); **no direct writes** to requests, appointments, schedule blocks, resources, history (D-24); call `public.*` workflow wrappers |
| Workflow wrappers | invoker → `app.*_impl` (definer, `search_path = pg_catalog, pg_temp`) | Each checks membership + `can_write`, takes the resource lock, enforces state |
| Our server → pooler → `booking_api` | `booking_api` (LOGIN set per environment) | `EXECUTE` on 8 `public_api` functions only; `USAGE` on `public`/`public_api` only; no table access; cannot create objects in any schema; cannot switch roles |
| Secret key (`service_role`) | `service_role` | No grants on application tables or functions |
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

## Test results (executed 2026-10-30, local stack, PostgreSQL 17.11)

| Suite | Assertions | Result |
|---|---|---|
| `01_schema_privileges` — catalog, grants, default ACLs, definer placement, pinned search_path on every function, volatility, role attributes | 26 | pass |
| `02_constraints` — cross-business FKs, vehicle ownership, immutability, checks, transitions, deferred invariant | 32 | pass |
| `03_rls_matrix` — 23 tables × {select, insert, update, delete} × {owner B, user U, anon, owner A} + fixture coverage | 391 | pass |
| `04_workflow_authorization` — other business, no business, anon, booking_api, internal functions, restricted account | 28 | pass |
| `05_capacity` — C=1/2/3, adjacency, holds, proposals, expiry, cancel/reschedule/complete, capacity changes, 48 h job, separate resources | 36 | pass |
| `06_public_api` — allow-listed output, validation, idempotency, duplicates, open-request cap, rate limit, masking, proposal accept, cancel, withdraw, temp-schema shadowing regression | 34 | pass |
| `07_deletion_and_migrations` — migration history (8), full deletion, isolation of other businesses | 7 | pass |
| **pgTAP total** | **554** | **pass** |
| `concurrency.test.js` — 10/12 parallel approvals, mixed holds/proposals/approvals, lock-wait snapshot (both directions), 25-round approve/withdraw race, expiry across transactions, separate resources, retry helper with a real deadlock, housekeeping concurrent with approvals/holds/declines | 10 tests | pass |
| `data-api.test.js` — real Auth users through PostgREST: cross-business read/write/RPC, D-24 direct-write denial, anon, unexposed schemas, secret key, parallel RPC capacity | 9 tests | pass |
| `booking-api.test.js` — `booking_api` through local Supavisor and direct: page, submit, masked status, no table/owner/internal access, no `SET ROLE` | 6 tests | pass |
| **Node total** | **25 tests** | **pass** |

- **Repetition:** the full `npm test` from a clean reset passed on every run during the review. The concurrency file passed 10 of 10 repeated runs after the housekeeping test was added (25 of 25 across the earlier session after a fixture fix).
- **Lint:** `supabase db lint --level warning --fail-on error` reports no errors.

## Review findings (2026-10-30)

| # | Finding | Severity | Action |
|---|---|---|---|
| R1 | With `search_path = ''`, PostgreSQL searches the session's temporary schema **first** for tables and types. Every role has `TEMP` via `PUBLIC`, so a session running as `booking_api` could shadow an unqualified type name inside a SECURITY DEFINER function (reproduced: a temp table named `bytea` broke `app.record_rate_event`). No code-execution path was found, and exploiting it requires the `booking_api` credential. | Low–medium (defence in depth) | **Fixed** by migration `20261030120700` (`pg_catalog, pg_temp`, PostgreSQL's documented secure form). Catalog test now requires it on every application function; regression test added |
| R2 | Database rate limits only count **successful** calls: a failing call raises an error and its `rate_limit_events` row rolls back with it. Reproduced: 50 guessed-token lookups from one IP were all answered and none counted (limit 30). Tokens are 256-bit, so guessing is impractical, but failed-submission spam is not throttled by the database. | Medium (abuse/DB load) | **Not changed** (needs a decision). Options: (a) server-side rate limiter in Phase 3 before calling the database (needs a store); (b) change public functions to return error results instead of raising so the attempt is recorded; (c) both |
| R3 | `app.can_write(business_id)` is SECURITY DEFINER and executable by `authenticated`; it reveals whether an arbitrary business id's account is writable. Not reachable through the Data API (`app` is unexposed); only via a direct SQL session, which `authenticated` users do not have. | Low | Documented; no change |
| R4 | All roles inherit `TEMP` on the database from `PUBLIC` (Supabase platform default). Temporary objects affect only the creating session. | Low (mitigated by R1 fix) | Documented; changing platform-wide privileges is out of scope |
| R5 | `booking_api` nominally has `EXECUTE` on Supabase-owned functions in `extensions`, `cron`, `auth`, `graphql_public` (granted to `PUBLIC` by `supabase_admin`) but has no `USAGE` on those schemas, so they are unreachable. | Informational | Verified by catalog queries |

### Capacity, expiry and concurrency review

- **Coverage:** every write path is checked by the capacity trigger, because owners and public callers cannot write `schedule_blocks` directly. That covers approve, accept proposal, manual create, reschedule, reopen, hold and propose.
- **Lock order:**
  - Owner workflow functions and public token functions lock resource, then request, then appointment.
  - `expire_stale` locks request rows and deletes blocks without the resource lock. Deleting a block needs no capacity check, and no code path holds a block lock while waiting for a request lock, so no cycle is possible.
  - The concurrent housekeeping test found no deadlocks.
- **Expiry:** correctness depends only on `expires_at > now()`. The sweep only tidies rows and moves stale requests and quotes to their final statuses. A hold expiring mid-transaction counts as active for that transaction (conservative).
- **Concurrent outcomes:** under Read Committed, the waiting transaction sees what the transaction it waited for committed, in both directions (a slot taken, or a slot freed); tested.
- **Error handling:** callers must handle `DH001`, `40001` and `40P01`. `withRetry` retries only the transient codes.

## Verified locally vs. still requires hosted Supabase testing

| Item | Local status | Hosted testing still required |
|---|---|---|
| Migrations from a clean database | Verified (`supabase db reset`, PostgreSQL 17.11 image `17.11.0.006`) | Apply to the hosted project; confirm the hosted Postgres version matches `major_version = 17` |
| Default privileges | Verified on the local image after revocation | **Yes** — hosted defaults vary by project age; run test `01` (or the catalog queries) against the hosted project; turn off "Automatically expose new tables" in the dashboard |
| RLS and cross-business isolation | Verified in SQL (pgTAP matrix) and through the local Data API with real Auth users | Re-run the Data API isolation tests against a hosted test project before the pilot |
| `postgres` has BYPASSRLS | Verified locally | Confirm on the hosted project |
| `booking_api` through the pooler | Verified with local Supavisor 2.9.13 as `booking_api.pooler-dev` (transaction mode) | **Yes** — hosted shared pooler username `booking_api.<project-ref>`, IPv4/TLS, password rotation behavior (local Supavisor briefly cached the old password) |
| `booking_api` from Vercel functions | Not tested (no app yet) | **Yes** — Phase 3, including pool sizing and `x-forwarded-for` handling |
| Capacity and concurrency | Verified locally with real parallel sessions and through local PostgREST | Re-run the concurrency suite against a hosted test project (network latency, PostgREST version) |
| `pg_cron` housekeeping | Job scheduled and function tested; the schedule itself did not run during the tests | Confirm the job runs on the hosted project (`cron.job_run_details`) |
| Supabase Auth email flows | Not tested (no app yet; local email testing service disabled) | **Yes** — custom SMTP (Q-7), confirmation, invites |
| Secret key cannot read tables via Data API | Verified locally | Confirm on hosted (new `sb_secret_` keys) |
| GitHub Actions CI | Workflow steps replayed locally; YAML validated | **First run on GitHub not observed from this session** (the Actions API is blocked here) — check the Actions tab after push |

## Working defaults implemented from unapproved recommendations

These are **not** approved decisions. They were needed to build a working foundation and are easy to change:

| Recommendation | Implemented as |
|---|---|
| REC-01, REC-02 | Holds 2–72 h (default 24 h, never past the requested start); proposals default 48 h (2–72 h) |
| REC-03 | No override path: a hold blocking capacity must be released before another booking can use that capacity |
| REC-05 | Max 3 open requests per contact; 5 submissions per IP per business per 10 minutes, 20 per IP per day, 60 per business per hour; 30 token actions per IP per 10 minutes (successful calls only — see R2) |
| REC-10 | Status responses mask phone and email |
| REC-12 | All request status changes go through functions (no direct owner writes to requests) |
| REC-14 | Buffers are not part of the capacity rule (and are not yet checked at submission — Phase 3 slot engine) |
| REC-15, REC-19 | Capacity decreases rejected when future bookings exceed the new value; maximum 20 |
| REC-18 | Completed appointments release capacity |
| REC-20 | Owner workflow functions are callable with the owner's own session (identical checks) |
| REC-21–REC-26 | RLS not forced; row lock; peak-usage algorithm; no exclusion constraint; definer only in `app`; pooler settings |
| Q-5 (open) | Mobile-only businesses are kept at capacity 1 (raising it is rejected until Q-5 is decided) |
| Activation | Activated accounts become `pilot` (pilot stage); trial states arrive in Phase 8 |

## Known limitations

- **Public submission checks:** notice, horizon, working hours, time off and capacity. Not yet checked: slot-interval alignment and buffers (Phase 3 slot engine).
- **Owner soft warnings** (buffer, hours, daily cap) are an application-layer feature for Phase 4. The database enforces the hard rules only.
- **Not built yet:**
  - customer anonymization and account-closure flows;
  - CSV export;
  - deletion scheduling. Automated deletion stays disabled under D-18.
