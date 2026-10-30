# Phase 3 — Functional app (auth, onboarding, settings, customers & vehicles)

Status 2026-10-30: **done locally**. Not deployed. Built entirely on the Phase 1 database: **no new tables or migrations** (the 23 tables and 8 migrations are unchanged).

In PRODUCT_PLAN §16 terms this covers Phase 2 (auth, activation, app shell) plus the customers & vehicles part of Phase 5. Booking (requests, calendar, services, availability, public pages) is Phase 4.

## Decisions applied

| Decision | Implementation |
|---|---|
| Invite-only, open registration possible later | Supabase `enable_signup = false` (Supabase itself rejects sign-ups — tested). `AUTH_SIGNUP_MODE=invite` makes `/sign-up` explain early access; `open` + Supabase sign-ups on enables the built-in sign-up form with email confirmation. Owners are invited with `npm run invite` locally or the Supabase dashboard when hosted. |
| Email confirmation; local email testing | `enable_confirmations = true`. Mailpit (`[local_smtp]`) catches every auth email locally. Email templates in `supabase/templates/` use token-hash links verified on the server by `/auth/confirm`. |
| No booking UI | Navigation shows only Today, Customers, Settings. Today's request/schedule sections read the real tables and show empty states. |
| Zod | `src/domain/*` schemas mirror the table checks; the database remains the authority. |
| "Sign in" | Used throughout. |
| Archive, don't delete | Customers and vehicles have Archive/Restore (with confirmation); there is no delete. |

## Architecture

| Layer | Where | Notes |
|---|---|---|
| Session | `src/lib/supabase/{server,proxy}.ts`, `src/proxy.ts` | `@supabase/ssr` cookie sessions. The proxy (Next 16 `proxy.ts`) runs on `/app`, `/onboarding` and auth routes only, refreshes the token with `getClaims()` first, redirects signed-out/in users, and sets `Cache-Control: private, no-store` and a nonce-based CSP. The marketing page stays static and session-free. |
| Access checks | `src/data/session.ts` | `getUser()` uses verified JWT claims (`getClaims()`, never `getSession()`); `requireUser()` / `requireBusiness()` run in every page and every server action — the proxy is not the only gate. |
| Owner data | `src/data/customers.ts`, `src/data/dashboard.ts`, server actions | Direct table reads/writes with the owner's session. **RLS scopes everything to the owner's business**; there is no business filter to forget. Inserts set `business_id` from the session; composite foreign keys stop cross-business links. |
| Workflow functions | `src/data/workflow.ts` | `callWorkflow(name, args)` — typed `rpc` to the Phase 1 owner functions with `withRetry` for 40001/40P01 and owner-facing messages for DH001–DH005. Used now by `create_business` and `set_capacity`; Phase 4's approve/hold/propose/… go through it. Error classification is shared with the Node tests (`src/db/errors.js` + `.d.ts`). |
| Types | `src/types/database.ts` | Generated: `npm run db:types`. |
| UI | `src/components/app/{ui,shell}` | DESIGN_SYSTEM §10–13: buttons, fields, notices, panels, empty states, two-step confirmations; sidebar ≥ 1024px, icon rail 768–1023px, bottom tab bar on phones. |

Routes: `/sign-in`, `/sign-up`, `/forgot-password`, `/auth/{confirm,set-password,reset-password,check-email,sign-out}`, `/onboarding`, `/app` (Today), `/app/customers` (+ `new`, `[id]`, `[id]/edit`, `[id]/vehicles/new`, `[id]/vehicles/[vehicleId]/edit`), `/app/settings`, `/app/settings/account`. The homepage moved into the `(marketing)` route group (same URL, unchanged).

Security details:
- Server-action arguments bound with `.bind()` (record IDs) are sent in plain text by Next.js; the tests rewrite them to another business's IDs and confirm RLS rejects every attempt.
- Search text is stripped of PostgREST filter syntax before use.
- `next` redirects accept same-site paths only.
- Password change re-checks the current password; email change requires confirming both addresses (`double_confirm_changes`).
- Password reset answers identically for unknown emails.
- Auth pages render per request so their scripts carry the CSP nonce (a static page's scripts would be blocked in production).

## Tests (all run 2026-10-30)

| Suite | Result |
|---|---|
| `npm run lint` / `npm run typecheck` | 0 errors (1 pre-existing warning in a Phase 1 test) / pass |
| `npm run test:unit` | 6/6 — phone E.164, slugs, onboarding rules, safe redirects, DST-aware day/week ranges, time-zone list matches `app.is_us_timezone()` |
| `npm test` (database) | pgTAP 554/554, Node 25/25 from a clean reset |
| `npm run test:e2e` | 29/29 against the **production build** (and against dev) |
| `npm run test:bundle` | browser assets contain no secret keys, `service_role`, `booking_api`, connection strings or server-only code |
| Marketing film regression (scripted) | unchanged at 1440/1280/768/375, reduced motion, Data Saver, blocked video |

End-to-end coverage: invite-only (UI and Supabase), invite acceptance (single-use link), sign in/out, protected redirects, open-redirect rejection, unconfirmed email, password reset by email, cache/CSP headers; onboarding (mobile/shop, validation, taken/reserved links, DB state); Today and shell at 3 widths; customers (validation, duplicates, search incl. filter-syntax input, edit, archive/restore, nothing deleted); vehicles (multiple, sizes, edit, archive/restore); settings (profile, read-only fields, capacity via `set_capacity`, password re-check, double-confirmed email change); **cross-business isolation** (URLs → 404, list/search, tampered server actions for edit/archive/add-vehicle/edit-vehicle/archive-vehicle, Data API with the other owner's session).

CI (`.github/workflows/ci.yml`): `web` (lint, typecheck, build, bundle scan), `app` (local Supabase + Mailpit, unit, production build, all e2e), `database` (unchanged).

## Local email in this cloud sandbox

The Mailpit image couldn't be downloaded in the cloud session that built this (registry limits). Tests there used `scripts/dev-mail-sink.mjs` with an uncommitted SMTP override (`E2E_MAIL=sink`). The committed setup uses Mailpit, which works on a normal machine and in CI.

## Not done / next

- Phase 4: services, availability, booking page, public booking through `booking_api`, request inbox, holds/proposals, appointments, capacity-aware calendar — on top of `callWorkflow`.
- Decision R2 (rate limits count only successful calls) before the public booking endpoint ships.
- Hosted Supabase project: custom SMTP (Q-7), "allow sign-ups" off, redirect URLs, templates, keys — then re-run the auth tests there.
- Slug / time zone / service mode changes after setup need new owner functions (a migration) if wanted.
- Customer service history (needs appointments), anonymisation and CSV export.
- Manual Safari / iOS testing (app and film); automated tests ran in Chromium.
