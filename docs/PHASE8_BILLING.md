# Phase 8 — Subscription billing (Stripe, TEST MODE)

DetailerHQ charges detailing businesses for the software, through **DetailerHQ's own Stripe account**.
It never processes payments between a business and its customers, and doesn't use Stripe Connect.
This phase runs in **Stripe test mode only**: live keys are refused and live events are rejected.

| Plan | Price | Terms |
|---|---|---|
| **Founding 5** | **$30 once** | Lifetime access, every feature, permanent founding status, never billed again. **Only five successful purchases, platform-wide, ever.** A claimed spot is never reopened — not by a refund, cancellation, closure or account deletion. |
| **Standard** | **$30/month** | **3-day free trial — a card is required to start.** The owner authorizes $30/month at Stripe Checkout; **nothing is charged during the trial**; Stripe charges the card at the trial end and monthly after that, until cancelled. Checkout states the exact trial end and first charge date. One trial per business. |

No add-ons, no other charges. Existing **pilot** businesses keep pilot access, are never charged
automatically, and can choose a plan in Settings → Billing when they agree.

Migration: `supabase/migrations/20261106120000_billing.sql` (additive; nothing deleted).

## Access

| Billing state | Account | Access |
|---|---|---|
| Founding (paid) | `active` | Full, permanently |
| Trial (card on file) | `trialing` | Full; banner shows the trial end and first charge date |
| Paid | `active` | Full |
| Cancelled (Customer Portal) | `cancelled` | Full until the paid period ends, then `inactive` |
| Payment failed / card expired | `past_due` | Full for **7 days** from the first failure (banner + "Update card"); then `inactive` until paid |
| Trial ended without a usable card (fallback) | `trial_expired` | Read-only |
| No active plan | `inactive` | Read-only |
| Pilot (no plan chosen) | `pilot` | Unchanged |

Read-only uses the existing rules (`app.can_write` in every write policy and workflow function): the
owner can see everything, the booking page stops accepting requests, and **no data is deleted**.
Operator states (`suspended`, `closing`) and onboarding are never changed by billing. Founding
access can be removed only by an explicit administrative decision:
`select app.revoke_founding_access('<business id>', '<reason>')` (and `app.restore_founding_access`)
as the database owner — the spot stays claimed either way.

## How it works

- **Founding 5 — exactly five.** `founding_slots` has five fixed rows (inserts, deletes and truncation
  are refused). "Become a founding member" first reserves a row in the database
  (`FOR UPDATE SKIP LOCKED`; one per business), then the server creates a one-time $30 Checkout
  session (cards only, so payment confirms instantly; expires in 31 minutes) and attaches it.
  - **Claim:** only after Stripe confirms — a verified webhook or the owner's return, both
    re-fetching the session from Stripe and checking paid, $30.00, USD, the Founding price and this
    business's own customer. A claimed row can never change back (database trigger).
  - **Release:** only when Stripe says the session **expired** (webhook, or the reconciliation that
    asks Stripe and expires overdue sessions). Never on DetailerHQ's clock alone, so a payment can't
    land on a spot that was given away. A payment with no matching reservation is refunded.
  - Remaining spots shown everywhere are `5 − claimed` from the database; "in checkout" is shown
    separately.
- **Standard.** Checkout `mode=subscription`, `payment_method_collection: always`,
  `allowed_payment_method_types: [card]`, `subscription_data.trial_end` = now + 3 days (a fixed date,
  so the dates shown are exact; the session expires after an hour),
  `trial_settings.end_behavior.missing_payment_method: cancel` (safety net). A second trial is never
  offered. A founding member's subscription — or a duplicate one — is cancelled immediately without
  a charge.
- **Webhook** `POST /api/billing/webhook`: signature verified on the raw body
  (`STRIPE_WEBHOOK_SECRET`), live-mode events refused, each event processed once (`billing_events`),
  and the subscription / session it names is **re-fetched from Stripe** before anything changes (order
  doesn't matter, forged contents don't count). Errors answer 500 so Stripe retries.
- **Database role.** The server's Stripe code connects as `billing_worker`, which can only call
  `billing_api.*` functions (no table access). Owners can read their own `business_billing` row and
  call `start_founding_reservation`; nothing else.
- **Time.** `pg_cron` runs `app.billing_tick()` every 15 minutes (grace and paid periods ending).

## Stripe configuration (dashboard, Sandbox / test mode)

1. **Products and prices** — with `STRIPE_SECRET_KEY` (Sandbox `sk_test_…`) in `.env.local`, run
   `npm run billing:setup-prices -- --write` once. It creates "DetailerHQ Founding 5 — Lifetime"
   (**one-time $30.00 USD**) and "DetailerHQ Standard" (**$30.00 USD monthly**) in your Sandbox,
   prints the Price IDs and writes them to `.env.local`. Safe to re-run: prices have fixed lookup
   keys (`detailerhq_founding_5_v1`, `detailerhq_standard_monthly_v1`), so existing ones are reused,
   never duplicated. Test keys only. (Or create them by hand: one-time and monthly $30 USD prices.)
   The app itself never creates or changes prices; it checks them.
2. **Settings → Billing → Customer portal** (Save): allow updating payment methods, invoice history,
   **cancel subscriptions at end of billing period**; turn **off** plan switching and quantity changes;
   add your business name and terms/privacy links when you have them.
3. **Settings → Billing → Subscriptions and emails / Revenue recovery**: Smart Retries on, then
   "cancel the subscription" if all retries fail (≈ 2 weeks; DetailerHQ restricts access after 7
   days on its own). Turn on emails for failed payments, expiring cards and upcoming trial ends.
4. **Developers → API keys → Create restricted key** (`rk_test_…`) — Write: Checkout Sessions,
   Customers, Subscriptions, Customer portal, Refunds. Read: Products, Prices, Invoices, Charges,
   PaymentIntents, Payment methods, Events. (A plain `sk_test_…` also works.)
5. **Webhooks (local):** `brew install stripe/stripe-cli/stripe`, `stripe login`, then

   ```
   stripe listen --forward-to localhost:3000/api/billing/webhook --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,invoice.paid,invoice.payment_failed,invoice.payment_action_required,payment_method.automatically_updated,charge.refunded,charge.dispute.created,charge.dispute.closed
   ```

   It prints a `whsec_…` secret. (A deployed site later needs a dashboard webhook endpoint with the
   same events — not part of this phase.)
6. **`.env.local`** — open it in an editor (never paste keys into chat) and set:

   ```
   STRIPE_SECRET_KEY=rk_test_…          # or sk_test_… — live keys are refused
   STRIPE_WEBHOOK_SECRET=whsec_…
   STRIPE_PRICE_FOUNDING=price_…
   STRIPE_PRICE_STANDARD=price_…
   # NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…   optional, not used (Checkout is hosted by Stripe)
   ```

   Remove `STRIPE_MOCK_URL` to use Stripe instead of the local stand-in. `npm run env:local` adds
   `BILLING_DATABASE_URL` and keeps these. Then `npm run billing:check`.
7. **Stripe Tax: off** until an accountant advises (PRODUCT_PLAN §12.7).

Test cards: `4242 4242 4242 4242` (succeeds), `4000 0000 0000 0002` (declined),
`4000 0000 0000 0341` (attaches, then fails when charged — use it to test a failed first charge after
the trial), `4000 0025 0000 3155` (needs authentication). Use **Test clocks** (Billing → Subscriptions
→ create in a test clock) to move a subscription past the trial end or a renewal without waiting.

## Costs

No monthly fee; test mode is free. Typical US pricing (confirm on stripe.com/pricing): cards about
**2.9% + $0.30** (≈ $1.17 on $30); Stripe Billing about **0.7%** of recurring volume (≈ $0.21 per
Standard month); disputes about $15; international cards +1.5%; Stripe Tax 0.5% only if enabled.
Customer Portal and Stripe CLI: free. Net ≈ $28.83 per founding payment, ≈ $28.62 per Standard month.

## Local testing without Stripe

`npm run billing:mock` starts a local **simulated** Stripe (`scripts/dev-stripe-mock.mjs`, port 12111)
— honoured only when the site is localhost and `STRIPE_MOCK_URL=http://localhost:12111` is set. The
app's real Stripe SDK, webhook signatures and database rules run unchanged; Checkout and the Portal
are look-alike pages; test controls move time (`/_test/subscriptions/:id/trial_end`,
`payment_failed`, `card_expired`, `recover`, `period_end`, `/_test/sessions/:id/expire`,
`/_test/replay/:event`, `/_test/refund/:pi`). Nothing is real: no card, no money.

Tests clean up founding spots claimed through the stand-in (session ids `cs_test_mock_…` and
`cs_test_node_…`) as the database owner so the local database keeps its five spots. Real Stripe
test-mode claims are never touched.

## Tests

- `supabase/tests/database/19_billing.test.sql` (81): exactly five fixed spots; reserve / claim /
  release rules; wrong amount, wrong business, unknown session never claim; claimed is permanent
  (also against the database owner's direct updates); refunds and disputes recorded only; admin
  revoke/restore never reopen; founding subscriptions cancelled; sold out vs in checkout; deletion
  keeps the claim; trial → read-only without a card → paid; cancel at period end; 7-day grace;
  pilots and operator states untouched; event idempotency; privileges and isolation.
- `tests/node/billing.test.js`: 20 businesses racing for the spots (never more than exist, one per
  business), triple-confirmed payments claim once, sold out afterwards, roles can't touch the table.
- `tests/unit/billing.test.ts`: 3-day / card-required wording everywhere (no 7-day or "no card"),
  founding counts, banners and headlines per state.
- `tests/e2e/billing.spec.ts` (simulated Stripe): pricing page, pilot, Founding purchase (declined →
  paid → claimed → refund recorded), abandoned checkout released on expiry, Standard trial with a
  card (no charge during it) → paid → expired card → past due → read-only → recovered, duplicate
  webhook, Portal cancel → period end → read-only → re-subscribe without a second trial, webhook
  signature / live-mode refusal, isolation, phone and desktop layouts.
