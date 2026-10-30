# DetailerHQ — Product Plan

> **Status:** Final draft for approval · **Revision 3** · **Last updated:** 2026-10-30
> **Working name:** DetailerHQ is provisional and has **not** been legally or commercially cleared. It is a configuration value only (§17.4). No domains, services or brand assets are to be purchased or registered without explicit approval.
> **Companion document:** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
> **Implementation has not started.** Everything below is a plan awaiting approval.

### What changed in revision 3

- **Pilot:** 3–5 independent businesses including mobile detailers; **$25 for the first month**, presented as an early-access offer. **Public subscription target: $49/month**, subject to validation.
- **Trial:** the 7-day trial starts at **account activation** (email verified + business created), not at sign-up.
- **Vehicles:** customers can have many vehicles; **every request and appointment identifies exactly one vehicle**.
- **Holds:** pending requests never block availability automatically. The business-wide "hold pending" setting is **replaced by an optional, owner-placed temporary hold per request**, with defined expiry and conflict rules.
- **Policies:** cancellation and rescheduling cutoffs are **owner-configurable**; 24 hours is only the suggested default. Customers can **ask to reschedule** (a request, not a change).
- **No tax calculation** anywhere in the MVP (the optional quote tax line was removed). Subscription billing **and tax handling** are pre-launch requirements.
- **Database:** a concrete schema (§8) with composite foreign keys that make cross-business references impossible, a unified **`schedule_blocks`** table whose exclusion constraint prevents conflicting appointments **and** holds at the database level, explicit (non-polymorphic) links, and state-transition triggers so direct API calls cannot skip workflow rules.
- **Public endpoints:** served only through our server using a **least-privilege database role**; the browser-visible Supabase anon role has **no** access to application tables or functions (§9.4).
- **Testing:** a full **RLS test matrix** — every business-owned table × read/insert/update/delete × four identities, via both SQL and the Supabase Data API (§13.2).
- New sections: **account closure and deletion** and **documentation required before public launch** (§12.6–12.7).

---

## Contents

1. [Summary](#1-summary)
2. [Target customer and pilot](#2-target-customer-and-pilot)
3. [Final MVP scope](#3-final-mvp-scope)
4. [User roles and permissions](#4-user-roles-and-permissions)
5. [Final page inventory](#5-final-page-inventory)
6. [Booking workflow and edge cases](#6-booking-workflow-and-edge-cases)
7. [Other workflows](#7-other-workflows)
8. [Database schema and relationships](#8-database-schema-and-relationships)
9. [Security and privacy requirements](#9-security-and-privacy-requirements)
10. [Notifications](#10-notifications)
11. [Analytics definitions](#11-analytics-definitions)
12. [Pricing, pilot, trial, retention, closure and deletion](#12-pricing-pilot-trial-retention-closure-and-deletion)
13. [Testing and acceptance criteria](#13-testing-and-acceptance-criteria)
14. [Architecture, budget and assumptions to verify](#14-architecture-budget-and-assumptions-to-verify)
15. [Customer acquisition plan](#15-customer-acquisition-plan)
16. [Phased implementation roadmap](#16-phased-implementation-roadmap)
17. [Decisions, open questions and risks](#17-decisions-open-questions-and-risks)

---

## 1. Summary

DetailerHQ is a web application for **independent auto detailers in the United States** — mobile operators and small shops — that replaces scattered texts, DMs, notes and spreadsheets with one tidy system.

The MVP does six things:

1. A **public booking page** where customers **request** an appointment for a specific vehicle — no customer account required.
2. An **approval workflow**: the owner approves, declines, proposes a different time, or temporarily holds the requested time. The customer always sees a clear status and next step.
3. **Customer and vehicle records** (many vehicles per customer), always tied to the correct business.
4. **Leads and quotes**, tracked separately from booking requests, with a communication log.
5. **Follow-ups**: in-app tasks, reminders and editable message templates the owner sends from their own phone or email.
6. **Honest analytics** from recorded data only.

Not in the MVP: automated SMS/email/social messages, customer payments or deposits, tax calculation, CSV import, customer accounts.

### Success criteria

| Goal | Measure |
|---|---|
| Useful | 3–5 pilot businesses (at least one mobile detailer) use it for real requests for 4 consecutive weeks |
| Worth paying for | ≥ 3 pilots pay the $25 early-access first month; ≥ 2 indicate they would continue at the proposed subscription price |
| Cheap to run | Infrastructure ≤ ~$50/month through the first ~100 businesses |
| Trustworthy | Zero cross-business data exposure; RLS and isolation suites pass on every deploy |
| Honest | Every claim maps to a shipped, tested feature |

---

## 2. Target customer and pilot

### 2.1 Customer

**Independent mobile detailers and small detailing shops in the US** (1–5 people). Phone-first, low setup tolerance, already rely on texting and Instagram/Facebook, price by vehicle size and condition (**every business sets its own prices**), handle few jobs per day, so each missed request or double-booking matters.

### 2.2 Problems solved

| Problem | DetailerHQ |
|---|---|
| Requests arrive everywhere; some get missed | One booking page, one Requests inbox, in-app notifications |
| Customers don't know if they're booked | A status page per request with a clear next step |
| Repeated price questions | The business's own published menu, by vehicle size if desired |
| Double-booking | Database-enforced prevention of overlapping confirmed appointments and holds |
| Lost track of which car is whose | Customers with multiple vehicles and per-vehicle history |
| Quotes never followed up | Leads, quotes, follow-up tasks, templates, communication log |
| No idea what makes money | Analytics separating quoted value, booked job value and recorded revenue |

### 2.3 Pilot

- **3–5 independent businesses**, including **at least one mobile detailer** (preferably two) and at least one fixed-location shop if possible.
- **Early-access offer: $25 for the first month**, stated plainly as an early-access offer, collected **manually outside the product** (method to be approved; §17.3).
- Written **pilot terms** (§12.2). Pilot access is never described as a free trial.

---

## 3. Final MVP scope

### 3.1 MVP — required for the pilot

| Area | Requirement |
|---|---|
| **Owner accounts** | Supabase Auth (email + password), invite-only during pilot, email verification, password reset; one business per owner |
| **Business profile** | Name, phone, email, US timezone, service mode (mobile / shop / both), service area, shop address, booking slug |
| **Onboarding** | Profile → where you work → hours and policies → services → preview and publish |
| **Service menu** | Owner-defined categories, services, descriptions, prices, durations; price type fixed / "from" / quote required; optional price and duration per vehicle size class; add-ons; **bookable on/off**; ordering. No prefilled prices. |
| **Availability** | Weekly hours (multiple windows/day), time off, start interval, minimum notice, horizon, buffer, optional daily job cap |
| **Policies** | Owner-defined cancellation and rescheduling cutoffs (suggested default 24 h; 0–168 h), customer self-cancel on/off, policy texts |
| **Public booking page** | No customer account. Request flow for **one vehicle per request**; inquiry flow; accepting-requests switch |
| **Customer status page** | Status and next step; accept/decline proposed time; withdraw; cancel before cutoff; ask to reschedule before cutoff |
| **Requests inbox** | Approve, decline, propose a different time, **place / release a temporary hold**, close as duplicate; conflicts; customer and vehicle linking |
| **Appointments & calendar** | Day/Week/Agenda; manual creation; reschedule; cancel; start; complete with recorded amounts; no-show; **database-enforced no-overlap** |
| **Customers & vehicles** | Manual entry; **multiple vehicles per customer**; search; history; archive; delete/anonymize |
| **Leads & quotes** | Separate from booking requests; lead statuses New, Contacted, Quote sent, Follow-up due, Booked, Lost; quotes Draft/Sent/Accepted/Declined/Expired; read-only share link; print view. **No tax calculation.** |
| **Communication log** | Manually logged calls, texts, emails, DMs, in-person (inbound/outbound) |
| **Follow-ups** | Tasks with outcomes, automatic task rules, editable message templates, "Did you send it?" logging |
| **Notifications** | In-app only (§10) |
| **Analytics** | Defined metrics from recorded data (§11) |
| **Settings & data** | Business settings, templates, account, CSV export, account closure / deletion request |
| **Pilot status** | `pilot` account status set by operator; pilot end date shown in-app |
| **Marketing site** | Home, Early access (pricing), Contact/apply, Terms, Privacy, Pilot terms |

### 3.2 Required before the public paid launch

| Requirement |
|---|
| Subscription billing integration (provider to be chosen; webhooks verified) at the validated price (target $49/month) |
| 7-day free trial starting at activation (§12.3), trial enforcement and account-state handling (§12.4), tested |
| **Tax handling for subscriptions**: obligations reviewed with an accountant (SaaS taxability varies by state); billing provider's tax features evaluated and configured |
| Retention, account closure and deletion policy finalized, legally reviewed and **disclosed** (§12.5–12.7) |
| Pre-deletion notice delivery (requires an email provider) before any automated deletion is enabled |
| Transactional email provider for auth emails (custom SMTP) |
| Public self-serve sign-up |
| Legal review of Terms, Privacy Policy, service-provider language |
| Name clearance and domain (with spending approval) |

### 3.3 Later — not in the MVP

Not presented as available anywhere until shipped: automated SMS/email to customers; owner email notifications (first post-MVP candidate); social integrations; customer deposits and online payments; **tax calculation on quotes or jobs**; CSV import (could be promoted if pilots prove it essential); online quote acceptance; customer self-service rescheduling; auto-approval; staff accounts and concurrent jobs; calendar sync / iCal; photo uploads; multiple locations; non-US markets; dashboard dark mode; native apps; public API; AI features.

### 3.4 Feature intake rule

A feature joins the active plan only if (1) two or more pilots independently need it for a described workflow, (2) a pilot says it's the reason they won't pay, or (3) it's required for security, privacy, legal compliance or data integrity. Additions are logged in `docs/decisions/` with the evidence.

---

## 4. User roles and permissions

| Role | Who | How identified | MVP |
|---|---|---|---|
| **Owner** | Detailer who created the business | Supabase Auth session (`authenticated` DB role + membership) | ✅ |
| **Public visitor** | Anyone with the booking link | Nothing — no account | ✅ |
| **Token holder** | Customer with a request-status or quote link | Unguessable token; only its SHA-256 hash is stored | ✅ |
| **Operator** | DetailerHQ staff | Supabase dashboard/CLI with MFA; no in-app admin UI | ✅ |
| **System** | `pg_cron` jobs inside the database | Database role | ✅ |
| **Staff** | Helpers | — | ❌ Later |

| Capability | Owner | Visitor | Token holder | Operator |
|---|---|---|---|---|
| View published booking page, bookable services, available start times | ✅ | ✅ | ✅ | ✅ |
| Submit request or inquiry | — | ✅ (rate-limited) | — | — |
| View one request; accept/decline proposal; withdraw; cancel/ask to reschedule within policy | ✅ in app | ❌ | ✅ that request only | — |
| View one shared quote | ✅ | ❌ | ✅ that quote only | — |
| Read/write business data | ✅ own business only | ❌ | ❌ | Break-glass only, audited |
| Configure services, availability, policies, booking page | ✅ own business only | ❌ | ❌ | ❌ |
| Analytics, export, closure request | ✅ own business only | ❌ | ❌ | Executes deletion |
| Set account status (pilot, trial, suspended) | ❌ | ❌ | ❌ | ✅ (billing webhook later) |

---

## 5. Final page inventory

`[slug]` = public booking handle; `[token]` = ≥ 128-bit random token.

### 5.1 Marketing (public)

| Route | Purpose |
|---|---|
| `/` | Home: real screenshots, request → approval flow, included / not available yet, early-access CTA |
| `/pricing` | **Pilot stage:** "Early access" — $25 for the first month, what's included, what happens after the first month, how to apply. **Paid launch:** plan price, 7-day trial terms |
| `/contact` | Contact and pilot application (stored in our DB) |
| `/legal/terms` | Terms of Service |
| `/legal/privacy` | Privacy Policy incl. retention, closure, deletion |
| `/legal/pilot-terms` | Pilot / early-access terms |

### 5.2 Authentication (Supabase Auth)

| Route | Purpose |
|---|---|
| `/sign-up` | Pilot: invite code required. Paid launch: open sign-up |
| `/sign-in` | Email + password |
| `/auth/confirm` | Email confirmation / recovery callback |
| `/verify-email` | "Check your inbox" + resend |
| `/forgot-password`, `/reset-password` | Recovery |

### 5.3 Onboarding

| Route | Purpose |
|---|---|
| `/onboarding` | (1) Business profile + US timezone → **activation** once email is verified, (2) Where you work, (3) Hours and booking rules, (4) Cancellation & rescheduling policies (24 h suggested), (5) Services (owner-entered prices), (6) Preview and publish. Resumable. |

### 5.4 Dashboard (`/app`, authenticated)

| Route | Purpose |
|---|---|
| `/app` | Today: needs-action requests, held times expiring soon, today's schedule, tasks due, notifications, account banner, setup checklist |
| `/app/notifications` | Notification list |
| `/app/requests` | Inbox: Needs action · Held · Waiting on customer · Approved · Closed |
| `/app/requests/[id]` | Request detail: items, **vehicle**, location, times, contact, conflicts, duplicates/related requests, customer & vehicle linking, hold status, history. Actions: Approve · Hold time · Release hold · Propose a different time · Decline · Close as duplicate |
| `/app/calendar` | Day / Week / Agenda with appointments, holds, proposals, time off, buffers |
| `/app/appointments/new` | Manual appointment (customer → **vehicle** → services → time) |
| `/app/appointments/[id]` | Detail; Start · Complete · Reschedule · Cancel · No-show; reschedule requests from customer; history |
| `/app/customers` | List and search (name, phone, email, plate) |
| `/app/customers/new` | Create customer with zero or more vehicles |
| `/app/customers/[id]` | Profile: contact, **vehicles**, appointments, requests, quotes, leads, tasks, communications, notes |
| `/app/customers/[id]/vehicles/new` | Add a vehicle to this customer |
| `/app/vehicles/[id]` | Vehicle detail and service history |
| `/app/leads`, `/app/leads/new`, `/app/leads/[id]` | Leads |
| `/app/quotes`, `/app/quotes/new`, `/app/quotes/[id]`, `/app/quotes/[id]/print` | Quotes |
| `/app/tasks` | Tasks: Overdue · Today · Upcoming · Done |
| `/app/services`, `/app/services/[id]` | Service menu and editor |
| `/app/availability` | Hours, time off, booking rules |
| `/app/booking-page` | Slug, intro, prep instructions, accepting requests, preview, link, QR code |
| `/app/settings` | Business profile, timezone, size classes, follow-up rules |
| `/app/settings/policies` | Cancellation and rescheduling policies, hold defaults, proposal expiry |
| `/app/settings/templates` | Message templates |
| `/app/settings/account` | Name, email, password, sessions |
| `/app/settings/plan` | Pilot terms & dates; later trial, subscription, billing |
| `/app/settings/data` | Export, retention info, account closure and deletion |
| `/app/analytics` | Metrics with definitions |

### 5.5 Public business pages (no customer account)

| Route | Purpose |
|---|---|
| `/b/[slug]` | Booking page: business info, bookable services, policies |
| `/b/[slug]/request` | Service → **Vehicle (one)** → Location → Time → Contact → Review |
| `/b/[slug]/inquiry` | Inquiry / quote request → Lead |
| `/r/[token]` | Request status and permitted actions |
| `/q/[token]` | Read-only quote |

### 5.6 System

404, 500, booking page unavailable, link not valid, maintenance.

---

## 6. Booking workflow and edge cases

### 6.1 Principle

> **A request is not a booking.** It becomes a confirmed appointment only when the owner approves it or the customer accepts a time the owner proposed. A **hold** reserves time but is **not** a confirmation.

### 6.2 Request statuses

| Status | Meaning | Set by |
|---|---|---|
| `pending` | Waiting for the owner (may or may not have an active hold) | Submission |
| `time_proposed` | Owner proposed another time; waiting for customer | Owner |
| `approved` | Confirmed; appointment exists | Owner, or customer accepting proposal |
| `declined` | Owner declined | Owner |
| `proposal_declined` | Customer declined the proposal | Customer |
| `withdrawn` | Customer withdrew before a decision | Customer |
| `expired` | Requested time passed while pending, or proposal unanswered by expiry | System |
| `closed_duplicate` | Closed as duplicate of another request | Owner |

Holds are **not** a status: a pending request has an active hold if a `schedule_blocks` row of kind `hold` exists for it and hasn't expired.

Allowed transitions (enforced by a database trigger, so direct API calls can't skip them):

```
pending ──► approved | time_proposed | declined | withdrawn | expired | closed_duplicate
time_proposed ──► approved (customer accepts) | proposal_declined | withdrawn | expired | pending (owner retracts, or accept failed)
all other states are terminal
```

After approval, the appointment lifecycle applies: `scheduled → in_progress → completed`; `scheduled | in_progress → cancelled`; `scheduled → no_show` (after start); `completed → scheduled` (owner correction, confirmed).

### 6.3 Linking a request to business, services, customer and vehicle

| Link | When | How cross-business references are prevented |
|---|---|---|
| **Business** | At submission | Resolved server-side from `[slug]`; the client never sends a business ID. Every row stores `business_id`, immutable after insert. |
| **Services** | At submission | Service IDs submitted by the client are re-validated in the database: each must belong to the same business, be active and bookable. Items are stored with composite FK `(business_id, service_id) → services(business_id, id)` plus name/price/duration snapshots computed in the database. |
| **Vehicle size class** | At submission | Composite FK `(business_id, size_class_id) → vehicle_size_classes(business_id, id)` |
| **Customer** | On approval (or by owner earlier) | Owner chooses an existing customer of **this** business (suggested by exact match on normalized phone/email within this business only) or creates a new one from the request's contact snapshot. Composite FK `(business_id, customer_id) → customers(business_id, id)`. |
| **Vehicle** | On approval | Owner picks one of **that customer's** vehicles (suggested by year/make/model/plate match) or creates one from the request's vehicle snapshot. Composite FK `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)` guarantees the vehicle belongs to that customer **and** that business. |
| **Appointment** | On approval | Created in the same transaction with the same customer and vehicle (same composite FK), `booking_request_id` unique, items copied from the request. A check constraint requires `customer_id` and `vehicle_id` on approved requests. |

Customers never see or choose existing vehicle records (they have no account); they always describe the vehicle, and the owner links it. **One request = one vehicle.** A two-car visit is two requests (or one manual appointment per vehicle).

### 6.4 Customer status page

Shows only that request: business name and contact buttons, services, vehicle, location, requested/proposed/confirmed time **with timezone**, estimate, policies, the next step, and permitted actions. Contact details are **masked** (e.g., "Phone ending 0142") because links can be forwarded. Never shows internal notes, other customers, or why a time is unavailable.

| State | Headline | Next step | Actions |
|---|---|---|---|
| Pending | Request received — not confirmed yet | "[Business] will confirm, decline, or suggest another time. Check this page for updates." | Withdraw · Call/Text |
| Pending + hold | Request received — your time is being held | "[Business] is holding Sat, Nov 8, 9:00 AM CT while they review your request. This is not yet a confirmation." | Withdraw · Call/Text |
| Time proposed | [Business] suggested a different time | "Accept to confirm, or decline and contact them. Held for you until [time]." | **Accept this time** · Decline · Call/Text |
| Approved / Scheduled | Confirmed for Sat, Nov 8, 9:00 AM CT | Location, prep instructions, cancellation and rescheduling policy | Cancel (before cutoff, if allowed) · Ask to reschedule (before cutoff) · Call/Text |
| Reschedule asked | Reschedule request sent | "Your appointment is still Sat, Nov 8, 9:00 AM CT until [Business] changes it." | Call/Text |
| Rescheduled | Time changed — now Sun, Nov 9, 10:00 AM CT | Previous time shown | As Scheduled |
| Completed | Completed on Nov 8 | — | Call/Text |
| Declined | [Business] can't take this request | Owner's optional message | Send a new request |
| Proposal declined / Withdrawn / Expired / Cancelled | Clear past-tense headline, who/what/when | "You can send a new request." | Send a new request · Call/Text |
| Closed as duplicate | Combined with another request | "[Business] is handling this through another request you sent." | Call/Text |

The confirmation screen and all default templates include the status link, because DetailerHQ doesn't message customers in the MVP.

### 6.5 Pending requests and temporary holds

**Default: pending requests do not block availability.** Other customers can request the same time; the owner sees "2 requests for this time".

**Owner-placed temporary hold** (optional, per request):

| Rule | Definition |
|---|---|
| Who | Owner only, from the request detail ("Hold this time"). Never automatic. |
| What is held | The request's requested start → end (duration of selected services). Buffers are not part of the hold. |
| Duration | Owner chooses: 2 h, 12 h, **24 h (default, configurable)**, 48 h, or 72 h (**maximum**). The hold also ends no later than the requested start time. |
| One per request | A request can have at most one active hold; extending replaces it (still capped at 72 h from the original placement). |
| Effect | Removed from public availability; shown on the calendar as "Held"; the customer status page shows "your time is being held". |
| Placement conflicts | A hold **cannot** be placed if it overlaps a confirmed appointment, another active hold, or an outstanding proposal. Enforced by the database (§8.6); the owner sees which item conflicts. |
| Other requests for a held time | Shown as "Time held for R-0041". They can't be approved for an overlapping time until the hold is released (explicit "Release hold and continue", which records who released it). Proposing a different time remains available. |
| Manual appointments / reschedules over a hold | Blocked by the same constraint; the UI offers "Release hold and continue" with confirmation. |
| Approve the held request | Converts the hold into the appointment's block **in the same transaction** — no gap in which another booking could take the time. |
| Decline / withdraw / close duplicate / expire | Hold released automatically in the same transaction. |
| Expiry | At `expires_at` the hold stops counting immediately: slot calculation ignores expired holds, and every function that writes schedule blocks first deletes that business's expired holds in the same transaction. A `pg_cron` sweep (every 5 minutes) deletes remaining expired holds and creates a notification: "Hold for R-0041 expired — the request is still pending." |
| Account restricted | Existing holds keep their expiry; new holds can't be placed. |

**Owner proposals** use the same mechanism: proposing creates a block of kind `proposal` that expires at `proposal_expires_at` (default 48 h, configurable 2–72 h, never later than the proposed start minus the minimum notice). Proposal placement has the same conflict rules as holds. If the request had a hold, the proposal replaces it.

### 6.6 Conflicting appointments

**Hard rules — enforced by the database, cannot be overridden:**

1. **No overlap** among a business's schedule blocks: confirmed appointments (Scheduled / In progress, and Completed — see §8.6), active holds and proposals. Enforced by an exclusion constraint on `schedule_blocks` (§8.6). Applies to every path: approve, accept proposal, manual create, reschedule, reopen, hold, propose — including concurrent requests and direct API calls.
2. Appointment length 15 min – 72 h; `ends_at > starts_at`.
3. Customer, vehicle, services, request and quote references belong to the same business (composite FKs).
4. At most one appointment per request (unique `booking_request_id`).
5. Valid status transitions only (triggers).

Different businesses never conflict with each other.

**Soft rules — warnings the owner must explicitly confirm:** inside another appointment's buffer; outside working hours; during time off; over the daily job cap; less than minimum notice; in the past.

**Public requests** can only select start times passing all hard and soft rules; availability is re-checked at submission and at approval. If approval hits a hard conflict, the owner is offered **Propose a different time**. If a customer accepts a proposal that is no longer possible (only if the owner released it), the acceptance fails safely, the request returns to `pending`, the customer sees "This time is no longer available — [Business] will contact you", and the owner is notified.

### 6.7 Duplicate submissions

| Case | Handling |
|---|---|
| Double-click / retry | Idempotency key per form session; unique `(business_id, idempotency_key)`; resubmission returns the original status link |
| Same contact, same vehicle description, overlapping or same-day time, while another request is open | Accepted, flagged **"Possible duplicate"** and linked; owner may **Close as duplicate** |
| Same contact, **different vehicle** | Not a duplicate; shown as **"Related request — same customer"** (e.g., two family cars) |
| More than 3 open requests per contact per business | Rejected with a generic message showing the business's phone — never revealing other requests |
| Automated spam | Rate limits, honeypot, minimum completion time (§9.4) |
| Same person, different businesses | Unrelated; never linked |

### 6.8 Expiry

| Item | Rule | Mechanism |
|---|---|---|
| Pending request | Expires when the requested start passes without a decision | `pg_cron` every 5 min; also treated as expired on read |
| Proposal | Expires at `proposal_expires_at`; request → `expired` | Same |
| Hold | Expires at `expires_at`; request stays pending | Lazy purge + 5-min sweep |
| Quote | Sent → Expired after `valid_until` (end of that day, business timezone) | Daily job |
| Unlinked closed requests | Purged after 12 months (§12.5) | Daily job |

### 6.9 Cancellation and rescheduling policies

Each business configures (onboarding step 4 and `/app/settings/policies`):

| Setting | Suggested default | Range |
|---|---|---|
| Customers can cancel online | On | On / Off |
| Cancellation cutoff | **24 h** before start (suggested, not required) | 0–168 h |
| Rescheduling cutoff (for "Ask to reschedule") | **24 h** (suggested) | 0–168 h |
| Cancellation policy text | Blank, with a neutral example the owner may adapt | ≤ 1,000 chars |
| Rescheduling policy text | Blank, with a neutral example | ≤ 1,000 chars |

Rules:

- **Customer cancel:** allowed before the cutoff if enabled; frees the slot; owner notified. After the cutoff: policy text + call/text buttons. Exactly at the cutoff counts as *after*.
- **Customer withdraw** (pending / time proposed): always allowed.
- **Ask to reschedule:** before the rescheduling cutoff, the customer can send a preferred new time (from available slots) or a note. This creates a notification and an activity entry; **the appointment doesn't change** until the owner reschedules it.
- **Owner reschedule / cancel:** always allowed (owner is not bound by customer cutoffs); hard rules apply; previous time kept in history; status page updated; owner prompted to inform the customer with a template.
- Policies are informational and procedural only — **no fees are charged** (no payments in the MVP). Policy changes apply to future evaluations; the status page shows the current policy.

### 6.10 Time zones and daylight-saving time

1. Each business has one IANA timezone from a **US allow-list** (`America/New_York`, `America/Detroit`, `America/Indiana/Indianapolis`, `America/Chicago`, `America/Denver`, `America/Boise`, `America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `Pacific/Honolulu`, and other US IANA zones), enforced by a check constraint.
2. Instants stored as `timestamptz` (UTC). Working hours stored as local wall-clock `time` per weekday and interpreted in the business timezone.
3. Public pages always display the business timezone ("Times are in Central Time (CT)") and warn if the visitor's device zone differs. Customer-facing times always include the abbreviation.
4. **Spring forward:** non-existent local times are never offered; durations are real elapsed time.
5. **Fall back:** repeated local times are distinct instants, labelled with abbreviation.
6. `America/Phoenix` and `Pacific/Honolulu` (no DST) covered by tests.
7. **Timezone change:** existing appointments, holds and time off keep absolute instants; working hours keep wall-clock values; owner sees affected future items and confirms.
8. "Today", daily caps, analytics periods, quote expiry dates use the business's local day. Cutoffs and expiries compare UTC instants.

### 6.11 Edge-case catalogue

| # | Scenario | Expected behavior |
|---|---|---|
| E1 | Two owners' sessions (same owner, two devices) approve overlapping requests simultaneously | Exactly one succeeds; the other gets a conflict message (exclusion constraint) |
| E2 | Customer submits; slot taken before submission completes | Submission rejected with "This time was just taken", other times offered |
| E3 | Customer double-taps Send | One request (idempotency) |
| E4 | Same customer requests two different cars for the same morning | Two requests, marked "Related"; can't both be confirmed if they overlap (hard rule) |
| E5 | Owner holds request A; request B wants overlapping time | B shows "Time held for A"; B can be proposed elsewhere, declined, or approved after releasing A's hold |
| E6 | Hold expires while owner is mid-approval | Approval re-checks within the transaction; succeeds if still free, otherwise conflict message |
| E7 | Customer accepts proposal one minute after expiry | Rejected: "This suggestion expired"; request already `expired` |
| E8 | Customer withdraws while owner is approving | Whichever commits first wins; the other sees a state-changed message (status trigger + row lock) |
| E9 | Requested time falls in the spring-forward gap | Never offered; direct submission with such a time rejected by validation |
| E10 | Appointment 1:30 AM on fall-back night | Stored as a single instant; displayed with abbreviation |
| E11 | Business changes timezone with future appointments | Warning; instants preserved |
| E12 | Customer tries to cancel exactly at the cutoff | Not allowed; policy shown |
| E13 | Customer cancels; another pending request wanted that time | Slot free again; owner sees the other request is now approvable |
| E14 | Owner reschedules onto a held time | Blocked; "Release hold and continue" offered |
| E15 | Service archived after request submitted | Request keeps snapshot; approval still works; appointment items from snapshot |
| E16 | Business pauses booking page with pending requests | Pending requests remain actionable; status pages still work |
| E17 | Account becomes restricted with pending requests | Owner can't act (read-only); requests expire normally; status pages explain the business will contact them |
| E18 | Customer forwards status link | Recipient sees masked contact details only; actions limited to that request |
| E19 | Owner deletes the linked customer | Appointment anonymized; request contact snapshot purged; status page shows generic status only |
| E20 | Invalid / guessed token | Generic "This link isn't valid" (no distinction between wrong and expired) |

---

## 7. Other workflows

### 7.1 Sign-up, activation and onboarding

1. **Pilot:** operator issues an invite code; owner signs up and accepts pilot terms. **Paid launch:** open sign-up.
2. Owner verifies email (Supabase Auth).
3. Owner completes onboarding step 1 (business profile). **Activation = email verified AND business created.** At activation: pilot accounts → `pilot`; paid-launch accounts → `trialing` with `trial_ends_at = activated_at + 7 days`.
4. Remaining steps; publish requires activation.

### 7.2 Owner handles a request

Open request → review conflicts, duplicates/related requests, hold status → choose:

- **Approve** → link or create customer, then select or create **that customer's vehicle** → appointment created.
- **Hold this time** → choose duration → status page shows hold.
- **Propose a different time** → time + optional message + expiry.
- **Decline** → optional customer message, internal reason, optional "Save as lead".
- **Close as duplicate**.

Then the **Let the customer know** panel: template with `{status_link}`, Copy / Open in Messages / Open in Mail / Call, followed by **"Did you send it?"** (logs a communication only on Yes). DetailerHQ sends nothing.

### 7.3 Day of the job

Today → next job (map link, call/text, vehicle, notes, last visit) → Start → Complete with **recorded amounts per line** and optional payment note ("Recorded amounts are for your records. DetailerHQ doesn't process payments or calculate tax.") → follow-up rules create tasks.

### 7.4 Customers and vehicles

- Create customers manually with name and at least one of phone/email; add **any number of vehicles** (year, make, model, trim, color, size class, optional plate, notes).
- Vehicles can be archived (sold car) without affecting history.
- Manual appointments and quotes always select one specific vehicle (or create one inline).
- De-duplication suggestions search **only within the business**.

### 7.5 Leads and quotes

Leads (from inquiries, declined requests saved as leads, or manual entry) are separate from booking requests.

| Lead status | Transition |
|---|---|
| New | On creation |
| Contacted | Manual, or first outbound communication logged on a New lead |
| Quote sent | A linked quote is marked Sent |
| Follow-up due | `next_follow_up_at` passed with no inbound communication since (daily job) or manual |
| Booked | An appointment created from the lead or its accepted quote |
| Lost | Manual, with reason |

Quotes: owner-defined line items (from services or custom), vehicle, valid-until, notes, terms, optional discount. **No tax calculation** (owners can add a custom line item if they wish; the product performs no tax computation). Statuses Draft → Sent → Accepted / Declined / Expired. Accepted → "Schedule it" pre-fills an appointment.

**Quoted value** (quote total), **booked job value** (appointment estimate) and **recorded revenue** (completed appointment recorded amounts) are stored separately and never overwrite each other.

### 7.6 Follow-ups and templates

- Tasks with due date, linked record, status, outcome (Responded / No response / Booked / Not interested / Other).
- Automatic rules (editable, can be disabled): quote sent → follow-up in 3 days; appointment completed → maintenance reminder after the service's interval (blank by default); request pending > 24 h → respond; hold expiring in < 2 h → decide; optional day-before reminder task.
- Templates with placeholders (`{customer_first_name}`, `{business_name}`, `{business_phone}`, `{service_names}`, `{vehicle}`, `{appointment_date}`, `{appointment_time}`, `{appointment_address}`, `{proposed_time}`, `{hold_until}`, `{status_link}`, `{quote_link}`, `{quote_total}`, `{quote_valid_until}`, `{cancellation_policy}`), default texts with no prices or claims; missing values block copying until edited.
- Communication log entries are created manually or after "Did you send it? → Yes". Never auto-claimed.

### 7.7 Export, closure and deletion

See §12.6.

---

## 8. Database schema and relationships

Conceptual schema for PostgreSQL on Supabase. Column types are indicative; final DDL is written during Phase 0 and reviewed before use.

### 8.1 Conventions

- Every **business-owned table** has `business_id uuid not null` and `unique (business_id, id)` so other tables can reference `(business_id, id)`.
- **All references between business-owned tables are composite foreign keys including `business_id`.** No polymorphic `related_type/related_id` columns — each optional link is its own nullable composite FK.
- `id uuid` primary keys (random). Display numbers (`R-0042`, `Q-0012`, `A-0107`) from a per-business counter.
- `created_at`, `updated_at` (`timestamptz`), `created_by uuid` where applicable.
- `business_id` and snapshot columns are **immutable** (trigger).
- Money: `integer` cents, USD. Durations: `integer` minutes. Phones: E.164 US (`+1…`). Emails: `citext`.
- Status columns use Postgres enums; transitions validated by triggers.

### 8.2 Database roles and schemas

| Role / schema | Purpose | Privileges |
|---|---|---|
| `public` schema (exposed through Supabase Data API) | Business-owned tables | RLS enabled **and forced** on every table |
| `app` schema (not exposed) | Helper functions (`is_member`, `can_write`), triggers, internal functions | — |
| `public_api` schema (not exposed) | `SECURITY DEFINER` functions for the public booking page, slots, submissions, token actions | `EXECUTE` granted **only** to `booking_api` |
| `anon` | Browser-visible Supabase role | **No** privileges on any application table, view, sequence or function |
| `authenticated` | Signed-in owners via Data API | Table privileges limited per table (below); every row filtered by RLS |
| `booking_api` | Custom login role used **only by our server** for public operations | `EXECUTE` on `public_api` functions only; no table privileges |
| `service_role` | Supabase admin | **Not used by the web app**; operator scripts only |

### 8.3 Tables

**Tenancy and access**

| Table | Key columns and constraints |
|---|---|
| `businesses` | `id`; `name`; `slug citext unique` (3–40, `^[a-z0-9-]+$`, reserved words blocked); `phone_e164`; `email`; `timezone` (US allow-list check); `service_mode enum(mobile, shop, both)`; `service_area_text`; `shop_address_*`; `accepting_requests bool`; `published_at`; `account_status enum(pending_activation, pilot, trialing, active, past_due, trial_expired, inactive, cancelled, suspended, closing)`; `activated_at`; `pilot_ends_at`; `trial_started_at`; `trial_ends_at`; `access_restricted_at`; `closure_requested_at`; `deletion_scheduled_for` |
| `memberships` | `business_id → businesses`, `user_id → auth.users`, `role enum(owner)`; PK `(business_id, user_id)`; `unique (user_id)` in MVP |
| `pilot_invites` | `code_hash unique`, `email`, `expires_at`, `used_at`, `used_by` — operator-managed; no `authenticated` access |
| `business_counters` | `(business_id, kind)` PK, `next_value` — numbering for requests, appointments, quotes |

**Configuration**

| Table | Key columns and constraints |
|---|---|
| `booking_settings` | `business_id` PK/FK; `slot_interval_min` (15–240); `min_notice_min`; `horizon_days` (1–365); `buffer_min` (0–240); `max_jobs_per_day` (nullable); `default_hold_hours` (default 24; 2–72); `proposal_expiry_hours` (default 48; 2–72); `customer_can_cancel bool`; `cancel_cutoff_hours` (default 24; 0–168); `reschedule_cutoff_hours` (default 24; 0–168); `cancellation_policy_text`; `reschedule_policy_text`; `intro_text`; `prep_instructions` |
| `availability_rules` | `business_id`; `weekday smallint 0–6`; `start_time time`; `end_time time`; check `end_time > start_time` |
| `time_off` | `business_id`; `during tstzrange`; `all_day bool`; `label` |
| `vehicle_size_classes` | `business_id`; `name`; `examples`; `sort_order`; `archived_at` |
| `service_categories` | `business_id`; `name`; `sort_order` |
| `services` | `business_id`; `(business_id, category_id) → service_categories`; `name`; `description`; `price_type enum(fixed, starting_at, quote_required)`; `base_price_cents` (required unless `quote_required`; ≥ 0); `base_duration_min` (15–4320); `is_addon`; `is_bookable`; `follow_up_after_days`; `sort_order`; `archived_at` |
| `service_prices` | `business_id`; `(business_id, service_id) → services`; `(business_id, size_class_id) → vehicle_size_classes`; `price_cents`; `duration_min`; PK `(service_id, size_class_id)` |
| `message_templates` | `business_id`; `purpose enum`; `name`; `body` (≤ 2,000) |

**Customers and vehicles**

| Table | Key columns and constraints |
|---|---|
| `customers` | `business_id`; `first_name`; `last_name`; `phone_e164`; `email`; check (`phone_e164` or `email` not null, unless `anonymized_at` set); `preferred_contact enum(call, text, email)`; `address_*` (nullable); `notes`; `source enum`; `archived_at`; `anonymized_at`; indexes on `(business_id, phone_e164)`, `(business_id, email)`, trigram on name |
| `vehicles` | `business_id`; `(business_id, customer_id) → customers`; `unique (business_id, customer_id, id)`; `year smallint` (1900–next year + 1); `make`; `model`; `trim`; `color`; `(business_id, size_class_id) → vehicle_size_classes`; `plate`; `notes`; `archived_at` |

**Booking**

| Table | Key columns and constraints |
|---|---|
| `booking_requests` | `business_id`; `number`; `status enum`; `token_hash bytea unique`; `idempotency_key uuid`, `unique (business_id, idempotency_key)`; `requested_start`, `requested_end timestamptz`; `alternate_start`; `location_type enum(mobile, shop)`; `service_address_*`; contact snapshot (`contact_first_name`, `contact_last_name`, `contact_phone_e164`, `contact_email`, `preferred_contact`); **vehicle snapshot** (`vehicle_year`, `vehicle_make`, `vehicle_model`, `vehicle_color`, `(business_id, vehicle_size_class_id) → vehicle_size_classes`, `vehicle_notes`) — **required**; `customer_notes`; `consent_at not null`; `estimated_total_cents`; `estimated_duration_min`; `customer_id`, `vehicle_id` with FKs `(business_id, customer_id) → customers` and `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)`; check: `status = 'approved'` ⇒ both not null; `(business_id, duplicate_of_id) → booking_requests`; `proposed_start`, `proposed_end`, `proposal_message`, `proposal_expires_at`; `decline_message`; `decline_reason`; `reschedule_note`; `decided_at`, `decided_by`; `ip_hash` |
| `booking_request_items` | `business_id`; `(business_id, booking_request_id) → booking_requests`; `(business_id, service_id) → services`; snapshot `name`, `price_type`, `price_cents`, `duration_min`, `is_addon` |
| `appointments` | `business_id`; `number`; `(business_id, customer_id) → customers`; **`vehicle_id not null`** with `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)`; `(business_id, booking_request_id) → booking_requests`, `unique (booking_request_id)`; `(business_id, quote_id) → quotes`; `(business_id, lead_id) → leads`; `starts_at`, `ends_at` (check 15 min–72 h); `location_type`; `service_address_*`; `status enum(scheduled, in_progress, completed, cancelled, no_show)`; `estimated_total_cents`; `recorded_total_cents`; `payment_note enum(not_recorded, unpaid, paid_cash, paid_card, paid_transfer, paid_other)`; `cancelled_by enum(customer, business)`; `cancelled_at`; `cancel_reason`; `customer_message`; `reschedule_requested_at`; `completed_at`; `internal_notes` |
| `appointment_items` | `business_id`; `(business_id, appointment_id) → appointments`; `(business_id, service_id) → services` (nullable for custom lines); `name`; `quantity`; `estimated_price_cents`; `recorded_price_cents`; `duration_min` |
| `schedule_blocks` | `business_id`; `kind enum(appointment, hold, proposal)`; `during tstzrange not null` (non-empty, `[)` bounds); `(business_id, appointment_id) → appointments` unique, required iff `kind = appointment`; `(business_id, booking_request_id) → booking_requests`, required for `hold`/`proposal`; `expires_at` required for `hold`/`proposal`, null for `appointment`; `created_by`; **`EXCLUDE USING gist (business_id WITH =, during WITH &&)`** (requires `btree_gist`); partial unique: one hold/proposal per request |

**Leads, quotes, follow-ups**

| Table | Key columns and constraints |
|---|---|
| `leads` | `business_id`; `status enum(new, contacted, quote_sent, follow_up_due, booked, lost)`; `source enum(booking_page, phone, text, instagram, facebook, google, referral, walk_in, repeat, other)`; `lost_reason enum`; contact snapshot; `(business_id, customer_id) → customers`; `(business_id, customer_id, vehicle_id) → vehicles`; `vehicle_description`; `request_text`; `(business_id, booking_request_id) → booking_requests` (if saved from a declined request); `next_follow_up_at`; `last_inbound_at` |
| `quotes` | `business_id`; `number`; `status enum(draft, sent, accepted, declined, expired)`; `(business_id, lead_id) → leads`; `(business_id, customer_id) → customers`; `(business_id, customer_id, vehicle_id) → vehicles`; `vehicle_text`; `valid_until date`; `notes`; `terms`; `subtotal_cents`; `discount_cents`; `total_cents` (check = subtotal − discount ≥ 0); `token_hash unique`; `sent_at`; `decided_at`. **No tax columns.** |
| `quote_items` | `business_id`; `(business_id, quote_id) → quotes`; `(business_id, service_id) → services` nullable; `name`; `description`; `quantity`; `price_cents`; `duration_min` |
| `tasks` | `business_id`; `title`; `due_at`; `status enum(open, done, dismissed)`; `outcome enum`; `kind enum(manual, rule)`; `rule_key`; `dedupe_key`, `unique (business_id, dedupe_key)`; optional composite FKs to `customers`, `leads`, `quotes`, `appointments`, `booking_requests` |
| `communications` | `business_id`; `channel enum(call, text, email, instagram, facebook, in_person, other)`; `direction enum(inbound, outbound)`; `occurred_at`; `summary`; `(business_id, template_id) → message_templates`; optional composite FKs to `customers`, `leads`, `quotes`, `appointments`, `booking_requests`; check at least one of `customer_id`, `lead_id` |
| `notes` | `business_id`; `body`; optional composite FKs as above |

**System**

| Table | Key columns and constraints |
|---|---|
| `notifications` | `business_id`; `type enum`; optional composite FKs; `title`; `read_at` |
| `activity_events` | `business_id`; optional composite FKs; `kind`; `from_status`; `to_status`; `actor_type enum(owner, customer, system, operator)`; `actor_user_id`; `metadata jsonb` (no PII); append-only |
| `audit_events` | `business_id` nullable; `actor_type`; `actor_id`; `action`; `entity`; `metadata` (no PII); `ip_hash`; append-only |
| `rate_limit_events` | `key_hash`, `action`, `business_id` nullable, `created_at` — RLS enabled with **no** policies; written only by `public_api` functions |
| `contact_submissions` | Marketing applications — RLS enabled, no `authenticated`/`anon` policies; written by `booking_api` function |
| `subscriptions`, `billing_events` *(Phase 7)* | Provider IDs, status, period end; webhook event IDs for idempotency — no owner write access |

### 8.4 Relationships

```
auth.users ─< memberships >─ businesses ─1 booking_settings
                                │
  availability_rules, time_off, vehicle_size_classes, service_categories ─< services ─< service_prices
                                │
  customers ─< vehicles                          (vehicles keyed by business_id + customer_id + id)
     │           │
     │           ├──────────────┐
     ├─< booking_requests ─< booking_request_items >─ services
     │        │ (0..1)          │
     │        ▼                 │
     ├─< appointments ─< appointment_items >─ services
     │        │
     │        └─1 schedule_blocks (kind=appointment)
     │   booking_requests ─0..1 schedule_blocks (kind=hold | proposal)
     │
     ├─< leads ─< quotes ─< quote_items >─ services
     │
     └─ tasks, communications, notes, notifications, activity_events (explicit optional FKs)
```

### 8.5 Cross-business integrity — summary of guarantees

| Guarantee | Mechanism |
|---|---|
| A row can't be moved to another business | `business_id` immutable trigger |
| A row can't reference another business's row | Composite FKs `(business_id, x_id)` on every reference |
| A vehicle on a request/appointment/quote belongs to that customer | FK `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)` |
| An owner can't read/write another business's rows | RLS policies on every table (§9.2) |
| Public callers can't touch tables | `anon` has no grants; `booking_api` only executes definer functions |
| Public submissions can't choose a business ID or prices | Functions derive business from slug and compute prices |
| Workflow can't be skipped via API | Status-transition triggers; schedule blocks writable only within rules |

### 8.6 Schedule blocks — database-level conflict prevention

- Every **active** time reservation is one `schedule_blocks` row: confirmed appointments, owner holds, and proposals.
- Appointment blocks are maintained by triggers on `appointments`: created when an appointment is Scheduled, moved when it is rescheduled, kept while In progress and after **Completed** (so history stays consistent and reopening is checked), and deleted when it becomes **Cancelled** or **No-show**.
- The exclusion constraint makes any overlap within a business fail the whole transaction, whichever path created it.
- Expired holds/proposals are deleted lazily (start of every block-writing function, scoped to the business) and by a 5-minute sweep; slot calculation also filters `expires_at > now()`.
- Approving a held/proposed request deletes the hold/proposal row and inserts the appointment block in **one transaction**.

### 8.7 Slot calculation

For a date and duration *D*: generate local wall-clock candidates every `slot_interval_min` within working windows (skipping non-existent DST times) where `start + D ≤ window end`; drop those before `now + min_notice` or beyond the horizon; drop overlaps with time off, with active schedule blocks (appointments ± buffer, unexpired holds and proposals); drop days at the job cap. Return start times only.

---

## 9. Security and privacy requirements

### 9.1 Principles

1. Each business accesses **only its own data**, enforced independently by server checks, **RLS**, and schema constraints.
2. **Privileged credentials never reach the browser.**
3. Public endpoints reveal only what a customer needs, validate everything, and resist abuse.
4. Collect the minimum; retain only as disclosed.

### 9.2 Row Level Security requirements

- **Every business-owned table** listed in §8.3 has RLS **enabled and forced**. Tables with no owner access (`rate_limit_events`, `contact_submissions`, `pilot_invites`, `audit_events` writes, billing tables) have RLS enabled with **no** permissive policies for `authenticated`/`anon`.
- Helper `app.is_member(business_id)`: `SECURITY DEFINER`, `STABLE`, fixed `search_path`, checks `memberships.user_id = auth.uid()`.
- Helper `app.can_write(business_id)`: true for `pilot`, `trialing`, `active`, `past_due`, `cancelled` (until period end); false for `pending_activation` (except onboarding tables), `trial_expired`, `inactive`, `suspended`, `closing`.
- Separate policies per command:
  - `SELECT … USING (app.is_member(business_id))`
  - `INSERT … WITH CHECK (app.is_member(business_id) AND app.can_write(business_id))`
  - `UPDATE … USING (app.is_member(business_id)) WITH CHECK (app.is_member(business_id) AND app.can_write(business_id))`
  - `DELETE … USING (app.is_member(business_id) AND app.can_write(business_id))` — only on tables where deletion is allowed.
- **Table privileges for `authenticated` are minimal**: e.g., no direct `INSERT` on `businesses`/`memberships` (created by `app.create_business()`); no `DELETE` on `booking_requests`, `appointments`, `quotes`, `activity_events`, `audit_events`; `notifications` updatable only on `read_at` (column privilege).
- **Triggers** enforce status transitions, immutable columns and snapshot integrity even for direct Data API calls.
- **Views** use `security_invoker = true`; no materialized views over business data are exposed.
- **Realtime** publications do not include business tables (not used in MVP).
- **No Supabase Storage** buckets in MVP.
- **CI checks** (on every push): every table in `public` has RLS enabled and forced, at least one policy for each granted command, and `anon` holds no privileges on application objects. Supabase's database linter / security advisor is run before every release.

### 9.3 Authorization check for every operation

| Operation | Server check | Database protection |
|---|---|---|
| Read/list owner data | Session valid → membership | RLS `SELECT` |
| Create record | Session + membership; `business_id` from membership (never from input); Zod validation | RLS `INSERT WITH CHECK`; composite FKs; triggers |
| Update record | As above; record scoped to business | RLS `UPDATE USING/WITH CHECK`; immutable trigger; composite FKs |
| Delete / archive / anonymize customer | As above + typed confirmation | RLS `DELETE`/`UPDATE`; anonymization function (`SECURITY INVOKER`) |
| Approve / decline / propose / hold / release / close duplicate | Membership; expected current status (optimistic check) | `SECURITY INVOKER` functions in one transaction; status trigger; exclusion constraint; unique `booking_request_id` |
| Appointment start / complete / cancel / reschedule / no-show | Membership; allowed transition | Status trigger; exclusion constraint |
| Settings, services, availability, templates | Membership; validation | RLS |
| Export | Membership; any non-suspended state | RLS (runs with user session) |
| Analytics | Membership | RLS; invoker views/functions |
| Account closure / deletion request | Membership + typed confirmation + re-authentication | `SECURITY INVOKER` function; audit event |
| Public: booking page, slots | Rate limit | `public_api` definer function returning allow-listed fields |
| Public: submit request / inquiry | Validation, rate limit, honeypot, timing, idempotency, open-request cap | Definer function: business from slug; services re-validated; prices computed; inserts with fixed `business_id` |
| Token: status / accept / decline / withdraw / cancel / ask to reschedule / view quote | Rate limit; token → SHA-256 | Definer function scoped to the one row matching the hash; state and cutoff checks; allow-listed output |
| Scheduled jobs | — | `pg_cron` inside DB, per business |
| Billing webhook *(Phase 7)* | Signature verification, idempotency | Server-only privileged path; audit |
| Operator support access | Owner permission, reason | Audit event |

Another business's record always yields **404**.

### 9.4 Public booking endpoints

**Architecture.** Browsers call **our Next.js server** (route handlers / server actions). The server calls `public_api` functions over a pooled Postgres connection as the least-privilege `booking_api` role. Public functions are **not** reachable through the Supabase Data API (schema not exposed; no grants to `anon`), so rate limits and validation cannot be bypassed by calling Supabase directly. *(Feasibility of a custom login role on our Supabase plan is assumption A-11; fallback in §17.5.)*

**Input validation** (server with Zod, then again in the database):

- Allowed fields only; unknown fields rejected; maximum request body 16 KB.
- Lengths: names ≤ 60, notes ≤ 1,000, address lines ≤ 120, vehicle make/model ≤ 40; year 1900–next year + 1.
- US phone → E.164 `+1XXXXXXXXXX`; email syntax; at least one of phone/email.
- Service IDs must belong to the business, be bookable and active; add-ons only with a main service; size class must belong to the business.
- Requested start must be one of the currently computed slots for that duration (re-computed in the database).
- Consent required. Text stored as plain text; rendered escaped.

**No private information exposed:**

- Booking page and slot functions return allow-listed public fields only (never customer data, appointment details, counts of bookings, or reasons a time is unavailable).
- Status/quote functions return only that record, with contact details masked.
- Error messages are generic and don't reveal whether a phone/email has other requests, or whether a token ever existed.
- No sequential IDs in URLs; tokens are 128-bit random, stored hashed, revocable by the owner.
- Response headers: `Cache-Control: no-store` on token pages; `Referrer-Policy: no-referrer` on `/r/` and `/q/` so tokens don't leak to external links; `X-Robots-Tag: noindex`.

**Abuse protections:**

| Control | Initial setting (tunable) |
|---|---|
| Submissions per IP hash per business | 5 per 10 min, 20 per day |
| Submissions per business | 60 per hour (excess queued as rejected with generic message; owner notified of unusual volume) |
| Open requests per contact per business | 3 |
| Token actions per IP hash | 30 per 10 min |
| Slot lookups per IP hash | 120 per 10 min |
| Honeypot field | Required empty |
| Minimum completion time | ≥ 3 seconds from form render (signed timestamp) |
| Idempotency | Per form session |
| Bot challenge | Free challenge (e.g., Cloudflare Turnstile) **only if** abuse appears — requires account registration and approval |

IP addresses are hashed with a server-side secret salt and kept 30 days in `rate_limit_events`.

### 9.5 Secrets and privileged credentials

| Credential | Where it may exist |
|---|---|
| Supabase URL, anon (publishable) key | Browser allowed (used only for Supabase Auth); `anon` has no data privileges |
| `service_role` (secret) key | **Never** in browser code, `NEXT_PUBLIC_*` variables, logs, or the repository. **Not configured in the deployed web app in the MVP.** Operator local scripts only. Phase 7 may add it to a server-only module for billing if required. |
| `booking_api` database connection string | Server-only environment variable; modules marked `import "server-only"` |
| IP hash salt, token pepper (if used) | Server-only |

Controls: CI scans the production client bundle and fails on secret patterns or known variable names; `.env*` git-ignored; `.env.example` contains names only; documented rotation procedure for every credential.

### 9.6 Authentication

Supabase Auth email + password; email confirmation required for activation; server-side sessions via Supabase SSR helpers (HTTP-only cookies); minimum password length ≥ 10 and leaked-password protection if available on the plan (A-5); Supabase rate limits plus ours on auth forms; re-authentication for closure/deletion and email change; operator MFA. Owner MFA later.

### 9.7 Web security baseline

HTTPS + HSTS; strict Content Security Policy; CSRF protection (server actions' origin checks, SameSite cookies); output escaping; no HTML rendering of user input; Dependabot; lockfile; `npm audit` in CI; security headers on all routes.

### 9.8 Privacy

- **Roles:** the detailer controls their customers' data; DetailerHQ processes it on their behalf (to confirm in legal review).
- **Collected about end customers:** name, phone and/or email, preferred contact method, service address (mobile jobs only), vehicle year/make/model/color/size, optional plate, notes. **Not collected:** VIN, date of birth, license numbers, payment data, location tracking, marketing consent.
- **No customer accounts**, no third-party trackers on public pages or dashboard, no PII in logs, hashed IPs only.
- **Consent** recorded only for being contacted about the request.
- **US law:** CAN-SPAM for our outreach; TCPA/10DLC before any future SMS; state privacy laws assessed in legal review. *Not legal advice.*

### 9.9 Auditing and operations

Audit events for sign-in, password/email change, request decisions, holds placed/released, cancellations, reschedules, exports, customer deletion/anonymization, settings changes, account status changes, closure/deletion, operator access. Provider backups with a tested restore before pilots use real data. Uptime check on the booking page.

---

## 10. Notifications

**In-app only in the MVP.** No email, SMS or push to owners or customers; core functionality never depends on a messaging service.

Events: new request; possible duplicate / related request; new inquiry; customer accepted/declined proposal; customer withdrew/cancelled; customer asked to reschedule; hold expired; proposal/request expired; quote expired; unusual submission volume; pilot/trial ending (banner).

Delivery: notification list, bell count, badges, Today screen; refreshed on navigation and by polling every 60 s while visible. Owner email notifications are the first post-MVP candidate once an email provider is selected.

---

## 11. Analytics definitions

Rules: recorded data only; business timezone; definition visible for every metric; rates need ≥ 5 items in the denominator ("Not enough data yet" otherwise); no benchmarks or projections; **no causal claims** (sequence wording only); no sample data in real accounts.

| Term | Definition |
|---|---|
| **Quoted value** | Sum of `total_cents` of quotes sent in the period (by `sent_at`) |
| **Booked job value** | Sum of `estimated_total_cents` of appointments with start in the period and status Scheduled, In progress or Completed |
| **Recorded revenue** | Sum of `recorded_total_cents` of Completed appointments with start in the period — amounts the owner entered; not verified payments; tax not separated |

| Metric | Definition |
|---|---|
| Requests received | Requests created in period (duplicates shown separately) |
| Median first response time | Creation → first owner action (approve, hold, propose, decline) |
| Request outcomes | Requests created in period by current status |
| Request-to-booking rate | Requests created in period that became appointments ÷ requests created in period, excluding duplicates and still-open requests |
| Holds placed / converted | Holds placed in period; share whose request was approved (sequence only) |
| Appointments completed | Completed with start in period |
| Average recorded job value | Recorded revenue ÷ appointments completed |
| Cancellations & no-shows | By who cancelled; rate ÷ appointments with start in period (excluding future scheduled) |
| Quote acceptance rate | Accepted ÷ (Accepted + Declined + Expired) for quotes sent in period |
| Leads by source and status | Leads created in period |
| Lead-to-booked rate | Leads created in period now Booked ÷ leads created in period (note on immature cohorts) |
| Follow-up activity | Outbound communications logged and follow-up tasks completed, with outcomes |
| Leads booked after a logged follow-up | Count; note: "Shows timing only — it doesn't mean the follow-up caused the booking." |
| Top services | Count and recorded line amounts from completed appointment items |
| New vs. returning customers | First completed appointment in period vs. earlier |

Each metric has a reference SQL query in the test suite.

---

## 12. Pricing, pilot, trial, retention, closure and deletion

### 12.1 Pricing

| Stage | Offer | Collection |
|---|---|---|
| **Pilot (early access)** | **$25 for the first month**, described as an early-access offer for pilot businesses | Manual, outside the product (method requires approval; no billing integration in MVP) |
| After the pilot's first month | **Open decision** (§17.3) — e.g., continue at the public price, or a stated early-access rate | — |
| **Public paid launch** | **$49/month target, subject to validation** with pilots before publishing | Integrated subscription billing with tax handling (§3.2) |

The public price is not advertised until validated. Marketing never shows a struck-through "regular price" or fake urgency.

### 12.2 Pilot / early-access terms (draft before inviting pilots)

Duration and dates; $25 first-month price and how it's paid; what happens after the first month; features included and that they may change; no service-level guarantee; data ownership; export at any time; what happens at pilot end (continue, export, or close and delete); support and feedback; that it is **not** a free trial.

### 12.3 Activation and 7-day free trial (paid launch)

- **Activation** = owner's email verified **and** business created (onboarding step 1). Recorded as `activated_at`.
- Trial starts at activation: `trial_started_at = activated_at`, `trial_ends_at = activated_at + 7 days` (exact instant, shown in business timezone).
- Before activation: `pending_activation` — onboarding allowed, publishing and requests not allowed, no trial clock.
- **No credit card required** (current preference).
- Disclosed at sign-up, pricing page and in-app: length, exact end time, what's included, what happens at the end, **no data deleted at trial end**, how to subscribe.
- In-app reminders throughout, prominent from 3 days before and on the last day; email reminders once email exists.
- One trial per business; operator may extend.
- Pilot accounts never enter `trialing`.

### 12.4 Account states and access

| State | Dashboard | Booking page | Status links | Export |
|---|---|---|---|---|
| `pending_activation` | Onboarding only | Not published | — | — |
| `pilot`, `trialing`, `active` | Full | Accepting (if on) | Full | ✅ |
| `past_due` (grace, proposed 7 days) | Full + banner | Accepting | Full | ✅ |
| `cancelled` (until period end) | Full + banner | Accepting | Full | ✅ |
| `trial_expired`, `inactive` | **Read-only**; export; subscribe; account; closure | Not accepting; shows business contact | Show status; withdraw/cancel allowed; accept-proposal disabled | ✅ |
| `closing` (closure requested, in grace period) | Read-only; can cancel closure | Offline | Generic "no longer available" | ✅ |
| `suspended` | Blocked except export & support | Offline | Generic | On request |

Read-only is enforced by the server **and** RLS (`can_write`). **No business or customer data is deleted because a trial ends.** Subscribing restores full access immediately.

### 12.5 Retention schedule (proposal — must be approved, legally reviewed and disclosed before public launch)

| Data | Retention |
|---|---|
| Active / restricted account data | Kept while the account exists; restricted accounts kept **180 days** after access ends, with notices at 30 and 7 days (in-app; email once available) |
| Closed requests not linked to a customer | 12 months after closing |
| Customer deleted by owner | Immediately hard-deleted (customer, vehicles, communications, notes, request contact snapshots); appointments anonymized |
| Notifications | 90 days |
| Activity events | Lifetime of the record they describe |
| Audit events | 12 months |
| Rate-limit events (hashed IPs) | 30 days |
| Contact/pilot applications | 12 months after last contact |
| Backups | Provider retention (e.g., 7 days — verify); deleted data persists until rotated; disclosed |

**Automated deletion jobs stay disabled** until this schedule is approved, disclosed, and pre-deletion notices can be delivered.

### 12.6 Account closure and deletion

| Flow | Steps |
|---|---|
| **Export** | Always available (except suspended without request): CSV zip of customers, vehicles, requests, appointments + items, leads, quotes + items, tasks, communications |
| **Close account** | Owner re-authenticates, types business name → status `closing`, booking page offline immediately, status links show generic message, subscription (later) cancelled → **30-day grace** during which the owner can cancel closure → hard deletion of all business data (all business-owned tables, memberships) → owner's auth user deleted if no other memberships → audit record without PII ("business deleted", date) |
| **Inactive account expiry** | 180 days after access ends (after notices) → same deletion as closure |
| **Delete one customer** | Owner action with typed confirmation → hard delete PII, anonymize appointments |
| **End-customer request to DetailerHQ** | Forwarded to the business (controller); we assist; we act directly only as legally required |
| **Operator deletion** | Scripted, reviewed, audited; same order as automated deletion |

Deletion runs in a single transaction per business where possible; a verification query confirms zero remaining rows for that `business_id`.

### 12.7 Documentation required before public launch

- [ ] Privacy Policy: data collected (owners and end customers), purposes, processors (hosting, database, email), retention schedule (§12.5), backups, deletion and closure, contact.
- [ ] Terms of Service: trial terms, subscription, cancellation, account states, restricted access, data export, closure and deletion, acceptable use, controller/processor roles.
- [ ] Data processing / service-provider terms for businesses (if counsel advises).
- [ ] Internal runbooks: deletion procedure, backup restore, credential rotation, incident response and breach notification assessment.
- [ ] Subscription tax handling decision (accountant) and billing provider configuration.
- [ ] Pilot/early-access terms (needed earlier, before pilots).

---

## 13. Testing and acceptance criteria

### 13.1 Test strategy

| Level | Tooling | Scope |
|---|---|---|
| Unit | Vitest | Slots, DST, pricing, totals, transitions, cutoffs, hold/proposal expiry math, duplicate rules, template rendering, metrics; ≥ 90% of `/src/domain` |
| Database | pgTAP (Supabase CLI) | RLS matrix (§13.2), constraints, triggers, exclusion constraint, composite FKs, definer function outputs, scheduled jobs |
| API-level isolation | Vitest using `supabase-js` against a local Supabase stack | Same RLS matrix through the **Data API** with real JWTs and the anon key |
| App-level isolation | Playwright | Every route/server action with another business's IDs → 404 |
| Concurrency | Integration | Parallel approvals/holds/accepts for overlapping times → exactly one succeeds |
| End-to-end | Playwright (375 / 768 / 1280 px projects) | All booking flows and edge cases E1–E20 where UI-reachable |
| Accessibility | axe-core + manual keyboard and screen reader passes | Zero serious/critical |
| Performance | Lighthouse CI | Booking page, home |
| Security | Dependabot, `npm audit`, bundle secret scan, catalog checks, Supabase advisor, OWASP ASVS L1 subset review | Every PR / release |
| Copy | String lint for banned claims ("sent" for messages, "charged", "free trial" during pilot, "AI", tax claims) | Every PR |
| Usability | Sessions with pilot detailers | Each phase |

### 13.2 RLS and cross-business test matrix

**Fixtures:** Business A (owner A), Business B (owner B), a signed-in user with **no** business (U), and anonymous (anon). Each business seeded with at least one row in every business-owned table.

**For every business-owned table**, both in pgTAP (`set role authenticated` + JWT claims / `set role anon`) **and** through the Data API (`supabase-js` with anon key and each user's JWT):

| Attempt | Owner A | Owner B | User U | anon |
|---|---|---|---|---|
| `SELECT` A's rows | ✅ rows returned | 0 rows | 0 rows | permission denied / 0 rows |
| `INSERT` row with `business_id = A` | ✅ (if granted & writable) | ❌ RLS violation | ❌ | ❌ |
| `INSERT` row for own business referencing A's customer/vehicle/service/request | n/a | ❌ FK / RLS violation | ❌ | ❌ |
| `UPDATE` A's row | ✅ (if granted) | 0 rows affected | 0 rows | ❌ |
| `UPDATE` own row setting `business_id = A` | ❌ immutable trigger | ❌ | — | — |
| `UPDATE` own row's FK to point at A's record | — | ❌ FK violation | — | — |
| `DELETE` A's row | ✅ only where allowed | 0 rows affected | 0 rows | ❌ |
| Call `public_api` functions | ❌ no privilege | ❌ | ❌ | ❌ (only `booking_api`) |

Additional required tests:

- Generated **coverage test**: the list of tables in the catalog equals the list covered by the matrix; a new table without tests fails CI.
- Catalog test: RLS enabled + forced on all tables; `anon` has zero privileges on application objects.
- Restricted account (`trial_expired`): owner can `SELECT`, all writes fail at the database.
- `booking_api` can execute public functions but cannot `SELECT` any table directly.
- Definer functions: return only allow-listed columns; a token for Business A's request cannot act on Business B's; slug of B can't create rows for A.
- Exclusion constraint: overlapping appointment/hold/proposal inserts fail; adjacent (`end = start`) succeed; different businesses may overlap.
- Status triggers: invalid transitions via direct `UPDATE` fail.

### 13.3 Acceptance criteria

All criteria must pass at 375, 768 and 1280 px and meet `DESIGN_SYSTEM.md` §12. 🧪 = automated test required.

**Accounts, activation, onboarding**
- [ ] Invite-only sign-up during pilot; invalid/used invites rejected. 🧪
- [ ] Supabase Auth handles sign-up, confirmation, sign-in, reset; no password data in our schema. 🧪
- [ ] Activation occurs only when email is verified **and** the business exists; `activated_at` set once. 🧪
- [ ] Unactivated accounts cannot publish or receive requests. 🧪
- [ ] Policies step pre-fills 24 h as a **suggestion** that can be changed to any allowed value. 🧪
- [ ] No service has a price the owner didn't enter. 🧪

**Services and availability**
- [ ] Price types behave as specified; only bookable services appear publicly. 🧪
- [ ] Size-class overrides apply; menu edits never alter snapshots. 🧪
- [ ] Slot tests cover windows, notice, horizon, buffer, cap, time off, active/expired holds and proposals, DST. 🧪

**Public booking**
- [ ] No customer account or login is required at any step. 🧪
- [ ] Each request requires exactly one vehicle description (make, model, size class at minimum). 🧪
- [ ] Only allow-listed data appears in responses; no other customer or appointment data. 🧪
- [ ] Invalid input (unknown fields, oversize payload, foreign service IDs, non-slot times, missing consent) is rejected server-side and in the database. 🧪
- [ ] Rate limits, honeypot, timing check and open-request cap behave as in §9.4 with generic messages. 🧪
- [ ] Public functions are not callable through the Supabase Data API with the anon key. 🧪
- [ ] Confirmation states "not confirmed yet" and shows the status link. 
- [ ] Booking page LCP < 2.5 s (mobile, simulated 4G).

**Booking workflow**
- [ ] Approve links customer and vehicle within the same business (cross-business IDs fail at DB), creates one appointment, and is idempotent. 🧪
- [ ] A vehicle not belonging to the chosen customer cannot be linked. 🧪
- [ ] Propose: block created, expiry set, status page Accept/Decline; accept creates appointment; expired proposal rejected. 🧪
- [ ] Decline stores optional customer message and internal reason. 🧪
- [ ] Every status page state matches §6.4 with masked contact details. 🧪

**Holds**
- [ ] Pending requests without a hold don't affect public slots. 🧪
- [ ] Owner can place a hold of 2–72 h, never past the requested start; default from settings. 🧪
- [ ] Hold placement fails on overlap with appointment/hold/proposal (DB). 🧪
- [ ] Held time disappears from public slots and reappears immediately after expiry or release. 🧪
- [ ] Approving the held request converts the hold atomically. 🧪
- [ ] Decline/withdraw/expire/duplicate release the hold. 🧪
- [ ] Expired holds are purged and the owner notified once. 🧪
- [ ] Approving or manually booking over another request's hold requires explicit release, recorded in activity. 🧪

**Conflicts**
- [ ] Overlapping confirmed appointments are impossible via UI, server actions, direct Data API calls and concurrent requests. 🧪
- [ ] Soft warnings require explicit confirmation. 🧪

**Duplicates, expiry, cancellation, rescheduling**
- [ ] Idempotent resubmission; possible-duplicate vs related-request flags; open-request cap. 🧪
- [ ] Pending requests expire at requested start; proposals at their expiry. 🧪
- [ ] Customer cancel respects the owner's setting and cutoff (exactly-at-cutoff is after). 🧪
- [ ] "Ask to reschedule" respects the rescheduling cutoff, notifies the owner, and does not change the appointment. 🧪
- [ ] Owner reschedule enforces hard rules, records previous time, updates status page. 🧪

**Time zones**
- [ ] Correct display and slots in Eastern, Central, Mountain, Arizona, Pacific, Alaska, Hawaii. 🧪
- [ ] Spring-forward gap never offered; fall-back instants distinct and labelled. 🧪
- [ ] Timezone change preserves instants and warns. 🧪

**Customers and vehicles**
- [ ] A customer can have multiple vehicles; appointments and quotes reference exactly one. 🧪
- [ ] Search within 300 ms for 5,000 customers; duplicate suggestions within the business only. 🧪
- [ ] Delete anonymizes appointments and removes PII. 🧪

**Leads, quotes, follow-ups, communications**
- [ ] Inquiries create leads, never requests. 🧪
- [ ] Lead status automation and manual override recorded. 🧪
- [ ] Quotes: per-business numbering, totals in cents, no tax computation, auto-expiry. 🧪
- [ ] Quoted, booked and recorded values stored separately. 🧪
- [ ] Templates render; missing placeholders block copying; communications logged only after confirmation; no automatic sending anywhere. 🧪

**Notifications and analytics**
- [ ] Each §10 event produces one notification for the right business only. 🧪
- [ ] Each metric matches its reference SQL; thresholds; non-causation note. 🧪

**Security**
- [ ] §13.2 matrix passes for every business-owned table via SQL and Data API. 🧪
- [ ] Bundle scan finds no service-role key or server-only variables. 🧪
- [ ] Token pages send `no-store`, `no-referrer`, `noindex`. 🧪

**Pilot, trial, retention, closure**
- [ ] Pilot accounts show early-access wording, never "free trial". 🧪
- [ ] *(Phase 7)* Trial ends exactly 7 days after activation; restricted state is read-only at the DB; no rows deleted; subscribing restores access. 🧪
- [ ] Closure: booking page offline immediately; cancel within 30 days restores; deletion leaves zero rows for that business. 🧪
- [ ] No automated deletion job runs while the retention flag is off. 🧪
- [ ] Export works in every non-suspended state. 🧪

**Marketing**
- [ ] Every claim maps to shipped features; no testimonials, statistics or claims without evidence; early-access pricing shown accurately. 
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility 100, Best Practices ≥ 95.

---

## 14. Architecture, budget and assumptions to verify

### 14.1 Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Web | Next.js App Router; server components and server actions |
| Database | Supabase Postgres (`btree_gist`, `pg_cron`, `citext`, `pg_trgm`) |
| Auth | Supabase Auth with `@supabase/ssr` |
| Owner data access | `supabase-js` with the user's session (Data API + RLS); generated types |
| Public data access | Server-only pooled Postgres connection as `booking_api` → `public_api` functions |
| Migrations | Supabase CLI SQL migrations |
| Jobs | `pg_cron` |
| Validation | Zod (server) + database constraints |
| UI | Accessible headless primitives, our tokens only; Lucide icons |
| Time | Timezone-aware date library (e.g., `date-fns-tz` or Temporal polyfill) |
| Tests | Vitest, pgTAP, Playwright, axe-core, Lighthouse CI |
| CI | GitHub Actions |

### 14.2 Estimated monthly cost (unverified planning estimates)

| Item | Development | Pilot (real data) | Public launch |
|---|---|---|---|
| Vercel | $0 Hobby | ~$20 Pro (Hobby is non-commercial) | ~$20 |
| Supabase | $0 Free | ~$25 Pro (backups, no pausing) | ~$25 |
| Auth email | $0 default sender | $0 (verify limits for 3–5 pilots) | $0 free tier (provider TBD) |
| Domain | — | Decision needed | ~$1–2 |
| Billing + tax features | — | — | % fees; tax feature fees to evaluate |
| **Total** | **$0** | **≈ $45** | **≈ $45–47 + % fees** |

Pilot revenue at 3–5 × $25 = $75–125 for the first month, covering infrastructure for that period.

### 14.3 Assumptions to verify before relying on them

| # | Assumption |
|---|---|
| A-1 | Vercel Hobby is non-commercial; Pro ~$20/user/month |
| A-2 | Supabase Free pauses inactive projects and lacks needed backups; Pro ~$25 with daily backups |
| A-3 | `pg_cron` and `btree_gist` available on our plan |
| A-4 | Supabase default auth email sender limits are adequate for 3–5 pilots, not for public launch |
| A-5 | Leaked-password protection, invites and MFA availability on our plan |
| A-6 | No file storage needed in MVP |
| A-7 | Usage quotas suffice for ~100 businesses; spend alerts available |
| A-8 | Billing provider fees and tax-feature pricing acceptable |
| A-9 | Booking links on a platform subdomain will change when a domain is bought |
| A-10 | A free bot challenge remains free (only if needed) |
| A-11 | A custom least-privilege Postgres login role can connect from Vercel through Supabase's pooler |
| A-12 | Pilot payment method (manual) acceptable to pilots and compliant (tax treatment of $25 pilot fee to confirm with accountant) |

### 14.4 Repository structure (proposed)

```
/app            routes: (marketing), (auth), onboarding, app/*, b/[slug], r/[token], q/[token], api/*
/src/domain     pure logic (slots, DST, pricing, transitions, metrics)
/src/data       server-only data access (owner: user session; public: booking_api)
/src/ui         design-system components and tokens
/src/config     brand and product configuration
/supabase       migrations, policies, functions, pgTAP tests, dev seed
/tests          unit, api-isolation, e2e
/docs           plans, decisions, legal drafts, runbooks
```

---

## 15. Customer acquisition plan

1. **Target:** independent mobile detailers and small shops in 1–3 US metro areas; aim for **3–5 pilots** with at least one or two mobile detailers.
2. **Prospecting:** Google Business Profiles, Instagram/Facebook business pages, local car communities — manually, following platform rules. No scraping, automated DMs or bought lists.
3. **Outreach:** individually written emails and social messages referencing the business specifically; ask for a 20-minute conversation; no claims about unbuilt features. Email follows CAN-SPAM (accurate sender, physical address, working opt-out). One follow-up maximum without a reply.
4. **Discovery call:** current booking process, missed requests, quoting, follow-up habits, tools and spend, mobile vs. shop needs.
5. **Pilot offer:** early access at **$25 for the first month** under written terms; onboard together; observe week one; weekly 15-minute check-ins.
6. **Price validation:** before the paid launch, ask each pilot about continuing at **$49/month** and record answers and objections verbatim.
7. **Funnel tracking (manual):** contacted → replied → call → pilot → active at 4 weeks → paid → willing at $49.
8. **Expansion gate:** ≥ 3 paying pilots, ≥ 2 willing at the proposed price (or a revised price), no unscheduled blocking issues.

---

## 16. Phased implementation roadmap

Each phase ends with a demo on a real phone and approval before the next.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** | Repo, CI, lint/types, design tokens and core components; local Supabase; full schema v1 (§8) with RLS, triggers, composite FKs, exclusion constraint; roles (`booking_api`, no `anon` grants); Supabase Auth; activation; RLS test matrix generator; catalog and bundle-secret checks | Sign-in → empty dashboard at 3 widths; **§13.2 matrix green for all tables** |
| **1. Setup & public booking** | Onboarding (incl. policies), services, size classes, availability, slot engine with DST, booking page, request flow (one vehicle), inquiry flow, status page (pending), public endpoint validation and abuse controls | A detailer configures their menu; a request is submitted from a phone; abuse tests pass |
| **2. Booking workflow & calendar** | Inbox; approve with customer/vehicle linking; decline; propose; **holds**; duplicates; conflicts; appointments; calendar; cancel; reschedule; ask-to-reschedule; full status page; Today; notifications | Edge cases E1–E20 demonstrated/tested |
| **3. Customers & vehicles** | Customer/vehicle CRUD, multiple vehicles, search, history, archive, delete/anonymize | Owner enters 20 customers with vehicles on a phone |
| **4. Leads, quotes, follow-ups** | Leads, quotes (no tax), share/print, communication log, templates, tasks and rules, scheduled jobs | Inquiry → lead → quote → follow-up → booked |
| **5. Analytics, settings, data** | Metric catalog, settings, export, account closure request flow (deletion job disabled) | Metrics match reference queries |
| **6. Hardening & pilot launch** | Security review, CSP, restore drill, accessibility audit, performance, marketing site (early-access stage), Terms/Privacy/pilot terms drafts, monitoring; operator invite flow | 3–5 pilots onboarded at $25 first month (manual collection) |
| **7. Paid-launch readiness** | Billing integration at validated price; subscription **tax handling**; activation-based 7-day trial; account states and `can_write`; retention schedule finalized and disclosed; deletion jobs with notices; custom SMTP; legal review; public sign-up; name clearance and domain (approved spend) | All Phase 7 criteria in §13.3 pass; legal and accountant sign-off |
| **Later** | §3.3 by evidence | — |

---

## 17. Decisions, open questions and risks

### 17.1 Confirmed decisions

| # | Decision |
|---|---|
| D-1 | US only |
| D-2 | Supabase Auth; RLS on every business-owned table |
| D-3 | Requests require owner approval or customer acceptance of an owner proposal; never auto-confirmed |
| D-4 | Business-defined services, prices, durations, bookability; no universal prices |
| D-5 | Leads and quotes separate from booking requests |
| D-6 | No automated customer messaging; templates + owner's own apps |
| D-7 | In-app notifications only in MVP |
| D-8 | CSV import later unless pilots prove essential |
| D-9 | No customer payments, deposits or **tax calculation** in MVP |
| D-10 | Subscription billing and tax handling before public paid launch |
| D-11 | Pilot: 3–5 businesses incl. mobile detailers; **$25 first month**, early-access offer |
| D-12 | Public subscription target **$49/month**, subject to validation |
| D-13 | No customer accounts on public booking pages |
| D-14 | 7-day free trial starts at activation (email verified + business created); no card (preference) |
| D-15 | Multiple vehicles per customer; one specific vehicle per request/appointment |
| D-16 | Pending requests don't block availability; optional owner-placed temporary holds |
| D-17 | Owner-configurable cancellation/rescheduling policies; 24 h suggested default |
| D-18 | No automatic deletion when a trial ends; retention, closure and deletion documented before public launch |
| D-19 | Provisional, configurable branding; no spending |
| D-20 | Next.js + Supabase on Vercel; ≈ $45/month target |

### 17.2 Proposals awaiting approval

| # | Proposal |
|---|---|
| P-1 | Hold durations 2–72 h, default 24 h, ending no later than the requested start |
| P-2 | Proposal expiry default 48 h (2–72 h) |
| P-3 | Owners must explicitly release another request's hold before booking over it |
| P-4 | Customer "Ask to reschedule" (request only) included in MVP |
| P-5 | Max 3 open requests per contact per business; rate limits in §9.4 |
| P-6 | Restricted accounts retained 180 days with 30/7-day notices |
| P-7 | Account closure grace period 30 days |
| P-8 | Retention periods in §12.5 |
| P-9 | `past_due` grace 7 days |
| P-10 | Public operations via `booking_api` role, not the Data API |
| P-11 | Masked contact details on status pages |
| P-12 | Rates shown only with ≥ 5 items |

### 17.3 Open questions

1. **After the $25 first month**, what do pilots pay — the public price, an early-access rate, or another free/discounted period?
2. **How is the $25 collected** (manual invoice/payment link — which provider; requires account registration and approval)? Tax treatment of pilot fees (accountant)?
3. **Domain timing** for stable booking links (after name clearance and approval to spend).
4. Retention periods and closure grace acceptable before legal review?
5. Which metro areas and first 10–20 prospects?
6. Should "Ask to reschedule" ship in the MVP (P-4) or wait for pilot feedback?
7. Bot challenge from day one, or only if abuse appears?

### 17.4 Branding

Name, short name, wordmark text and support email live only in `/src/config`; the booking page features the detailer's brand with a small "Powered by" link; no logo, domain, handles or trademark filings until cleared and approved.

### 17.5 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-business data exposure via Data API | Fatal | Forced RLS everywhere, minimal grants, triggers, composite FKs, §13.2 matrix in CI, catalog checks, Supabase advisor |
| Custom `booking_api` role not feasible on plan (A-11) | Public endpoint design changes | Fallback: server-only module using the service-role key **only** to call `public_api` functions (never table access), with the same rate limits; requires explicit approval |
| Service-role / DB credential leak | Full compromise | Not deployed in MVP; server-only modules; bundle scan; rotation runbook |
| Hold/conflict logic bugs | Double-booking or lost slots | Single exclusion constraint for all blocks; concurrency tests; lazy + scheduled expiry |
| Customers miss status changes (no messaging) | Missed proposals | Status link everywhere; holds and proposal expiry visible; owner prompted to contact |
| Owners miss requests (in-app only) | Lost jobs | Today screen, badges, polling, home-screen install, response task rule; owner email first post-MVP |
| Timezone/DST errors | Wrong-time jobs | UTC storage, allow-listed zones, DST test suite |
| $49 price not validated | Revenue risk | Explicit validation with pilots before publishing |
| Pilot payments handled informally | Accounting/tax gaps | Accountant check; written pilot terms |
| Unexpected deletion | Trust loss | No deletion at trial end; deletion jobs disabled until policy, disclosure and notices |
| Free-tier/pricing changes | Budget | Verify A-1…A-12; spend alerts |
| Brand not cleared | Rebrand | Config-only branding |
| Spam on public forms | Noise | Rate limits, honeypot, timing, cap, optional challenge |
| Feature creep | Delay | Intake rule (§3.4) |
| Legal/privacy gaps | Compliance | §12.7 documentation; legal review before paid launch |
| Single developer | Stalls | Simple architecture, tests, docs |
