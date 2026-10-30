# Phase 0 — Documentation verification

> **Date:** 2026-10-30 · **Plan revision checked:** PRODUCT_PLAN revision 4 (approved direction)
> **Scope:** documentation review only. **Nothing here has been tested.** A statement marked "Confirmed by documentation" means the official documentation says so; it still needs to be exercised in Phase 1 tests before we rely on it.

## How the documentation was read

The session's network policy blocked direct access to `supabase.com`, `www.postgresql.org` and `vercel.com`. The sources were therefore read as follows:

| Vendor | Method | Version read | Strength of evidence |
|---|---|---|---|
| Supabase | Official docs source in the public `supabase/supabase` GitHub repository (`apps/docs/content/guides`) — the content published at supabase.com/docs | Commit `632989957b27b357d7c29aa57693b4923e1e3db4`, 2026-10-30 | **Full text read** |
| PostgreSQL | Official documentation source in the public `postgres/postgres` repository (`doc/src/sgml`), branch `REL_17_STABLE` | Commit `1fd6ed1f8cf5e0e40d2c66ea0ac4788af757b937`, 2026-10-30 | **Full text read** (PostgreSQL 17; behavior cited is long-standing across versions) |
| Next.js | Official docs source in the public `vercel/next.js` repository (`docs/`) | Commit `fcd3fdebca56171100eaf2bae4bcb05f14fed5a1`, 2026-10-29 (main branch; may describe features newer than the stable release we install) | **Full text read** |
| Vercel | Web search restricted to `vercel.com`; summaries of official pages | Search on 2026-10-30 | **Weak — search summaries only, pages not read in full.** Re-read when `vercel.com` is allowed in the environment's network settings |

The links below point to the published pages.

---

## 1. Supabase database roles and default privileges

**Sources**
- Postgres Roles — https://supabase.com/docs/guides/database/postgres/roles
- Securing your API — https://supabase.com/docs/guides/api/securing-your-api
- Using Custom Schemas — https://supabase.com/docs/guides/api/using-custom-schemas
- Database Functions (Function privileges) — https://supabase.com/docs/guides/database/functions
- API keys — https://supabase.com/docs/guides/getting-started/api-keys
- PostgreSQL `ALTER DEFAULT PRIVILEGES` — https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html
- Platform-default change discussion — https://github.com/orgs/supabase/discussions/45329

**Confirmed by documentation**
- Built-in roles: `postgres` (admin privileges), `anon` (Data API without a signed-in user), `authenticator` (validates the JWT and switches role), `authenticated` (Data API with a signed-in user), `service_role` ("used by the API … to bypass Row Level Security"), plus internal roles (`supabase_auth_admin`, `supabase_storage_admin`, `supabase_admin`, others).
- `service_role` "has the `BYPASSRLS` attribute"; secret keys (`sb_secret_…`) map to it and "must never leave your control". Publishable keys (`sb_publishable_…`) map to `anon`, or to `authenticated` when a user JWT is present. Legacy `anon`/`service_role` JWT keys still work alongside the new keys until disabled. Secret keys are rejected when sent from a browser (User-Agent check).
- **On existing projects, new objects in `public` automatically receive** `select, insert, update, delete, truncate, references, trigger` (+`maintain` on PG17) on tables, `execute` on functions, and `usage, select, update` on sequences **for `anon`, `authenticated` and `service_role`**. Supabase states it is changing the platform default to opt-in; "default privileges differ between projects", and a catalog query is provided to check a given project.
- The Dashboard setting **"Automatically expose new tables"** revokes the Data-API privileges but leaves `truncate`, `references`, `trigger`, `maintain` and sequence `update`.
- **PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` through a global default; a per-schema revoke cannot remove it** (both Supabase and PostgreSQL docs). It must be revoked globally: `alter default privileges for role postgres revoke execute on functions from public;`. Supabase warns this also affects helper functions used by RLS policies, which then need explicit `grant execute`.
- Custom login roles: `create role … with login password …` is supported, and Supabase recommends "a new user for every service" you give access to.

**Uncertain / to test**
- The exact default ACLs of *our* project (depends on creation date and settings) — run the documented `pg_default_acl` query in Phase 1.
- Whether revoking `service_role` defaults interferes with any Supabase tooling we use (none planned).
- Whether `pg_graphql` is enabled on new projects (docs describe enabling it; introspection is off by default from 1.6.0). Check the project and drop it if unused.

**MVP approach**
- In the first migration, run the four documented `alter default privileges … revoke` statements (tables, sequences, functions per schema; functions globally from `PUBLIC`), and turn off "Automatically expose new tables".
- Revoke existing grants on any objects already present, then grant explicitly per object (PRODUCT_PLAN §8.2).
- Grant `execute` on RLS helper functions (`app.is_member`, `app.can_write`) to `authenticated` explicitly.
- Catalog test in CI asserting `anon`, `PUBLIC` and unintended roles hold no privileges (PRODUCT_PLAN §13.2).

---

## 2. Row Level Security and security-definer functions

**Sources**
- Row Level Security — https://supabase.com/docs/guides/database/postgres/row-level-security
- Database Functions — https://supabase.com/docs/guides/database/functions
- Securing your API — https://supabase.com/docs/guides/api/securing-your-api
- PostgreSQL Row Security Policies — https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- PostgreSQL `CREATE FUNCTION` (Writing SECURITY DEFINER Functions Safely) — https://www.postgresql.org/docs/17/sql-createfunction.html

**Confirmed by documentation**
- "A table in an exposed schema without RLS is readable and writable by any role with a grant on it." Policies do not remove grants — grants and RLS must both be set.
- Tables created via SQL/migrations need `enable row level security` explicitly (Dashboard-created tables have it on by default).
- PostgreSQL: superusers and roles with `BYPASSRLS` always bypass RLS; table owners bypass it unless `FORCE ROW LEVEL SECURITY` is set.
- Supabase: "A function created in the Dashboard or by a migration is owned by `postgres`, which bypasses Row Level Security." **Therefore `FORCE ROW LEVEL SECURITY` would not apply to our `postgres`-owned definer functions at all** (BYPASSRLS takes precedence) — revision 4's reason for not forcing RLS ("forcing would break our functions") was wrong; the correct statement is "forcing adds no protection for `postgres`-owned code". Plan corrected (REC-21).
- **"A `security definer` function in an exposed schema is callable over the Data API with the creator's privileges. Never create one in a schema listed under 'Exposed schemas'."** Revision 4 placed owner workflow definer functions in `public` — **this conflicts with Supabase guidance; plan changed** (REC-25).
- Prefer `security invoker` (the default); every `security definer` function must `set search_path = ''` and schema-qualify names; check ownership/membership inside the function body; narrow `execute` (revoke from `public` and `anon`, grant to the specific role). PostgreSQL docs give the same guidance on `search_path` and revoking default `PUBLIC` execute.
- Performance: wrap `auth.uid()` as `(select auth.uid())` so it is evaluated once per statement; index every column policies filter on — a composite PK `(business_id, user_id)` does **not** index `user_id`.
- Views run as their owner (bypassing RLS) unless created with `security_invoker = true` (PG15+).
- Security definer helper functions are the documented way to avoid recursive policies on membership tables.
- pgTAP tests via `supabase test db` are the documented RLS testing approach — https://supabase.com/docs/guides/database/testing

**Uncertain / to test**
- `rolbypassrls` for `postgres` on our project (Supabase documentation implies true) — check with `select rolbypassrls from pg_roles where rolname = 'postgres'`.
- That `security invoker` wrapper functions in `public` calling definer functions in an unexposed `app` schema behave as expected through the Data API (requires `usage` on schema `app` and `execute` on the implementation for `authenticated`).

**MVP approach**
- RLS enabled on every table in `public`; FORCE not used (no benefit for `postgres`-owned objects; may be revisited if tables are later owned by a non-bypass role).
- Definer functions **only** in unexposed schemas (`app`, `public_api`) with `search_path = ''`, explicit membership/token checks, and execute granted to one role.
- Owner workflow surface = thin `security invoker` wrappers in `public` that call `app.*` implementations (REC-25).

---

## 3. Supabase Auth email verification and server-side sessions

**Sources**
- Send emails with custom SMTP — https://supabase.com/docs/guides/auth/auth-smtp
- General configuration — https://supabase.com/docs/guides/auth/general-configuration
- Users (invites) — https://supabase.com/docs/guides/auth/users
- Password security — https://supabase.com/docs/guides/auth/password-security
- Creating a Supabase client for SSR — https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Advanced SSR guide — https://supabase.com/docs/guides/auth/server-side/advanced-guide

**Confirmed by documentation**
- **The built-in SMTP sender only delivers to addresses that are members of the project's organization team** ("Email address not authorized" otherwise), has low, changeable rate limits and no SLA. A custom SMTP provider is required for email/password sign-up confirmations, password resets and invitations to real users. After configuring custom SMTP, an initial limit of 30 messages/hour applies (adjustable).
- **Consequence: a custom SMTP provider is required before the pilot**, not only before the public launch. Choosing one requires registering an account — needs explicit user approval (Q-7). Supabase lists several providers; no provider is chosen here.
- "Allow new users to sign up" can be disabled so only existing users sign in; "Confirm Email" requires confirmation before first sign-in.
- Invitations are an admin action from the Dashboard or server-side with a secret key; invited users get an email link that confirms their address. → Pilot invites can be sent **from the Dashboard**, so the deployed app does not need the secret key.
- Leaked-password protection (HaveIBeenPwned) is **Pro plan and above**; minimum length and character requirements are configurable.
- SSR: `@supabase/ssr` stores the session in cookies, uses PKCE; in Next.js a Proxy file (`proxy.ts`, named `middleware.ts` before Next.js 16) refreshes tokens. **Server code must use `supabase.auth.getClaims()`; never trust `getSession()` on the server.** `getUser()` is needed where session revocation matters (e.g., sign-out on another device).
- **Session cookies are not HttpOnly by design** ("This is not necessary… the browser-based side of your application needs access to the refresh token"). → An XSS bug would expose the owner's tokens; a strict Content Security Policy and output escaping are essential. It also confirms owners can call Data API functions directly with their own token (E20 / REC-20).
- Responses that refresh sessions set cookies; CDN/ISR caching of such responses can leak sessions to other users — authenticated routes must not be cached.

**Uncertain / to test**
- Exact behavior of Dashboard invites when public sign-up is disabled (expected to work because invited users are created by an admin; test in Phase 2).
- Our Next.js version's Proxy naming (`proxy.ts` vs `middleware.ts`) depends on the version installed.

**MVP approach**
- Pilot: disable public sign-up; operator invites owners from the Dashboard; Confirm Email on; custom SMTP configured (after approval).
- Server code uses `getClaims()` for authorization and `getUser()` for sensitive actions (closure, email change).
- No caching of authenticated routes; CSP from Phase 2.

---

## 4. Supabase connection pooling and transaction compatibility

**Sources**
- Connect to your database — https://supabase.com/docs/guides/database/connecting-to-postgres
- Connection pooling and limits — https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits
- Serverless drivers — https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers
- Vercel KB: Efficiently manage database connection pools with Fluid compute — https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute *(search summary only)*
- `@vercel/functions` API reference — https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package *(search summary only)*

**Confirmed by documentation**
- Shared pooler (Supavisor): every plan, IPv4, session mode on port 5432 and **transaction mode on port 6543**. Dedicated pooler (PgBouncer): Pro+, transaction mode only, IPv6 unless the IPv4 add-on is bought.
- **"If you connect as a custom role through the shared pooler, the username is `[ROLE].[PROJECT-REF]`."** → The restricted `booking_api` login role (REC-13) is a documented connection pattern.
- For serverless functions: use the shared pooler in transaction mode; create the client at module scope; **disable prepared statements**; SSL `require`; Supabase recommends pool size 1 per instance.
- Transaction-mode limitations: no prepared statements (shared pooler), no session state between transactions (`SET`, session-level advisory locks, `LISTEN/NOTIFY`, temp tables), no query pipelining; `postgres.js` pipelines by default and can misbehave.
- supabase-js uses the Data API over HTTPS, which "has a built-in connection pooler" suited to serverless.

**Vercel (search summaries — not fully read)**
- Vercel recommends creating the pool at module scope and calling `attachDatabasePool(pool)` (supports `pg`) under Fluid compute; Vercel's guide reportedly advises **against** a max pool size of 1 under Fluid compute — **this conflicts with Supabase's "pool size 1" advice** and must be resolved by reading both pages in full and measuring.

**Compatibility with our design**
- Our scheduling and booking writes are **one database function call each**. PostgreSQL treats every single statement as its own transaction (implicit `BEGIN`/`COMMIT`), so each call is atomic regardless of pooler mode. The capacity lock is a transaction-level row lock (`SELECT … FOR UPDATE`), not a session-level advisory lock, so it is compatible with transaction-mode pooling.

**Uncertain / to test**
- An actual connection as `booking_api.[project-ref]` through the shared pooler (not tested).
- Pool sizing under Vercel Fluid compute; latency from Vercel region to Supabase region.
- Which isolation level the Data API (PostgREST) uses for RPC calls (PostgREST docs not reachable). The design handles both outcomes (see §6).

**MVP approach**
- Public path: `pg` (node-postgres) client, module-scope pool, small max (start 1–2, tune), prepared statements off, `sslmode=require`, shared pooler transaction mode, user `booking_api.[project-ref]`.
- Owner path: supabase-js over the Data API (no direct database connection needed).

---

## 5. Vercel server-side environment variables and deployment behavior

**Sources**
- Next.js Environment Variables — https://nextjs.org/docs/app/guides/environment-variables
- Next.js Data Security — https://nextjs.org/docs/app/guides/data-security
- Next.js `serverActions` config — https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- Vercel Config and Secret environment variables — https://vercel.com/docs/environment-variables/sensitive-environment-variables *(search summary only)*
- Vercel Request headers — https://vercel.com/docs/headers/request-headers *(search summary only)*
- Vercel Hobby plan — https://vercel.com/docs/plans/hobby and Fair Use Guidelines — https://vercel.com/docs/limits/fair-use-guidelines *(search summaries only)*

**Confirmed by documentation (Next.js, full text)**
- Only `NEXT_PUBLIC_*` variables are inlined into the browser bundle at build time; others are available only in the Node.js environment. Dynamic lookups are not inlined.
- `import 'server-only'` causes a build error if the module is imported in client code.
- **Server Actions are reachable by direct POST requests**; authentication and authorization must be re-checked inside every action; validate all input.
- Server Actions compare the `Origin` header host with `Host`/`X-Forwarded-Host` and reject mismatches; **a request with no `Origin` header is allowed with a warning**. → Public booking actions must be treated as a public API: abuse protections must not rely on origin checks.

**Reported by Vercel documentation (search summaries — to re-read)**
- Environment variables are now typed **Config** or **Secret**; Secret values are write-only after saving and redacted in build logs (replaces the older "Sensitive" label).
- Environment variable changes apply to new deployments.
- `x-forwarded-for` carries the client's public IP and **Vercel overwrites incoming values to prevent spoofing**; if another proxy (e.g., Cloudflare) sits in front, it contains the proxy's IP instead.
- Hobby is restricted to non-commercial personal use; commercial use includes business purposes → Pro is required for the pilot.

**MVP approach**
- Store `booking_api` connection string and IP-hash salt as Vercel **Secret** variables, never `NEXT_PUBLIC_`.
- Only the Supabase URL and publishable key use `NEXT_PUBLIC_`.
- Rate-limit on the leftmost `x-forwarded-for` value; do not put another proxy in front of Vercel without revisiting this.
- Bundle secret scan in CI (unchanged).

---

## 6. PostgreSQL locking, exclusion constraints and capacity enforcement

**Sources**
- Transaction Isolation — https://www.postgresql.org/docs/17/transaction-iso.html
- Explicit Locking (row locks, deadlocks) — https://www.postgresql.org/docs/17/explicit-locking.html
- Function Volatility Categories — https://www.postgresql.org/docs/17/xfunc-volatility.html
- Current Date/Time — https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT
- Exclusion Constraints — https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION
- Transactions tutorial — https://www.postgresql.org/docs/17/tutorial-transactions.html
- Client connection defaults (`default_transaction_isolation`) — https://www.postgresql.org/docs/17/runtime-config-client.html

**Confirmed by documentation**
- Default isolation is **Read Committed**. Each statement sees data committed before *that statement* began; two successive statements in one transaction can see different data.
- `SELECT … FOR UPDATE` **waits** for a concurrent transaction holding the row, then locks and returns the **updated** row (or no row if deleted). Under Repeatable Read/Serializable it instead raises `could not serialize access due to concurrent update`.
- PostgreSQL detects deadlocks and aborts one transaction; which one is unpredictable.
- **`VOLATILE` functions take a fresh snapshot at the start of each query they execute; `STABLE`/`IMMUTABLE` functions use the calling query's snapshot.** → The capacity check must be `VOLATILE` (the default). If it were `STABLE`, its count could miss blocks committed by the transaction it just waited for — an overbooking bug.
- `now()`/`current_timestamp` return the **transaction start time** (constant within the transaction); `clock_timestamp()` changes during it.
- Exclusion constraints compare **pairs** of rows ("at least one comparison returns false") — they cannot express "at most C overlapping rows" for C > 1. Confirms replacing the revision-3 exclusion constraint (REC-24).
- Every single SQL statement runs in an implicit transaction.

### 6.1 Capacity algorithm — how each concern is handled

| Concern | Handling | Basis |
|---|---|---|
| Overlapping intervals of different durations | Blocks store `during tstzrange '[)'`. For a new interval `[s, e)`, compute usage at `s` and at every active block start inside `(s, e)`; usage(t) = count of active blocks with `lower ≤ t < upper`. Peak = max. Reject if `peak + 1 > C`. Correct because usage only increases at block starts. | Math; range `[)` semantics |
| Active holds | Holds/proposals are blocks; counted only if `expires_at > now()`. | `now()` = transaction start (doc) |
| Expiration | No job is needed for correctness: expired rows are ignored by the predicate at the instant they expire. A `pg_cron` sweep deletes them later for tidiness and notifications. A hold that expires *during* a transaction counts as active for that transaction (conservative — never overbooks). | `now()` doc; `pg_cron` docs (https://supabase.com/docs/guides/cron/quickstart) |
| Simultaneous booking requests | Every capacity-affecting write first runs `SELECT … FROM schedule_resources WHERE id = $1 FOR UPDATE`. Concurrent writers queue; under Read Committed the next **separate** statement (the count) takes a fresh snapshot and sees the first writer's committed block. | Read Committed + `FOR UPDATE` docs; `VOLATILE` snapshot doc |
| Snapshot pitfall | Capacity function and trigger functions must be `VOLATILE` and the lock and count must be **separate statements** (not one query). | Volatility doc |
| Unknown isolation of the caller (e.g., PostgREST) | Under Repeatable Read/Serializable the lock raises a serialization error instead of waiting → safe (no overbooking) but the caller must surface "try again". Handle SQLSTATE `40001` and deadlock `40P01` as retryable/"time was just taken". | Isolation doc; deadlock doc |
| Deadlocks | Fixed lock order: resource(s) by id → booking request → appointment. PostgreSQL aborts one transaction if a cycle still occurs. | Deadlock doc |
| Self-competition (approve held request, reschedule) | Delete/update the request's own hold or the appointment's own block in the same transaction before/within the check; the check excludes the row being updated. | Read Committed: a transaction sees its own uncommitted changes |
| Multiple resources (later) | One job may allocate several resources (technician + bay). Lock **all** involved resource rows in ascending id order, run the peak check per resource, then insert allocations — all in one transaction. | Deadlock doc (consistent ordering) |
| Indexing without extra extensions | GiST index on `during` plus B-tree on `resource_id` avoids depending on `btree_gist` (whose availability on Supabase was not found in the docs read). | — |

**Uncertain / to test (Phase 1)**
- The full concurrency suite (PRODUCT_PLAN §13.3) with multiple real connections against a local Supabase stack — nothing above has been executed.
- Lock contention latency is expected to be negligible at small-business volumes; to be measured.

---

## 7. Restricted public booking endpoint and required permissions

**Sources:** sections 1–5 above, plus Supabase's recommendation to create a dedicated database user per service (Postgres Roles page) and the Securing your API "Pre-request checks" section.

**Confirmed by documentation**
- A dedicated login role can be created and connected through the shared pooler as `[ROLE].[PROJECT-REF]`.
- Functions in unexposed schemas are not reachable through the Data API; definer functions must not live in exposed schemas.
- Without revoking the global `PUBLIC` default, any new function would be executable by `anon` — the global revoke is mandatory for this design.
- Supabase documents an alternative pre-request function on the Data API for per-IP rate limiting based on `x-forwarded-for`; we do not need it because public booking does not use the Data API.

**Required permissions (recommended configuration)**

| Object | `booking_api` |
|---|---|
| Role attributes | `LOGIN`, `NOINHERIT`, no `BYPASSRLS`, `CONNECTION LIMIT` small (e.g., 10), `statement_timeout` (e.g., 5 s) set on the role |
| Schema `public_api` | `USAGE` |
| Functions in `public_api` | `EXECUTE` on each function individually |
| Schemas `public`, `app` | none |
| Any table, view, sequence | none |
| Owner workflow functions | none |

The `public_api` functions are `SECURITY DEFINER` (owned by `postgres`), `search_path = ''`, validate every input, derive `business_id` from the slug or token hash, and return allow-listed columns only.

**Uncertain / to test**
- Connecting as `booking_api` through the pooler from a Vercel function (not tested).
- `NOINHERIT` behavior on Supabase (a Supabase troubleshooting article exists about custom roles inheriting unexpected privileges; not read).

**MVP approach:** keep REC-13 (dedicated role) as primary; the service-role fallback (Q-8) is unlikely to be needed but stays documented.

---

## 8. Summary of plan changes caused by verified documentation

| # | Change | Reason |
|---|---|---|
| CH-1 | Owner workflow functions move to unexposed schema `app` as `SECURITY DEFINER`; `public` holds only thin `SECURITY INVOKER` wrappers (REC-25) | Supabase: never create definer functions in exposed schemas |
| CH-2 | REC-21 rationale corrected: FORCE RLS gives no protection for `postgres`-owned functions (BYPASSRLS); keep RLS enabled, not forced | PostgreSQL + Supabase docs |
| CH-3 | Default-privilege revocation uses Supabase's documented statements including the **global** `PUBLIC` execute revoke, explicit `execute` grants on RLS helpers, and disabling "Automatically expose new tables" | Supabase + PostgreSQL docs |
| CH-4 | **Custom SMTP required before the pilot** (default sender only reaches team members); approval needed (Q-7) | Supabase Auth SMTP docs |
| CH-5 | Pilot invite flow: disable public sign-up, invite from the Dashboard | Supabase Auth docs |
| CH-6 | Server auth uses `getClaims()`/`getUser()`, never `getSession()`; Proxy file refreshes tokens; no caching of authenticated routes; CSP emphasized because session cookies aren't HttpOnly | Supabase SSR docs |
| CH-7 | Capacity function/trigger must be `VOLATILE` with lock and count as separate statements; handle `40001`/`40P01`; GiST on `during` without `btree_gist` | PostgreSQL docs |
| CH-8 | Public path connection settings: shared pooler transaction mode, `booking_api.[project-ref]`, prepared statements off, SSL require, small pool | Supabase pooling docs |
| CH-9 | Use new publishable/secret API keys; Vercel Secret-type variables for server secrets | Supabase API keys docs; Vercel (search-level) |
| CH-10 | Public Server Actions treated as public APIs (no reliance on Origin check) | Next.js docs |

## 9. Remaining verification (not possible in this session)

- Read Vercel pages in full (blocked host): environment variables, request headers, Hobby/fair use, Fluid compute pooling.
- PostgREST transaction/isolation behavior for RPC (postgrest.org not read).
- Hands-on checks in Phase 1 (local Supabase stack — requires installing the Supabase CLI and Docker images, i.e., new dependencies needing approval): default ACL query, `rolbypassrls`, wrapper → definer call path, `booking_api` permissions, capacity concurrency suite.
- Hosted-project checks before pilot: `pg_graphql` status, "Automatically expose new tables" setting, custom SMTP delivery, pooler connection from Vercel.
