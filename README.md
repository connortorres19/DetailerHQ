# DetailerHQ

Booking requests, scheduling, customers and vehicles for independent auto detailers. **In development** — not deployed, invite-only, working name.

- Plans: [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) · [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- Phase records: [database](docs/PHASE1_DATABASE.md) · [marketing site & film](docs/PHASE2_MARKETING_SITE.md) · [app](docs/PHASE3_APP.md)

## Run it locally

Needs Node.js 22 and Docker (for the local Supabase stack). No hosted services, no paid accounts.

```bash
npm install
npx supabase start          # local Postgres, Auth and Mailpit (emails: http://127.0.0.1:54324)
npm run env:local           # writes .env.local from the local stack
npm run dev                 # http://localhost:3000
```

Access is invite-only. Invite yourself, open the email in Mailpit, set a password, then set up your business:

```bash
npm run invite -- you@example.com
```

The marketing site is at `/`; the app is at `/app` (sign in at `/sign-in`).

## Checks

```bash
npm run lint && npm run typecheck
npm run test:unit           # validation, phone/slug rules, time zones (DB-checked), DST
npm test                    # database: reset → pgTAP (554) → Node concurrency/API tests
npm run test:e2e            # app end-to-end incl. cross-business isolation (needs supabase start)
npm run build && npm run test:bundle   # production build + secret scan of browser assets
```
