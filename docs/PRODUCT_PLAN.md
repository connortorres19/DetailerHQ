# DetailerHQ — Product Plan

> **Status:** Final draft for approval · **Revision 4** · **Last updated:** 2026-10-30
> **Working name:** DetailerHQ is provisional and has **not** been legally or commercially cleared. It is a configuration value only (§17.6). No domains, services or brand assets are to be purchased or registered without explicit approval.
> **Companion document:** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
> **Implementation has not started.** Nothing in this document has been built, deployed or tested. Vendor behavior described here is **unverified** until the checks in §14.3 are completed.

### How decisions are labelled

| Label | Meaning |
|---|---|
| **D-n** | Approved by the user. Do not change without the user's approval. |
| **REC-n** | Recommendation from planning. **Not approved.** Used as the working assumption only where marked, and listed in §17.2 for decision. |
| **V-n** | Verification item: vendor/documentation behavior that must be checked before the dependent work starts (§14.3). |

Revision 3 used the labels P-1…P-12 and R-1…R-5 for recommendations. The user's revision-4 approvals reused some of those labels with **different meanings**, so revision 4 retires the old labels: approved items are now D-21…D-27 (quoted from the user's wording), and all still-unapproved recommendations are renumbered REC-01…REC-24 (old labels noted for traceability in §17.3).

### What changed in revision 4

- **Approved (D-21–D-27):** restricted server-side public booking endpoint with minimum privileges; explicit database permissions with unnecessary defaults removed; database safeguards for business/customer/vehicle/appointment/status relationships; owners read-only on their schedule with changes only through authorized server-side operations; no private data exposed by public booking; **capacity-aware scheduling**; automatically expiring holds that respect capacity.
- **Scheduling redesigned around capacity** (§6.6, §8.6): mobile businesses default to 1 simultaneous job; shops configure their capacity. The revision-3 exclusion constraint (which could only express capacity 1) is replaced by a **locked, trigger-enforced capacity check** that is correct under concurrency. The rejected "single-session appointment" idea (old R-5) is withdrawn; multi-day jobs consume one unit of capacity for their duration.
- **Holds** now consume capacity and expire purely by timestamp — expired holds are ignored by every check, so correctness no longer depends on clean-up jobs.
- **Permissions model** (§9.2) rewritten: default privileges revoked; per-role grants listed; owners have **no direct write access** to appointments, schedule or workflow columns.
- **Finding:** revision 3 said "RLS enabled **and forced**". Forcing RLS would also apply policies to our own security-definer functions (which run as the table owner) and break them. Revision 4 recommends **enabled, not forced**, with compensating controls (REC-21, V-4).
- **Verification checklist** (§14.3) of Supabase, Vercel, Next.js and PostgreSQL documentation to check before implementation.
- **Roadmap** (§16) now starts with a documentation-only verification phase, then a database-first foundation phase.

Preserved approved decisions include: 7-day free trial starting at activation (D-14), booking requests without customer accounts (D-13), no customer deposits or payments (D-9), no automatic data deletion when a trial ends (D-18), and all other D-1–D-20.

---

## Contents

1. [Summary](#1-summary)
2. [Target customer and pilot](#2-target-customer-and-pilot)
3. [Final MVP scope](#3-final-mvp-scope)
4. [User roles and permissions](#4-user-roles-and-permissions)
5. [Final page inventory](#5-final-page-inventory)
6. [Booking workflow, capacity and edge cases](#6-booking-workflow-capacity-and-edge-cases)
7. [Other workflows](#7-other-workflows)
8. [Database schema, permissions and relationships](#8-database-schema-permissions-and-relationships)
9. [Security and privacy requirements](#9-security-and-privacy-requirements)
10. [Notifications](#10-notifications)
11. [Analytics definitions](#11-analytics-definitions)
12. [Pricing, pilot, trial, retention, closure and deletion](#12-pricing-pilot-trial-retention-closure-and-deletion)
13. [Testing and acceptance criteria](#13-testing-and-acceptance-criteria)
14. [Architecture, budget and verification requirements](#14-architecture-budget-and-verification-requirements)
15. [Customer acquisition plan](#15-customer-acquisition-plan)
16. [Phased implementation roadmap](#16-phased-implementation-roadmap)
17. [Decisions, recommendations, open questions and risks](#17-decisions-recommendations-open-questions-and-risks)

---

## 1. Summary

DetailerHQ is a web application for **independent auto detailers in the United States** — mobile operators and small shops — that replaces scattered texts, DMs, notes and spreadsheets with one tidy system.

The MVP does six things:

1. A **public booking page** where customers **request** an appointment for a specific vehicle — no customer account required (D-13).
2. An **approval workflow**: the owner approves, declines, proposes a different time, or temporarily holds the requested time. The customer always sees a clear status and next step.
3. **Capacity-aware scheduling**: the system never lets confirmed appointments and active holds exceed the number of jobs the business can handle at once (D-26).
4. **Customer and vehicle records** (many vehicles per customer), always tied to the correct business.
5. **Leads, quotes and follow-ups**, tracked separately from booking requests, with templates the owner sends from their own phone or email.
6. **Honest analytics** from recorded data only.

Not in the MVP: automated SMS/email/social messages, customer payments or deposits, tax calculation, CSV import, customer accounts, employee management.

### Success criteria

| Goal | Measure |
|---|---|
| Useful | 3–5 pilot businesses (at least one mobile detailer) use it for real requests for 4 consecutive weeks |
| Worth paying for | ≥ 3 pilots pay the $25 early-access first month; ≥ 2 indicate they would continue at the proposed subscription price |
| Cheap to run | Infrastructure ≤ ~$50/month through the first ~100 businesses |
| Trustworthy | Zero cross-business data exposure; zero over-capacity bookings; permission, RLS and concurrency suites pass on every deploy |
| Honest | Every claim maps to a shipped, tested feature |

---

## 2. Target customer and pilot

### 2.1 Customer

**Independent mobile detailers and small detailing shops in the US** (1–5 people). Phone-first, low setup tolerance, rely on texting and Instagram/Facebook, price by vehicle size and condition (**every business sets its own prices**, D-4). Mobile detailers typically work one job at a time; shops may work on several vehicles at once (multiple bays, cars left to cure).

### 2.2 Problems solved

| Problem | DetailerHQ |
|---|---|
| Requests arrive everywhere; some get missed | One booking page, one Requests inbox, in-app notifications |
| Customers don't know if they're booked | A status page per request with a clear next step |
| Repeated price questions | The business's own published menu |
| Overbooking | Database-enforced capacity: never more simultaneous jobs and holds than the business can handle |
| Lost track of which car is whose | Customers with multiple vehicles and per-vehicle history |
| Quotes never followed up | Leads, quotes, follow-up tasks, templates, communication log |
| No idea what makes money | Analytics separating quoted value, booked job value and recorded revenue |

### 2.3 Pilot (D-11)

- **3–5 independent businesses**, including mobile detailers.
- **Early-access offer: $25 for the first month**, presented plainly as an early-access offer, collected **manually outside the product** (method requires approval; §17.4).
- Written pilot terms (§12.2). Pilot access is never described as a free trial.

---

## 3. Final MVP scope

### 3.1 MVP — required for the pilot

| Area | Requirement |
|---|---|
| **Owner accounts** | Supabase Auth (email + password), invite-only during pilot, email verification, password reset; one business per owner |
| **Business profile** | Name, phone, email, US timezone, service mode (mobile / shop / both), service area, shop address, booking slug |
| **Capacity** | Number of simultaneous jobs: **mobile-only businesses default to 1** (D-26); shops and mixed businesses set their own capacity |
| **Onboarding** | Profile → where you work & capacity → hours → policies → services → preview and publish |
| **Service menu** | Owner-defined categories, services, descriptions, prices, durations; fixed / "from" / quote required; optional per-size-class price and duration; add-ons; bookable on/off. No prefilled prices. |
| **Availability** | Weekly hours, time off, start interval, minimum notice, horizon, buffer, optional daily job cap |
| **Policies** | Owner-defined cancellation and rescheduling cutoffs (24 h suggested, D-17), customer self-cancel on/off, policy texts |
| **Public booking page** | No customer account. One vehicle per request. Inquiry flow. Accepting-requests switch. Served through a restricted server-side endpoint (D-21) that exposes no private data (D-25). |
| **Customer status page** | Status and next step; accept/decline proposed time; withdraw; cancel before cutoff |
| **Requests inbox** | Approve, decline, propose a different time, place/release a temporary hold, close as duplicate; capacity and soft-rule warnings; customer and vehicle linking |
| **Appointments & calendar** | Day/Week/Agenda with concurrent jobs shown side by side; manual creation; reschedule; cancel; start; complete; no-show — **all changes through authorized server-side operations** (D-24) |
| **Customers & vehicles** | Manual entry, multiple vehicles per customer, search, history, archive, delete/anonymize |
| **Leads & quotes** | Separate from requests; lead statuses New, Contacted, Quote sent, Follow-up due, Booked, Lost; quotes without tax calculation |
| **Communication log, follow-ups, templates** | As in §7.6 |
| **Notifications** | In-app only |
| **Analytics** | Defined metrics from recorded data |
| **Settings & data** | Business settings, templates, account, CSV export, account closure request |
| **Pilot status** | `pilot` account status; pilot end date in-app |
| **Marketing site** | Home, Early access, Contact/apply, Terms, Privacy, Pilot terms |

### 3.2 Required before the public paid launch (D-10, D-14, D-18)

- Subscription billing at the validated price (target $49/month, D-12), with **tax handling for subscriptions** reviewed with an accountant.
- 7-day free trial starting at activation; trial enforcement; account-state handling — tested.
- Retention, closure and deletion policy finalized, legally reviewed and disclosed; pre-deletion notice delivery before any automated deletion is enabled.
- Transactional email provider for auth emails (possibly needed earlier — V-12).
- Public self-serve sign-up; legal review; name clearance and domain (approved spending).

### 3.3 Later — not in the MVP

Automated SMS/email to customers; owner email notifications; social integrations; deposits and online payments; tax calculation; CSV import (unless pilots prove essential, D-8); online quote acceptance; customer self-service rescheduling; auto-approval; **employee management, per-bay or per-resource scheduling** (the data model is prepared for it, §8.6.3); calendar sync; photo uploads; multiple locations; non-US markets; dashboard dark mode; native apps; public API; AI features.

### 3.4 Feature intake rule

A feature joins the active plan only if two or more pilots independently need it, a pilot says it's the reason they won't pay, or it is required for security, privacy, legal compliance or data integrity. Additions are logged in `docs/decisions/`.

---

## 4. User roles and permissions

| Role | Who | How identified | MVP |
|---|---|---|---|
| **Owner** | Detailer who created the business | Supabase Auth session → `authenticated` database role + membership row | ✅ |
| **Public visitor** | Anyone with the booking link | Nothing — no account (D-13) | ✅ |
| **Token holder** | Customer with a request-status or quote link | Unguessable token; only its SHA-256 hash stored | ✅ |
| **Public booking server path** | Our Next.js server acting for visitors/token holders | Restricted database role (D-21; mechanism REC-13) | ✅ |
| **Operator** | DetailerHQ staff | Supabase dashboard/CLI with MFA | ✅ |
| **System** | `pg_cron` jobs | Database role inside the database | ✅ |
| **Staff / employees** | Helpers, technicians | — | ❌ Later |

| Capability | Owner | Visitor | Token holder | Operator |
|---|---|---|---|---|
| View booking page, bookable services, available start times | ✅ | ✅ | ✅ | ✅ |
| Submit request or inquiry | — | ✅ via server path, rate-limited | — | — |
| View/act on one request (accept/decline proposal, withdraw, cancel within policy) | ✅ in app | ❌ | ✅ that request only | — |
| View one shared quote | ✅ | ❌ | ✅ that quote only | — |
| **Read own schedule** (appointments, holds, capacity usage) | ✅ read-only (D-24) | ❌ | ❌ | Break-glass |
| **Change schedule** (approve, hold, propose, reschedule, cancel, complete, capacity) | ✅ **only through authorized server-side operations** (D-24) | ❌ | Limited (accept proposal, withdraw, cancel) through server path | — |
| Read/write other business data (customers, vehicles, leads, quotes, tasks, templates…) | ✅ own business only, under RLS | ❌ | ❌ | Break-glass, audited |
| Analytics, export, closure request | ✅ own business only | ❌ | ❌ | Executes deletion |
| Set account status | ❌ | ❌ | ❌ | ✅ (billing webhook later) |

---

## 5. Final page inventory

`[slug]` = public booking handle; `[token]` = ≥ 128-bit random token.

### 5.1 Marketing (public)

| Route | Purpose |
|---|---|
| `/` | Home: real screenshots, request → approval flow, included / not available yet, early-access CTA |
| `/pricing` | **Pilot stage:** Early access — $25 for the first month, what happens after, how to apply. **Paid launch:** validated price and 7-day trial terms |
| `/contact` | Contact and pilot application |
| `/legal/terms`, `/legal/privacy`, `/legal/pilot-terms` | Legal pages |

### 5.2 Authentication (Supabase Auth)

`/sign-up` (invite-only during pilot), `/sign-in`, `/auth/confirm`, `/verify-email`, `/forgot-password`, `/reset-password`.

### 5.3 Onboarding

`/onboarding`: (1) Business profile + US timezone → **activation** once email is verified; (2) Where you work **and how many jobs you can handle at the same time** (mobile-only: 1, editable only if REC-17 is approved; shop/both: owner enters, prefilled per REC-16); (3) Hours and booking rules; (4) Cancellation and rescheduling policies (24 h suggested); (5) Services with owner-entered prices; (6) Preview and publish.

### 5.4 Dashboard (`/app`, authenticated)

| Route | Purpose |
|---|---|
| `/app` | Today: needs-action requests, holds expiring soon, today's schedule with concurrent jobs, tasks due, notifications, account banner, setup checklist |
| `/app/notifications` | Notification list |
| `/app/requests`, `/app/requests/[id]` | Inbox and request detail (approve, hold, release, propose, decline, close duplicate; capacity status for the requested time; customer & vehicle linking) |
| `/app/calendar` | Day / Week / Agenda; concurrent jobs side by side; capacity usage per time band; holds, proposals, time off |
| `/app/appointments/new`, `/app/appointments/[id]` | Manual appointment; detail with Start · Complete · Reschedule · Cancel · No-show |
| `/app/customers`, `/app/customers/new`, `/app/customers/[id]`, `/app/customers/[id]/vehicles/new`, `/app/vehicles/[id]` | Customers and vehicles |
| `/app/leads…`, `/app/quotes…`, `/app/tasks` | Leads, quotes (with print view), tasks |
| `/app/services`, `/app/services/[id]` | Service menu |
| `/app/availability` | Hours, time off, booking rules, **simultaneous job capacity** |
| `/app/booking-page` | Slug, intro, prep instructions, accepting requests, preview, link, QR |
| `/app/settings`, `/app/settings/policies`, `/app/settings/templates`, `/app/settings/account`, `/app/settings/plan`, `/app/settings/data` | Settings |
| `/app/analytics` | Metrics with definitions |

### 5.5 Public business pages (no customer account)

`/b/[slug]` booking page · `/b/[slug]/request` (Service → Vehicle (one) → Location → Time → Contact → Review) · `/b/[slug]/inquiry` · `/r/[token]` status · `/q/[token]` quote.

### 5.6 System

404, 500, booking page unavailable, link not valid, maintenance.

---

## 6. Booking workflow, capacity and edge cases

### 6.1 Principle

> **A request is not a booking.** It becomes a confirmed appointment only when the owner approves it or the customer accepts a time the owner proposed. A **hold** reserves capacity but is **not** a confirmation.

### 6.2 Request statuses

| Status | Meaning | Set by |
|---|---|---|
| `pending` | Waiting for the owner (may have an active hold) | Submission |
| `time_proposed` | Owner proposed another time; waiting for customer | Owner |
| `approved` | Confirmed; appointment exists | Owner, or customer accepting proposal |
| `declined` | Owner declined | Owner |
| `proposal_declined` | Customer declined the proposal | Customer |
| `withdrawn` | Customer withdrew before a decision | Customer |
| `expired` | Requested time passed while pending, or proposal unanswered | System |
| `closed_duplicate` | Closed as a duplicate | Owner |

Allowed transitions (enforced in the database, D-23):

```
pending ──► approved | time_proposed | declined | withdrawn | expired | closed_duplicate
time_proposed ──► approved | proposal_declined | withdrawn | expired | pending (owner retracts, or accept failed)
other states are terminal
```

Appointment lifecycle: `scheduled → in_progress → completed`; `scheduled | in_progress → cancelled`; `scheduled → no_show` (after start); `completed → scheduled` (owner correction, with capacity re-check).

### 6.3 Linking a request to business, services, customer and vehicle (D-23)

| Link | When | Database protection |
|---|---|---|
| **Business** | Submission | Resolved from `[slug]` inside the public function; never accepted from the client; `business_id` immutable |
| **Services** | Submission | Each submitted service ID re-validated in the database (same business, active, bookable); items stored with composite FK `(business_id, service_id)`; snapshots computed in the database |
| **Vehicle size class** | Submission | Composite FK `(business_id, size_class_id)` |
| **Customer** | Approval | Owner picks an existing customer of this business (matched only within this business) or creates one; composite FK `(business_id, customer_id)`; archived/anonymized customers cannot be newly linked |
| **Vehicle** | Approval | Owner picks one of **that customer's** vehicles or creates one; FK `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)` |
| **Appointment** | Approval | Created in the same transaction; same customer/vehicle as the request (trigger check); unique `booking_request_id` |

One request = one vehicle. A two-car visit is two requests (or two manual appointments); with capacity ≥ 2 both may run at once.

### 6.4 Customer status page

Shows only that request with masked contact details (masking is REC-10; the approved requirement is D-25: no private data exposure). Headlines, next steps and actions per state:

| State | Headline | Actions |
|---|---|---|
| Pending | Request received — not confirmed yet | Withdraw · Call/Text |
| Pending + hold | Request received — your time is being held (not a confirmation) | Withdraw · Call/Text |
| Time proposed | [Business] suggested a different time — held until [time] | **Accept this time** · Decline · Call/Text |
| Approved / Scheduled | Confirmed for [date, time, TZ] + location, prep, policies | Cancel (before cutoff, if allowed) · Ask to reschedule (REC-04) · Call/Text |
| Rescheduled | Time changed — now [new time]; previous shown | As Scheduled |
| Completed | Completed on [date] | Call/Text |
| Declined / Proposal declined / Withdrawn / Expired / Cancelled / Duplicate | Clear past-tense headline | Send a new request · Call/Text |

### 6.5 Pending requests and temporary holds (D-16, D-27)

**Pending requests never consume capacity or block availability.**

| Rule | Definition |
|---|---|
| Who places a hold | Owner only, from the request detail, through an authorized server-side operation (D-24). Never automatic. |
| What a hold reserves | **One unit of capacity** for the request's interval `[requested_start, requested_end)` (duration of selected services). |
| Capacity | **Holds are subject to the same capacity check as appointments** (D-27). A hold that would exceed capacity at any instant of its interval is rejected. |
| Duration | Owner-chosen within limits; ends no later than the requested start. Limits and default are REC-01 (2–72 h, default 24 h). |
| One per request | At most one active hold or proposal per request (partial unique index). |
| **Automatic expiry** (D-27) | A hold is active only while `expires_at > now()`. Every capacity check and slot calculation filters on this condition, so an **expired hold stops blocking at its expiry instant with no job needing to run**. |
| Clean-up | A `pg_cron` sweep (every 5 min) deletes expired hold/proposal rows and creates "Hold expired — request still pending" notifications. Clean-up affects tidiness and notifications only, **not correctness**. |
| Approve the held request | In one transaction under the capacity lock: the hold row is deleted and the appointment block inserted; the capacity check runs with the hold already removed, so the request does not compete with itself. If the hold had already expired and the capacity was taken meanwhile, approval fails with a clear message. |
| Decline / withdraw / close duplicate / expire | Hold deleted in the same transaction as the status change (trigger, D-23). |
| Other requests for a held interval | May still be approved if spare capacity remains. If approving would exceed capacity because of another request's hold, the owner must release that hold explicitly (REC-03). |
| Restricted account | Existing holds keep their expiry; new holds rejected (`can_write`). |

**Owner proposals** create a block of kind `proposal` with `expires_at = proposal_expires_at` (REC-02: default 48 h, 2–72 h, never later than the proposed start minus minimum notice). Same capacity rules as holds; a proposal replaces the request's hold.

### 6.6 Capacity-aware scheduling (D-26)

#### 6.6.1 Definitions

- **Schedule resource:** a pool of capacity. **MVP:** exactly one active resource per business, kind `general`, named "Jobs at the same time".
- **Capacity `C`:** the maximum number of active blocks that may overlap at any instant on that resource. Integer, minimum 1, maximum per REC-19 (20).
- **Defaults (D-26):** businesses whose service mode is **mobile** default to **C = 1**. Businesses with a **shop** (shop or both) configure C during onboarding (prefill per REC-16).
- **Block:** one unit of capacity over a half-open interval `[start, end)` in UTC:
  - `appointment` — for appointments in `scheduled` or `in_progress`;
  - `hold` — owner hold, active while unexpired;
  - `proposal` — owner proposal, active while unexpired.
- **Active block:** an appointment block, or a hold/proposal block with `expires_at > now()`.

#### 6.6.2 The capacity rule (hard, database-enforced)

> At every instant *t*, the number of active blocks on a resource whose interval contains *t* must be ≤ *C*.

- **Duration is respected:** intervals are `[starts_at, ends_at)`, so a 4-hour job counts during its whole 4 hours; back-to-back jobs (`end = start`) do not overlap.
- **Buffers are not part of the hard rule** (REC-14): they are a soft warning and are applied when computing public slots.
- Different businesses never affect each other.

#### 6.6.3 Enforcement under concurrency

The revision-3 exclusion constraint can only express C = 1, so it is replaced by:

1. **All writes to `schedule_blocks`** happen only inside database functions and triggers owned by the schema owner (owners and public callers have no direct write privilege — D-24).
2. A **`BEFORE INSERT OR UPDATE` trigger on `schedule_blocks`** (and the same check inside each scheduling function) performs, in order:
   1. `SELECT … FROM schedule_resources WHERE id = NEW.resource_id FOR UPDATE` — locks the resource row, **serializing every capacity-affecting write for that resource**. Concurrent transactions wait; after the first commits, the second re-reads current blocks.
   2. Computes **peak usage** over `NEW.during` among active blocks of the same resource, excluding the row being updated and any row being replaced in the same operation (e.g., the hold being converted).
   3. Rejects with a named error (`capacity_exceeded`, including the first instant at which the limit is reached) if `peak + 1 > C`.
3. **Peak usage algorithm:** usage only increases at block starts, so the maximum over `[s, e)` occurs at `s` or at the start of an overlapping block inside `(s, e)`. Candidate instants = `{s} ∪ {lower(b) : b active, b overlaps [s,e), lower(b) > s}`; usage(t) = count of active blocks with `lower(b) ≤ t < upper(b)`; peak = max over candidates. Indexed by `(resource_id, during)`.
4. **Lock order** (avoids deadlocks): every operation that touches scheduling locks **resource → booking request → appointment**, in that order. Customer withdrawal, owner approval, reschedule and cancel all follow it.
5. **Transaction time:** "active" uses `now()` (the transaction's start time). Transactions are single short function calls, so the difference from wall-clock time is negligible; a hold expiring during a transaction is treated as active for that transaction (conservative).
6. **One operation = one database function call = one transaction.** The application never composes multi-step scheduling changes from separate calls, so connection pooling in transaction mode is safe (V-9).
7. **Why not `SERIALIZABLE` isolation?** It would also be correct but requires retry handling on every caller; an explicit row lock gives deterministic behavior at small-business throughput. (Recorded as an alternative, not chosen.)

#### 6.6.4 Capacity changes

- **Increase:** always allowed; takes the resource lock.
- **Decrease:** allowed only if future peak usage (from now) never exceeds the new C; otherwise rejected with the list of over-capacity times so the owner can reschedule first (REC-15). Existing appointments are never silently invalidated.
- Changing service mode to mobile-only does not silently change C; the owner is asked (REC-17 / open question Q-5).

#### 6.6.5 Lifecycle effects on capacity

| Event | Block effect |
|---|---|
| Approve (direct or via accepted proposal) | Insert appointment block (hold/proposal removed in same transaction) |
| Manual appointment | Insert appointment block |
| Reschedule | Update block interval; capacity re-checked excluding itself |
| Start (`in_progress`) | No change |
| Complete | **Block deleted** (REC-18) — frees capacity if finished early |
| Reopen completed → scheduled | Block re-inserted with capacity check |
| Cancel / No-show | Block deleted |
| Hold placed / released / expired | Insert / delete / ignored then swept |
| Proposal created / accepted / declined / expired | Insert / converted / delete / ignored then swept |

#### 6.6.6 Soft rules (warnings the owner explicitly confirms)

Inside another job's buffer (when C = 1, or when the overlapping job uses the last unit); outside working hours; during time off; over the daily job cap; less than minimum notice; in the past.

#### 6.6.7 Public slots

A start time is offered only if, for its interval (plus buffers around existing jobs), peak usage + 1 ≤ C and all soft rules pass. The public page never reveals capacity, usage or other customers. Availability is re-checked at submission and at approval.

### 6.7 Duplicate submissions

| Case | Handling |
|---|---|
| Double-click / retry | Idempotency key; unique `(business_id, idempotency_key)`; same status link returned |
| Same contact, same vehicle description, overlapping or same-day time, another request open | Accepted, flagged "Possible duplicate"; owner may close as duplicate |
| Same contact, different vehicle | "Related request — same customer" (not a duplicate) |
| More than N open requests per contact per business | Generic rejection showing business phone (N = 3 per REC-05) |
| Spam | Rate limits, honeypot, minimum completion time (§9.4) |
| Same person, different businesses | Unrelated |

### 6.8 Expiry

| Item | Rule | Mechanism |
|---|---|---|
| Pending request | Expires when requested start passes | `pg_cron` every 5 min; treated as expired on read |
| Proposal | Expires at `proposal_expires_at`; request → `expired` | Same; capacity ignored immediately at expiry |
| Hold | Inactive at `expires_at`; request stays pending | Filter in every check; sweep for clean-up and notification |
| Quote | Sent → Expired after `valid_until` (business-local end of day) | Daily job |

### 6.9 Cancellation and rescheduling policies (D-17)

| Setting | Suggested default | Range |
|---|---|---|
| Customers can cancel online | On | On / Off |
| Cancellation cutoff | 24 h (suggestion only) | 0–168 h |
| Rescheduling cutoff (for "Ask to reschedule", REC-04) | 24 h (suggestion only) | 0–168 h |
| Policy texts | Blank with neutral examples | ≤ 1,000 chars each |

- Customer cancel: before cutoff if enabled; exactly at cutoff counts as after; frees capacity; owner notified.
- Customer withdraw (pending / time proposed): always allowed; releases any hold.
- Owner reschedule/cancel: always allowed; capacity and hard rules enforced; history kept; status page updated.
- No fees — no payments in the MVP (D-9).

### 6.10 Time zones and daylight-saving time

1. One IANA timezone per business from a US allow-list (check constraint).
2. Instants in `timestamptz`; working hours as local wall-clock times interpreted in the business zone.
3. Customer-facing times always show the zone abbreviation; public pages state the business zone and warn when the visitor's device differs.
4. Spring-forward gap times are never offered; durations are real elapsed time. Fall-back repeated times are distinct instants.
5. Capacity intervals are UTC instants, so DST transitions do not affect overlap counting; a job spanning a transition counts for its real duration.
6. Changing the business timezone keeps instants; owner confirms a list of affected future items.
7. Local-day concepts (today, daily cap, analytics periods, quote expiry) use the business zone.

### 6.11 Edge-case catalogue

| # | Scenario | Expected behavior |
|---|---|---|
| E1 | Two approvals compete for the last unit of capacity at the same moment | Resource lock serializes; exactly one succeeds; the other receives `capacity_exceeded` |
| E2 | Shop with C = 3; three 9–1 jobs booked; a 12–2 request arrives | Rejected for 12–1 (peak 3); a 1–3 request succeeds |
| E3 | C = 2; jobs 9–11 and 10–12; new job 10:30–10:45 | Rejected (peak 2 at 10:30); new job 11–11:30 accepted (peak 1 at 11) |
| E4 | Customer submits; slot fills before submission completes | Rejected with "This time was just taken", other times offered |
| E5 | Double-tap submit | One request |
| E6 | Owner holds request A on C = 1; request B overlaps | B cannot be approved for that interval unless A's hold is released (REC-03); B can be proposed elsewhere or declined |
| E7 | Hold expires while the owner is approving another overlapping request | Expired hold is not counted; approval succeeds if capacity allows |
| E8 | Owner approves held request after the hold expired and someone else booked the last unit | Approval fails clearly; owner can propose another time |
| E9 | Customer accepts a proposal after it expired | Rejected; request already expired |
| E10 | Customer withdraws while owner approves | Lock order serializes; whichever commits first wins; the other gets a state-changed message |
| E11 | Owner lowers capacity from 3 to 2 with three overlapping future jobs | Rejected with the conflicting times |
| E12 | Owner reschedules a job into a full interval | Rejected; block unchanged |
| E13 | Job completes 2 hours early | Block deleted at completion; capacity free for the rest of the interval |
| E14 | Multi-day coating (48 h) at a C = 3 shop | Consumes one unit for 48 h; other jobs continue with 2 units |
| E15 | Spring-forward gap / fall-back repeated hour | Gap never offered; repeated hour distinct instants |
| E16 | Timezone change with future appointments | Warning; instants preserved |
| E17 | Customer cancels exactly at cutoff | Not allowed; policy shown |
| E18 | Account restricted with pending requests and active holds | Owner read-only; holds expire normally; requests expire normally |
| E19 | Forwarded status link | Only that request; masked contact details |
| E20 | Owner calls a scheduling function directly via the Data API with their own session | Same authorization and capacity checks apply as from the app (§9.3, REC-20) |
| E21 | Attempt to insert a schedule block directly through the Data API | Permission denied (no write privilege) |
| E22 | Guessed or invalid token | Generic "This link isn't valid" |

---

## 7. Other workflows

### 7.1 Sign-up, activation and onboarding

Pilot: invite → sign-up → accept pilot terms. Paid launch: open sign-up. Email verification via Supabase Auth. **Activation = email verified AND business created** (D-14). At activation: pilot accounts → `pilot`; paid-launch accounts → `trialing` with `trial_ends_at = activated_at + 7 days`. During onboarding the business's general schedule resource is created with C = 1 for mobile-only businesses or the owner's chosen capacity for shops.

### 7.2 Owner handles a request

Open request → see capacity status for the requested interval ("1 of 3 jobs in use 9–1"), soft warnings, duplicates/related requests, hold status → Approve (link customer, then that customer's vehicle) · Hold · Propose · Decline (optional "Save as lead") · Close duplicate. Then the **Let the customer know** panel (template with `{status_link}`; Copy / Open in Messages / Open in Mail / Call; "Did you send it?" logs a communication only on Yes). DetailerHQ sends nothing (D-6).

### 7.3 Day of the job

Today → jobs in time order (concurrent jobs grouped) → Start → Complete with recorded amounts per line and optional payment note ("Recorded amounts are for your records. DetailerHQ doesn't process payments or calculate tax.") → follow-up rules create tasks.

### 7.4 Customers and vehicles

Manual creation; any number of vehicles per customer (D-15); archive sold vehicles; appointments and quotes reference exactly one vehicle; de-duplication within the business only.

### 7.5 Leads and quotes

Leads separate from requests (D-5): New → Contacted → Quote sent → Follow-up due → Booked / Lost. Quotes Draft → Sent → Accepted / Declined / Expired; no tax calculation (D-9). Quoted value, booked job value and recorded revenue stored separately.

### 7.6 Follow-ups and templates

Tasks with outcomes; automatic rules (quote follow-up, maintenance reminder, pending request > 24 h, hold expiring < 2 h); editable templates with placeholders; communication log entries only manual or after "Did you send it? → Yes".

### 7.7 Export, closure and deletion

See §12.6.

---

## 8. Database schema, permissions and relationships

Conceptual schema for PostgreSQL on Supabase. Final DDL is written in Phase 1 and reviewed before use.

### 8.1 Conventions

- Every **business-owned table** has `business_id uuid not null` and `unique (business_id, id)`.
- **All references between business-owned tables are composite foreign keys including `business_id`** (D-23). No polymorphic links.
- Random UUID primary keys; per-business display numbers from `business_counters`.
- `timestamptz` instants; integer cents (USD); integer minutes; E.164 US phones; `citext` emails.
- `business_id` and snapshot columns immutable (trigger).
- Status enums with transition triggers.
- Functions: `SECURITY DEFINER` only where required; always `SET search_path = ''` with fully qualified names (V-4).

### 8.2 Schemas and database roles (D-21, D-22)

| Object | Purpose |
|---|---|
| `public` schema (exposed through Data API) | Business-owned tables and owner-callable workflow functions |
| `app` schema (not exposed) | Helper functions (`is_member`, `can_write`, capacity check), trigger functions |
| `public_api` schema (not exposed) | Public booking functions used only by the restricted server path |

| Role | Privileges (everything not listed is revoked) |
|---|---|
| `anon` | **None** on any application table, view, sequence or function. Used only by Supabase Auth flows. |
| `authenticated` | `SELECT` on business-owned tables (filtered by RLS). `INSERT/UPDATE/DELETE` only on non-scheduling tables listed in §8.4. **No write privilege** on `schedule_resources`, `schedule_blocks`, `appointments`, `appointment_items`, `booking_requests`, `booking_request_items`, `activity_events`, `audit_events`, billing tables. `UPDATE (read_at)` only on `notifications`. `EXECUTE` on owner workflow functions (§8.5). |
| Restricted public role (`booking_api`, mechanism REC-13) | `EXECUTE` on `public_api` functions only. No table, view or sequence privileges. Connection limit and `statement_timeout` set. |
| `service_role` | Not used by the deployed application (unless the fallback in REC-13 is explicitly approved). Operator scripts only. |
| Schema owner (migration role) | Owns tables and definer functions. Not used by the application at runtime. |
| `PUBLIC` pseudo-role | `EXECUTE` revoked on all functions; no schema `CREATE`. |

**Default privileges (D-22):** migrations run `ALTER DEFAULT PRIVILEGES` (for the role that creates objects) to revoke all table, sequence and function privileges from `anon`, `authenticated` and `PUBLIC` in `public`, `app` and `public_api`; each migration then grants exactly the privileges in the table above. Which roles currently receive default grants on Supabase, and which role runs migrations, must be confirmed (V-1, V-2).

**Other Supabase surfaces:** GraphQL (`pg_graphql`) disabled or confirmed to obey the same grants (V-3); business tables excluded from Realtime publications; no Storage buckets.

### 8.3 Tables

**Tenancy and access**

| Table | Key columns and constraints |
|---|---|
| `businesses` | `id`; `name`; `slug citext unique` (3–40, pattern, reserved words); `phone_e164`; `email`; `timezone` (US allow-list); `service_mode enum(mobile, shop, both)`; `service_area_text`; `shop_address_*`; `accepting_requests`; `published_at`; `account_status enum(pending_activation, pilot, trialing, active, past_due, trial_expired, inactive, cancelled, suspended, closing)`; `activated_at`; `pilot_ends_at`; `trial_started_at`; `trial_ends_at`; `access_restricted_at`; `closure_requested_at`; `deletion_scheduled_for` |
| `memberships` | PK `(business_id, user_id)`; `role enum(owner)`; `unique (user_id)` in MVP |
| `pilot_invites` | `code_hash unique`, `email`, `expires_at`, `used_at` — operator only |
| `business_counters` | PK `(business_id, kind)`, `next_value` |

**Scheduling (D-26, D-27)**

| Table | Key columns and constraints |
|---|---|
| `schedule_resources` | `id`; `business_id`; `unique (business_id, id)`; `kind enum(general)` (later: `staff`, `bay`, `equipment`); `name`; `capacity smallint check (capacity between 1 and 20)` (upper bound REC-19); `active bool`; partial unique `(business_id) where kind = 'general' and active` — exactly one active general resource per business in MVP |
| `schedule_blocks` | `id`; `business_id`; `(business_id, resource_id) → schedule_resources`; `kind enum(appointment, hold, proposal)`; `during tstzrange not null` (non-empty, finite bounds, `[)`, length 15 min–72 h); `(business_id, appointment_id) → appointments` unique; `(business_id, booking_request_id) → booking_requests`; `expires_at`; `created_by`; checks: `kind = appointment` ⇔ `appointment_id not null and expires_at is null`; `kind in (hold, proposal)` ⇔ `booking_request_id not null and expires_at not null and appointment_id is null`; partial unique `(booking_request_id) where kind in (hold, proposal)`; GiST index on `(resource_id, during)` (requires `btree_gist`, V-11) or GiST on `during` + B-tree on `resource_id` |

**Configuration**

| Table | Key columns and constraints |
|---|---|
| `booking_settings` | `business_id` PK; `slot_interval_min`; `min_notice_min`; `horizon_days`; `buffer_min`; `max_jobs_per_day`; `default_hold_hours`; `proposal_expiry_hours`; `customer_can_cancel`; `cancel_cutoff_hours` (default 24, 0–168); `reschedule_cutoff_hours` (default 24, 0–168); policy texts; `intro_text`; `prep_instructions` |
| `availability_rules` | `business_id`; `weekday`; `start_time`; `end_time` |
| `time_off` | `business_id`; `during tstzrange`; `all_day`; `label` |
| `vehicle_size_classes` | `business_id`; `name`; `examples`; `sort_order`; `archived_at` |
| `service_categories` | `business_id`; `name`; `sort_order` |
| `services` | `business_id`; `(business_id, category_id) → service_categories`; `name`; `description`; `price_type enum(fixed, starting_at, quote_required)`; `base_price_cents` (required unless `quote_required`; ≥ 0); `base_duration_min` (15–4320); `is_addon`; `is_bookable`; `follow_up_after_days`; `sort_order`; `archived_at` |
| `service_prices` | `business_id`; `(business_id, service_id) → services`; `(business_id, size_class_id) → vehicle_size_classes`; `price_cents`; `duration_min`; PK `(service_id, size_class_id)` |
| `message_templates` | `business_id`; `purpose enum`; `name`; `body` (≤ 2,000) |

**Customers and vehicles**

| Table | Key columns and constraints |
|---|---|
| `customers` | `business_id`; names; `phone_e164`; `email`; check phone or email unless anonymized; `preferred_contact`; address (nullable); `notes`; `source`; `archived_at`; `anonymized_at` |
| `vehicles` | `business_id`; `(business_id, customer_id) → customers`; `unique (business_id, customer_id, id)`; year/make/model/trim/color; `(business_id, size_class_id)`; `plate`; `notes`; `archived_at` |

**Booking**

| Table | Key columns and constraints |
|---|---|
| `booking_requests` | `business_id`; `number`; `status`; `token_hash unique`; `idempotency_key` with `unique (business_id, idempotency_key)`; `requested_start/end`; `alternate_start`; `location_type`; service address; contact snapshot; **required vehicle snapshot** incl. `(business_id, vehicle_size_class_id)`; `customer_notes`; `consent_at`; `estimated_total_cents`; `estimated_duration_min`; `(business_id, customer_id) → customers`; `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)`; check approved ⇒ customer & vehicle set; `(business_id, duplicate_of_id)`; proposal fields; decline fields; `decided_at/by`; `ip_hash` |
| `booking_request_items` | Composite FKs to request and service; snapshots |
| `appointments` | `business_id`; `number`; `(business_id, customer_id)`; `vehicle_id not null` with `(business_id, customer_id, vehicle_id) → vehicles(…)`; `(business_id, booking_request_id)` unique; `(business_id, quote_id)`; `(business_id, lead_id)`; `starts_at`, `ends_at` (15 min–72 h); location; `status`; `estimated_total_cents`; `recorded_total_cents`; `payment_note`; cancellation fields; `completed_at`; `internal_notes` |
| `appointment_items` | Composite FKs; estimated and recorded prices |

**Leads, quotes, follow-ups**

| Table | Key columns and constraints |
|---|---|
| `leads` | `business_id`; `status enum(new, contacted, quote_sent, follow_up_due, booked, lost)`; `source enum(booking_page, phone, text, instagram, facebook, google, referral, walk_in, repeat, other)`; `lost_reason enum`; contact snapshot; `(business_id, customer_id) → customers`; `(business_id, customer_id, vehicle_id) → vehicles`; `vehicle_description`; `request_text`; `(business_id, booking_request_id) → booking_requests`; `next_follow_up_at`; `last_inbound_at` |
| `quotes` | `business_id`; `number`; `status enum(draft, sent, accepted, declined, expired)`; `(business_id, lead_id)`; `(business_id, customer_id)`; `(business_id, customer_id, vehicle_id) → vehicles`; `vehicle_text`; `valid_until date`; `notes`; `terms`; `subtotal_cents`; `discount_cents`; `total_cents` (= subtotal − discount ≥ 0); `token_hash unique`; `sent_at`; `decided_at`. **No tax columns.** |
| `quote_items` | `business_id`; `(business_id, quote_id)`; `(business_id, service_id)` nullable; `name`; `description`; `quantity`; `price_cents`; `duration_min` |
| `tasks` | `business_id`; `title`; `due_at`; `status enum(open, done, dismissed)`; `outcome enum`; `kind enum(manual, rule)`; `rule_key`; `dedupe_key` with `unique (business_id, dedupe_key)`; optional composite FKs to customers, leads, quotes, appointments, booking requests |
| `communications` | `business_id`; `channel enum(call, text, email, instagram, facebook, in_person, other)`; `direction enum(inbound, outbound)`; `occurred_at`; `summary`; `(business_id, template_id)`; optional composite FKs as above; at least one of `customer_id`, `lead_id` |
| `notes` | `business_id`; `body`; optional composite FKs |

**System**

| Table | Key columns and constraints |
|---|---|
| `notifications` | `business_id`; `type`; optional composite FKs; `title`; `read_at` |
| `activity_events` | `business_id`; optional composite FKs; `kind`; `from_status`; `to_status`; `actor_type`; `actor_user_id`; `metadata` (no PII); append-only |
| `audit_events` | `business_id` nullable; actor; action; entity; metadata (no PII); `ip_hash`; append-only |
| `rate_limit_events` | `key_hash`, `action`, `business_id`, `created_at`; RLS enabled, no policies; written only by `public_api` functions |
| `contact_submissions` | Marketing applications; RLS enabled, no policies; written by a `public_api` function |
| `subscriptions`, `billing_events` *(Phase 8)* | Provider IDs, status, period end; webhook idempotency; no owner write access |

### 8.4 Owner write access by table (authenticated role, under RLS)

| Direct `INSERT/UPDATE/DELETE` allowed (with RLS `can_write`) | Read-only for owners; changed only through authorized functions |
|---|---|
| `services`, `service_categories`, `service_prices`, `vehicle_size_classes`, `availability_rules`, `time_off`, `booking_settings` (except capacity-related fields — none live here), `message_templates`, `customers`, `vehicles`, `leads`, `quotes`, `quote_items`, `tasks`, `communications`, `notes`, `notifications.read_at` | `schedule_resources`, `schedule_blocks`, `appointments`, `appointment_items`, `booking_requests`, `booking_request_items`, `businesses` (profile changes via function), `memberships`, `activity_events`, `audit_events`, `business_counters`, billing tables |

Whether all request workflow changes (not just scheduling) go through functions is REC-12; this table assumes it.

### 8.5 Owner workflow functions (D-24)

Called by our server actions with the owner's session (role `authenticated`). Each is `SECURITY DEFINER`, `search_path = ''`, owned by the schema owner, `EXECUTE` granted only to `authenticated`, and each begins by checking `app.is_member(business_id)` and `app.can_write(business_id)` for the business of the target row (never a client-supplied business ID).

`approve_request`, `place_hold`, `release_hold`, `propose_time`, `retract_proposal`, `decline_request`, `close_duplicate`, `create_appointment`, `reschedule_appointment`, `cancel_appointment`, `start_appointment`, `complete_appointment`, `mark_no_show`, `reopen_appointment`, `set_capacity`, `update_business_profile`, `request_account_closure`, `cancel_account_closure`.

Because these functions are callable by the owner's own session through the Data API, a technically capable owner could call them without our UI; they would still be bound by identical authorization, state and capacity checks (E20). Whether that is acceptable is REC-20 / open question Q-6.

### 8.6 Database safeguards (D-23)

#### 8.6.1 Invariants and enforcement

| # | Invariant | Enforcement |
|---|---|---|
| I-1 | No row references a row in another business | Composite FKs everywhere |
| I-2 | `business_id` never changes | Immutable trigger |
| I-3 | A vehicle on a request/appointment/quote/lead belongs to that customer | FK `(business_id, customer_id, vehicle_id) → vehicles(business_id, customer_id, id)` |
| I-4 | Approved request ⇔ exactly one appointment with that `booking_request_id` | Created in the same function; unique index; deferred constraint trigger verifies at commit |
| I-5 | Appointment created from a request uses the request's linked customer and vehicle | Trigger check |
| I-6 | Appointment in `scheduled`/`in_progress` ⇔ exactly one appointment block with identical interval on the business's general resource | Triggers on `appointments` maintain the block; no direct block writes |
| I-7 | Hold exists only while request is `pending`; proposal only while `time_proposed` | Trigger on request status deletes blocks; check in `place_hold`/`propose_time` |
| I-8 | Active blocks never exceed resource capacity at any instant | Capacity trigger with resource lock (§6.6.3) |
| I-9 | Status changes follow allowed transitions | Transition triggers on requests, appointments, leads, quotes |
| I-10 | Archived or anonymized customers/vehicles and archived/non-bookable services cannot be newly linked | Trigger checks on insert/link |
| I-11 | Snapshots (names, prices, durations) immutable after creation | Immutable trigger |
| I-12 | Appointment interval valid (15 min–72 h, end > start) | Check constraints |
| I-13 | Restricted accounts cannot write | `can_write` in RLS policies and in every workflow function |

#### 8.6.2 Relationships

```
auth.users ─< memberships >─ businesses ─1 booking_settings
                                │
  schedule_resources (1 general in MVP) ─< schedule_blocks
                                │             ▲      ▲
  availability_rules, time_off, size classes, categories ─< services ─< service_prices
                                │             │      │
  customers ─< vehicles         │             │      │
     │                          │             │      │
     ├─< booking_requests ─< booking_request_items >─ services
     │        │  └──────── 0..1 hold/proposal block ─┘
     │        ▼ 0..1
     ├─< appointments ─< appointment_items >─ services
     │        └──────── 0..1 appointment block (while scheduled / in progress)
     ├─< leads ─< quotes ─< quote_items
     └─ tasks, communications, notes, notifications, activity_events (explicit optional FKs)
```

#### 8.6.3 Extensibility for employees, bays and resources (not built in MVP)

- `schedule_resources.kind` gains `staff`, `bay`, `equipment`; each with its own capacity (staff typically 1).
- A future `schedule_block_allocations (block_id, resource_id)` table lets one job consume several resources (e.g., one technician + one bay); the capacity trigger then runs per allocated resource, locking resources in a fixed order (by `id`) to avoid deadlocks.
- MVP blocks reference a single `resource_id`; migration to allocations is additive (one allocation per existing block).
- Employee management, permissions and assignment UI are explicitly out of scope (D-26).

### 8.7 Slot calculation

Generate local candidates within working windows (skipping DST gaps); drop those violating notice/horizon/time off/daily cap; for each candidate interval, compute peak usage including active blocks, with buffers added around existing appointment blocks; keep candidates where peak + 1 ≤ C. Return start times only.

---

## 9. Security and privacy requirements

### 9.1 Principles

1. Each business accesses only its own data — server checks, RLS, explicit grants and schema constraints are each independently sufficient for reads/writes they cover.
2. Minimum privileges for every role (D-21, D-22).
3. Public booking exposes no private business or customer information (D-25).
4. Privileged credentials never reach browser code.

### 9.2 Row Level Security

- RLS **enabled on every table** in `public`. Tables with no owner access have RLS enabled and **no** policies for `anon`/`authenticated`.
- **Not forced** (REC-21): `FORCE ROW LEVEL SECURITY` would subject our `SECURITY DEFINER` functions (which run as the table owner) to RLS and break the public and workflow functions. Compensating controls: the table-owner role is never used by the application at runtime; definer functions perform explicit membership/token checks and are covered by tests. Whether Supabase's migration role has `BYPASSRLS` must be confirmed (V-4).
- Helper `app.is_member(business_id)`: definer, stable, `search_path = ''`, compares `memberships.user_id` with `(select auth.uid())` (evaluated once per statement). Index `memberships (user_id, business_id)`.
- Helper `app.can_write(business_id)` per account state (§12.4).
- Policies per command for every owner-writable table:
  - `SELECT USING (app.is_member(business_id))`
  - `INSERT WITH CHECK (app.is_member(business_id) AND app.can_write(business_id))`
  - `UPDATE USING (app.is_member(business_id)) WITH CHECK (app.is_member(business_id) AND app.can_write(business_id))`
  - `DELETE USING (app.is_member(business_id) AND app.can_write(business_id))` where deletion is permitted
- Read-only tables (§8.4) have only a `SELECT` policy and no write grants.
- Views `security_invoker = true`. Business tables not in Realtime. CI catalog checks (§13.2).

### 9.3 Authorization for every operation

| Operation | Server check | Database protection |
|---|---|---|
| Read owner data | Session → membership | RLS `SELECT` |
| Create/update/delete non-scheduling records | Session; Zod validation; `business_id` from membership | Grants + RLS + composite FKs + triggers |
| Scheduling and workflow operations (approve, hold, propose, reschedule, cancel, complete, capacity) | Session; validation; expected current state | Definer function: membership + `can_write`; lock order; capacity trigger; transition triggers; invariants I-1–I-13 |
| Export, analytics | Session | RLS (user session) |
| Account closure | Session + re-authentication + typed confirmation | Definer function; audit |
| Public: booking page, slots, submit, inquiry | Validation, rate limits, honeypot, timing, idempotency | `public_api` functions via restricted role (D-21); allow-listed outputs (D-25) |
| Token actions (status, accept/decline proposal, withdraw, cancel, view quote) | Rate limit; SHA-256 of token | `public_api` function scoped to the one matching row; state/cutoff checks; capacity trigger for accept |
| Scheduled jobs | — | `pg_cron` inside database |
| Billing webhook (Phase 8) | Signature, idempotency | Server-only privileged path |

Another business's record always yields 404.

### 9.4 Public booking endpoint (D-21, D-25)

**Flow:** browser → Next.js server action / route handler → validation and abuse checks → `public_api` function call over a restricted database connection → allow-listed JSON → browser. The browser never talks to the database for booking.

**Mechanism (REC-13, pending verification V-8/V-9):** a dedicated Postgres login role `booking_api` with `EXECUTE` on `public_api` functions only, used by our server through Supabase's connection pooler (transaction mode). The `public_api` schema is not exposed through the Data API, so the public functions cannot be called with the browser-visible key.

**Fallback (requires explicit approval; conflicts with "minimum required privileges" because the credential is broader):** server-only module calling the same functions through the Data API with the service-role/secret key, with functions `EXECUTE`-granted to `service_role` only and the module offering only named function calls.

**Validation:** allowed fields only; body ≤ 16 KB; length limits; US phone → E.164; email syntax; at least one of phone/email; services and size class must belong to the business, be active and bookable; requested start must be a currently computed slot; consent required; plain-text storage.

**No private data exposed (D-25):**
- Booking page and slot functions return only public business fields, bookable services and start times — never customers, appointments, capacity, usage or reasons a time is unavailable.
- Submit returns only the request number and status link.
- Status and quote functions return only the one row matching the token hash, with masked contact details (REC-10).
- Generic errors that never confirm other requests or token existence.
- Token pages: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.

**Abuse protections (limits per REC-05):** per-IP-hash and per-business submission limits; token-action and slot-lookup limits; honeypot; signed minimum completion time; idempotency; open-request cap; optional free bot challenge only if abuse appears (requires approval). Client IP taken from the hosting platform's trusted header (V-16); hashed with a server secret; kept 30 days.

### 9.5 Secrets and credentials

| Credential | Where it may exist |
|---|---|
| Supabase URL and anon/publishable key | Browser allowed (Auth only); `anon` has no data privileges |
| `booking_api` connection string | Server-only environment variable, marked sensitive; only in modules guarded by `server-only` |
| Service-role/secret key | **Never** in browser code or `NEXT_PUBLIC_*`; not configured in the deployed app unless the REC-13 fallback is approved |
| IP-hash salt | Server-only |

CI scans the production client bundle for secret values and variable names; `.env*` git-ignored; rotation runbook for each credential. Vercel environment variable handling to confirm (V-14, V-15).

### 9.6 Authentication

Supabase Auth email + password; email verification required for activation; server-side sessions (Supabase SSR helpers; cookie attributes to confirm, V-13); password policy and leaked-password protection if available (V-12); invite-only sign-up mechanism to confirm (V-12); re-authentication for closure and email change; operator MFA.

### 9.7 Web security baseline

HTTPS/HSTS; Content Security Policy; Server Actions origin checks (V-17); output escaping; Dependabot; lockfile; security headers.

### 9.8 Privacy

Data collected about end customers: name, phone and/or email, preferred contact, service address (mobile jobs), vehicle year/make/model/color/size, optional plate, notes. Not collected: VIN, date of birth, license numbers, payment data, location tracking, marketing consent. No customer accounts, no third-party trackers, no PII in logs. US law considerations (CAN-SPAM, future TCPA, state privacy laws) for legal review.

### 9.9 Auditing and operations

Audit events for sign-in, request decisions, holds, capacity changes, cancellations, reschedules, exports, deletions, account state changes, operator access. Tested backup restore before pilots use real data.

---

## 10. Notifications

In-app only (D-7): new request; possible duplicate/related; new inquiry; proposal accepted/declined; withdrawn/cancelled; reschedule asked (if REC-04); **hold expired**; proposal/request expired; quote expired; unusual submission volume; pilot/trial banner. Polling every 60 s while visible. No email/SMS/push.

---

## 11. Analytics definitions

Rules: recorded data only; business timezone; visible definitions; rates need a minimum sample (REC-11: ≥ 5); no causal claims; no sample data in real accounts.

| Term | Definition |
|---|---|
| Quoted value | Σ `total_cents` of quotes sent in period |
| Booked job value | Σ `estimated_total_cents` of appointments starting in period with status Scheduled, In progress or Completed |
| Recorded revenue | Σ `recorded_total_cents` of Completed appointments starting in period (owner-entered; not verified payments; tax not separated) |

Metrics: requests received; median first response time; request outcomes; request-to-booking rate; holds placed and holds whose request was approved (sequence only); appointments completed; average recorded job value; cancellations and no-shows; quote acceptance rate; leads by source/status; lead-to-booked rate; follow-up activity; leads booked after a logged follow-up (with non-causation note); top services; new vs returning customers; **peak concurrent jobs per day** (from recorded appointments, informational). Each has a reference SQL query in tests.

---

## 12. Pricing, pilot, trial, retention, closure and deletion

### 12.1 Pricing

| Stage | Offer | Status |
|---|---|---|
| Pilot | $25 for the first month, early-access offer, collected manually | D-11 |
| After pilot's first month | **Open** (Q-1) | — |
| Public | $49/month target, subject to validation; not published until validated | D-12 |

### 12.2 Pilot terms

Duration, $25 first-month price and collection method, what happens after the first month, features may change, no SLA, data ownership, export, retention position, end-of-pilot options, not a free trial.

### 12.3 Activation and 7-day free trial (D-14)

Activation = email verified AND business created. Trial = `activated_at` + 7 days exactly. No card required (preference). Disclosed everywhere it's offered. Pilot accounts never enter `trialing`. Built and tested in Phase 8 before the public paid launch.

### 12.4 Account states and access

| State | Dashboard | Booking page | Status links | Export |
|---|---|---|---|---|
| `pending_activation` | Onboarding only | Not published | — | — |
| `pilot`, `trialing`, `active` | Full | Accepting | Full | ✅ |
| `past_due` (grace per REC-09) | Full + banner | Accepting | Full | ✅ |
| `cancelled` (until period end) | Full + banner | Accepting | Full | ✅ |
| `trial_expired`, `inactive` | Read-only | Not accepting; contact shown | Status shown; withdraw/cancel allowed; accept-proposal disabled | ✅ |
| `closing` | Read-only; can cancel closure | Offline | Generic | ✅ |
| `suspended` | Blocked except export & support | Offline | Generic | On request |

**No business or customer data is deleted because a trial ends (D-18).** Read-only enforced by server, RLS `can_write`, and every workflow function.

### 12.5 Retention schedule (REC-06, REC-08 — not approved)

Restricted accounts kept 180 days after access ends with 30/7-day notices; closed unlinked requests 12 months; notifications 90 days; audit 12 months; hashed IPs 30 days; contact applications 12 months; backups per provider. **Automated deletion stays disabled** until the policy is approved, legally reviewed, disclosed, and notices can be delivered (D-18).

### 12.6 Account closure and deletion

Export always available. Close account → `closing`, booking page offline, grace period (REC-07: 30 days) with cancel option → hard deletion of all business-owned rows (including schedule resources and blocks) → auth user deleted if no other memberships → PII-free audit record. Customer deletion by owner: PII removed, appointments anonymized. Verification query confirms zero rows remain for that business.

### 12.7 Documentation required before public launch

Privacy Policy; Terms (trial, subscription, account states, closure, deletion); service-provider terms if advised; runbooks (deletion, restore, credential rotation, incidents); subscription tax decision; pilot terms (earlier, before pilots).

---

## 13. Testing and acceptance criteria

### 13.1 Test strategy

| Level | Tooling | Scope |
|---|---|---|
| Unit | Vitest | Slots, DST, pricing, transitions, cutoffs, expiry math, duplicate rules, peak-usage algorithm (pure version), templates, metrics |
| Database | pgTAP (Supabase CLI) | Grants, RLS, invariants I-1–I-13, triggers, function outputs, capacity checks (single-session), scheduled jobs |
| Data API isolation | Vitest + `supabase-js` against local Supabase | RLS/grant matrix through the Data API with real JWTs and the publishable key |
| **Concurrency** | Vitest with multiple direct Postgres connections to the local database | Parallel capacity competition, lock order, hold expiry races |
| App isolation | Playwright | Cross-business IDs → 404 on every route/action |
| End-to-end | Playwright at 375/768/1280 px | Booking flows, holds, capacity, edge cases E1–E22 where UI-reachable |
| Accessibility | axe-core + manual keyboard and screen reader passes | Zero serious/critical issues |
| Performance | Lighthouse CI | Booking page LCP < 2.5 s (mobile, simulated 4G); home ≥ 90 |
| Security | Dependabot, `npm audit`, bundle secret scan, catalog checks, Supabase advisor, OWASP ASVS L1 subset review | Every PR / release |
| Copy | String lint for banned claims ("sent" for messages, "charged", "free trial" during pilot, "AI", tax claims) | Every PR |

### 13.2 Permission and RLS test matrix (D-21, D-22, D-24)

**Identities:** owner A, owner B, signed-in user with no business (U), `anon`, restricted public role (`booking_api`).

**For every table** (pgTAP with `set role` + JWT claims, **and** through the Data API):

| Attempt | Owner A | Owner B | U | anon | booking_api |
|---|---|---|---|---|---|
| `SELECT` A's rows | ✅ | 0 rows | 0 rows | denied | denied |
| `INSERT` with `business_id = A` | ✅ only on owner-writable tables | ❌ | ❌ | denied | denied |
| `INSERT` own row referencing A's customer/vehicle/service/request | — | ❌ (FK/RLS) | ❌ | denied | denied |
| `UPDATE` A's row | ✅ only owner-writable tables | 0 rows | 0 rows | denied | denied |
| `UPDATE` setting `business_id` or snapshot columns | ❌ trigger | ❌ | — | denied | denied |
| `DELETE` A's row | ✅ only where allowed | 0 rows | 0 rows | denied | denied |
| Any write to `schedule_blocks`, `schedule_resources`, `appointments`, `booking_requests` | **denied** (D-24) | denied | denied | denied | denied |
| `EXECUTE` owner workflow function on A's records | ✅ | ❌ (membership check → not found) | ❌ | denied | denied |
| `EXECUTE` `public_api` functions | denied | denied | denied | denied | ✅ |

**Catalog tests (CI, every push):**
- Every table in `public` has RLS enabled; every grant to `authenticated` has a matching policy.
- `anon` and `PUBLIC` hold **no** privileges on any table, sequence or function in `public`, `app`, `public_api` (via `has_table_privilege` / `has_function_privilege` over the catalog).
- A test migration creates a new table and function and asserts no privileges were granted by default (D-22).
- Every `SECURITY DEFINER` function has `search_path` set.
- The list of tables equals the list covered by the matrix (new tables without tests fail CI).
- `booking_api` has no table privileges and cannot execute owner workflow functions.

### 13.3 Capacity and concurrency tests (D-26, D-27)

- Capacity 1, 2 and 3; overlapping intervals of different durations; E2, E3 examples; adjacent intervals allowed.
- Holds and proposals count toward capacity; a hold exceeding capacity is rejected.
- **Expired holds/proposals are ignored** immediately at expiry, before any sweep runs.
- **Concurrent competition:** N parallel transactions (N ≥ 5) each try to take the last unit → exactly one commits; others get `capacity_exceeded`; final peak ≤ C.
- Parallel approve + withdraw on the same request, and parallel approve on two requests → no deadlock (lock order), consistent final state.
- Hold expiring between two competing transactions → result consistent with transaction-time evaluation.
- Reschedule excludes the appointment's own block; cancel/complete/no-show free capacity; reopen re-checks.
- Capacity decrease rejected when future peak > new C; increase always accepted.
- DST-spanning intervals counted by real duration.
- Invariants I-4, I-6, I-7 verified after every concurrency test.

### 13.4 Acceptance criteria

All criteria pass at 375, 768 and 1280 px and meet `DESIGN_SYSTEM.md` §12. 🧪 = automated.

**Accounts and onboarding**
- [ ] Invite-only sign-up; Supabase Auth flows; no password data in our schema. 🧪
- [ ] Activation only when email verified **and** business created. 🧪
- [ ] Mobile-only businesses get capacity 1 by default; shops must set capacity during onboarding. 🧪
- [ ] Policies step pre-fills 24 h as a suggestion. 🧪
- [ ] No service price the owner didn't enter. 🧪

**Public booking (D-13, D-21, D-25)**
- [ ] No customer account required at any step. 🧪
- [ ] One vehicle per request, required. 🧪
- [ ] Browser never calls the database for public booking; public functions not callable via the Data API with the publishable key. 🧪
- [ ] Responses contain only allow-listed fields; no capacity, usage or other-customer data. 🧪
- [ ] Validation, rate limits, honeypot, timing and open-request cap enforced with generic messages. 🧪
- [ ] Confirmation says "not confirmed yet" with status link.

**Workflow and scheduling (D-23, D-24, D-26, D-27)**
- [ ] Owners cannot write schedule or appointment data directly; all changes via workflow functions. 🧪
- [ ] Approve links customer and that customer's vehicle within the business; idempotent. 🧪
- [ ] Capacity never exceeded under sequential and concurrent operations (§13.3). 🧪
- [ ] Holds: owner-only, within limits, respect capacity, expire automatically, never block after expiry, released on decision/withdrawal. 🧪
- [ ] Proposals: same capacity and expiry rules; accept converts atomically. 🧪
- [ ] Calendar shows concurrent jobs and capacity usage correctly.
- [ ] Capacity changes enforce §6.6.4. 🧪

**Duplicates, expiry, cancellation, rescheduling**
- [ ] Idempotent resubmission; possible-duplicate vs related-request flags; open-request cap with generic message. 🧪
- [ ] Pending requests expire at requested start; proposals at their expiry; holds become inactive at `expires_at`. 🧪
- [ ] Customer cancel respects the owner's setting and cutoff (exactly at cutoff is after) and frees capacity. 🧪
- [ ] Owner reschedule enforces capacity and hard rules, records the previous time, updates the status page. 🧪
- [ ] *(If REC-04 approved)* "Ask to reschedule" respects the cutoff, notifies the owner, and doesn't change the appointment. 🧪

**Time zones**
- [ ] Correct display and slots in Eastern, Central, Mountain, Arizona, Pacific, Alaska and Hawaii. 🧪
- [ ] Spring-forward gap never offered; fall-back instants distinct and labelled; capacity counts real duration across transitions. 🧪
- [ ] Timezone change preserves instants and warns. 🧪

**Customers and vehicles**
- [ ] A customer can have multiple vehicles; appointments and quotes reference exactly one. 🧪
- [ ] A vehicle not belonging to the chosen customer cannot be linked (DB). 🧪
- [ ] Search within 300 ms for 5,000 customers; duplicate suggestions within the business only. 🧪
- [ ] Delete anonymizes appointments and removes PII. 🧪

**Leads, quotes, follow-ups, communications**
- [ ] Inquiries create leads, never requests. 🧪
- [ ] Lead status automation with recorded manual override. 🧪
- [ ] Quotes: per-business numbering, totals in cents, no tax computation, auto-expiry. 🧪
- [ ] Quoted, booked and recorded values stored separately. 🧪
- [ ] Templates render; missing placeholders block copying; communications logged only after confirmation; nothing sent automatically. 🧪

**Notifications and analytics**
- [ ] Each §10 event produces one notification for the right business only (including hold expiry). 🧪
- [ ] Each metric matches its reference SQL; thresholds; non-causation note; no sample data in real accounts. 🧪

**Security**
- [ ] §13.2 matrix and catalog tests pass for every table. 🧪
- [ ] Bundle scan finds no service-role key, `booking_api` credential or server-only variable. 🧪
- [ ] Token pages send `no-store`, `no-referrer`, `noindex`. 🧪

**Pilot, trial, retention, closure (D-14, D-18)**
- [ ] Pilot accounts never show "free trial". 🧪
- [ ] *(Phase 8)* Trial ends exactly 7 days after activation; restricted state read-only at the DB; **no rows deleted**; subscribing restores access. 🧪
- [ ] Closure grace and deletion leave zero rows for that business; deletion jobs disabled until policy approved. 🧪

---

## 14. Architecture, budget and verification requirements

### 14.1 Recommended architecture (REC — confirms nothing new beyond D-decisions)

| Layer | Choice |
|---|---|
| App | Next.js App Router, TypeScript, on Vercel (D-20) |
| Database & Auth | Supabase Postgres + Supabase Auth (D-2, D-20); `pg_cron` |
| Owner reads | `supabase-js` with the owner's session (Data API, RLS) |
| Owner non-scheduling writes | `supabase-js` with the owner's session (grants + RLS + triggers) |
| Owner scheduling/workflow changes | Server actions → owner workflow functions (D-24) |
| Public booking | Server actions → `public_api` functions via restricted role (D-21; mechanism REC-13) |
| Capacity | `schedule_resources` + `schedule_blocks` + locked capacity trigger (D-26, D-27) |
| Migrations / tests | Supabase CLI SQL migrations; pgTAP; Vitest; Playwright |
| No | Storage, Realtime for business tables, GraphQL (unless verified safe), customer messaging, payments |

### 14.2 Estimated monthly cost (unverified)

Development $0; pilot ≈ $45 (Vercel Pro ~$20 + Supabase Pro ~$25); public launch ≈ $45–47 plus billing percentage fees. A custom email provider may be needed before the pilot (V-12) — free tiers are expected but require registration and approval.

### 14.3 Documentation to check before implementation (none verified yet)

| # | Topic | What must be confirmed | Where to look | Blocks |
|---|---|---|---|---|
| **V-1** | Database roles | Roles present in a Supabase project (`anon`, `authenticated`, `service_role`, `authenticator`, `postgres`, others); attributes (`BYPASSRLS`, `LOGIN`); which role runs migrations and owns objects | Supabase docs: Postgres roles; database configuration; CLI migrations | Phase 1 |
| **V-2** | Default privileges | Which default grants Supabase applies on new tables/functions/sequences in `public` (to `anon`, `authenticated`, `service_role`); how to revoke safely without breaking Supabase internals; PostgreSQL default `EXECUTE` to `PUBLIC` | Supabase docs: securing the Data API / hardening; PostgreSQL docs: `ALTER DEFAULT PRIVILEGES`, `GRANT`, function privileges | Phase 1 |
| **V-3** | Exposed surfaces | How to set exposed schemas; whether GraphQL is enabled by default and obeys grants/RLS; Realtime publication defaults | Supabase docs: API settings, GraphQL, Realtime | Phase 1 |
| **V-4** | RLS & function security | RLS semantics for table owners and `FORCE`; current Supabase guidance on `SECURITY DEFINER` functions, `search_path`, placing definer functions outside exposed schemas; `auth.uid()` performance pattern; database linter rules | Supabase docs: Row Level Security, database functions, database advisors; PostgreSQL docs: `CREATE POLICY`, `ALTER TABLE … FORCE ROW LEVEL SECURITY`, `CREATE FUNCTION` | Phase 1 |
| **V-5** | API keys | Current key types (legacy anon/service_role vs publishable/secret), scopes, rotation | Supabase docs: API keys | Phase 1 |
| **V-6** | Data API transactions | Each RPC call runs in one transaction; error propagation of `RAISE` with custom codes; request limits | Supabase docs: Data API / PostgREST functions; PostgREST docs | Phase 1 |
| **V-7** | Server-side Auth | `@supabase/ssr` usage with Next.js App Router; how the user's JWT reaches the database from server actions | Supabase docs: server-side auth for Next.js | Phase 2 |
| **V-8** | Custom login role | Creating a `LOGIN` role with a password on Supabase; whether it can connect through the pooler; username format; connection limits | Supabase docs: Postgres roles, connecting to your database | Phase 1 (REC-13 decision) |
| **V-9** | Connection pooling | Supavisor transaction vs session mode; prepared statements; connection reuse from Vercel serverless/fluid functions; recommended driver settings | Supabase docs: connection pooler; Vercel docs: functions and database connections | Phase 3 |
| **V-10** | `pg_cron` | Availability, minimum schedule interval, permissions, monitoring | Supabase docs: Cron / `pg_cron` extension | Phase 1 |
| **V-11** | Extensions | `btree_gist`, `citext`, `pg_trgm` availability and schema placement | Supabase docs: extensions | Phase 1 |
| **V-12** | Email verification & auth email | Default email sender restrictions and rate limits (whether it can reach non-team addresses); custom SMTP requirements; confirmation and recovery flows; disabling public sign-ups and invite flow; password strength and leaked-password protection availability by plan | Supabase docs: Auth email, SMTP, rate limits, password security, user management | **Before pilot** |
| **V-13** | Session cookies | Cookie attributes set by Supabase SSR helpers (HttpOnly, SameSite, lifetime) and implications for XSS exposure of tokens | Supabase docs: SSR cookies | Phase 2 |
| **V-14** | Vercel environment variables | Sensitive variable handling, per-environment scoping, which variables are exposed to the client build | Vercel docs: environment variables; Next.js docs: environment variables | Phase 2 |
| **V-15** | `server-only` boundaries | Preventing server modules from client bundles | Next.js docs: server and client components | Phase 2 |
| **V-16** | Client IP | Which request header Vercel guarantees for the client IP and whether it can be spoofed | Vercel docs: request headers | Phase 3 |
| **V-17** | Server Actions security | Origin/CSRF checks and configuration for our Next.js version | Next.js docs: Server Actions security | Phase 2 |
| **V-18** | Concurrency semantics | `SELECT … FOR UPDATE` behavior under READ COMMITTED (re-check after lock wait), deadlock detection, triggers firing order with constraints | PostgreSQL docs: explicit locking, transaction isolation, triggers | Phase 1 |
| **V-19** | Testing toolchain | `supabase test db` with pgTAP; running the local stack in GitHub Actions; minutes for the repo's visibility | Supabase CLI docs; GitHub Actions billing docs | Phase 1 |
| **V-20** | Plans and pricing | Vercel Hobby commercial-use terms and Pro price; Supabase Free limits (pausing, backups) and Pro price/backup retention; spend caps | Vercel and Supabase pricing/terms pages | Before pilot |
| **V-21** | Date/time library | DST correctness for US zones in the chosen library | Library docs | Phase 3 |

### 14.4 Repository structure (proposed)

```
/app            routes
/src/domain     pure logic (slots, DST, pricing, transitions, peak usage)
/src/data       server-only data access (owner session; public restricted role)
/src/ui         design-system components and tokens
/src/config     brand configuration
/supabase       migrations, grants, policies, functions, pgTAP tests, dev seed
/tests          unit, api-isolation, concurrency, e2e
/docs           plans, decisions, verification notes, legal drafts, runbooks
```

---

## 15. Customer acquisition plan

1. **Target:** independent mobile detailers and small shops in 1–3 US metro areas; 3–5 pilots including mobile detailers (D-11).
2. **Prospecting:** Google Business Profiles, Instagram/Facebook business pages, local car communities — manually. No scraping, automated DMs or bought lists.
3. **Outreach:** individually written emails and social messages; ask for a 20-minute conversation; no claims about unbuilt features; CAN-SPAM compliant email (accurate sender, physical address, opt-out); one follow-up maximum.
4. **Discovery call:** booking process, missed requests, quoting, follow-up habits, tools and spend, mobile vs shop needs.
5. **Pilot offer:** $25 for the first month under written early-access terms; onboard together; weekly 15-minute check-ins.
6. **Price validation:** ask each pilot about continuing at $49/month (D-12); record answers verbatim.
7. **Funnel tracking (manual):** contacted → replied → call → pilot → active at 4 weeks → paid → willing at validated price.
8. **Expansion gate:** ≥ 3 paying pilots and ≥ 2 willing at the validated price. Add one discovery question: **"How many vehicles can you work on at the same time, and does that change by day?"** to validate the capacity model.

---

## 16. Phased implementation roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Verification (documentation only, no code)** | Work through V-1–V-21; record findings with dates and links in `docs/verification/`; resolve REC-13 mechanism, REC-21, email provider need (V-12); user decisions on open questions | Every V-item marked confirmed / changed / blocked; plan updated (revision 5 if anything changes) |
| **1. Database foundation (recommended first implementation phase)** | Supabase CLI project; schemas; default-privilege revocations and explicit grants; all tables with composite FKs; invariants and triggers; `schedule_resources`/`schedule_blocks` with capacity trigger and lock order; owner workflow functions; `public_api` functions; restricted role; `pg_cron` jobs; pgTAP + Data API matrix; catalog checks; concurrency tests | §13.2 and §13.3 green; no application UI yet |
| **2. Auth, activation & app shell** | Supabase Auth, invite-only sign-up, activation, server-side sessions, design tokens, core components, dashboard shell | Sign-in → shell at 3 widths; bundle secret scan green |
| **3. Setup & public booking** | Onboarding (capacity, hours, policies, services), slot engine, public booking/inquiry through restricted server path, status page, abuse controls | Real request submitted from a phone; public isolation tests green |
| **4. Booking workflow & calendar** | Inbox, approve/link, holds, proposals, decline, duplicates, appointments, capacity-aware calendar, cancel, reschedule | E1–E22 demonstrated/tested |
| **5. Customers & vehicles** | CRUD, multiple vehicles, search, history, archive, anonymize | — |
| **6. Leads, quotes, follow-ups** | Leads, quotes, communications, templates, tasks | — |
| **7. Analytics, settings, data; hardening; pilot** | Metrics, export, closure request (deletion disabled), security review, accessibility, marketing (early access), legal drafts, pilot terms | 3–5 pilots onboarded |
| **8. Paid-launch readiness** | Billing, subscription tax, 7-day trial, account states, retention policy and notices, email provider, legal review, public sign-up, name and domain | Phase 8 acceptance criteria pass; legal and accountant sign-off |

---

## 17. Decisions, recommendations, open questions and risks

### 17.1 Approved decisions

| # | Decision | Source |
|---|---|---|
| D-1 | United States only | Rev 2 |
| D-2 | Supabase Auth; RLS on business-owned tables | Rev 2 |
| D-3 | Requests require owner approval or customer acceptance of an owner proposal | Rev 2 |
| D-4 | Business-defined services, prices, durations, bookability; no universal prices | Rev 2 |
| D-5 | Leads and quotes separate from booking requests | Rev 2 |
| D-6 | No automated customer messaging in MVP; templates + owner's own apps | Rev 2 |
| D-7 | In-app notifications only in MVP | Rev 2 |
| D-8 | CSV import later unless pilots prove essential | Rev 2 |
| D-9 | No customer payments, deposits or tax calculation in MVP | Rev 2–3 |
| D-10 | Subscription billing and tax handling before public paid launch | Rev 3 |
| D-11 | Pilot: 3–5 businesses incl. mobile detailers; $25 first month, early-access offer | Rev 3 |
| D-12 | Public subscription target $49/month, subject to validation | Rev 3 |
| D-13 | Booking requests without customer accounts | Rev 3 |
| D-14 | 7-day free trial starts after email verification and activation; no card (preference) | Rev 3 |
| D-15 | Multiple vehicles per customer; one specific vehicle per request | Rev 3 |
| D-16 | Pending requests don't block availability; optional owner-placed temporary holds | Rev 3 |
| D-17 | Owner-configurable cancellation/rescheduling policies; 24 h suggested default | Rev 3 |
| D-18 | No automatic deletion when a trial ends; retention/closure/deletion documented before public launch | Rev 3 |
| D-19 | Provisional, configurable branding; no spending | Rev 2 |
| D-20 | Next.js + Supabase on Vercel; ≈ $45/month target | Rev 2 |
| **D-21** | Replace direct public booking database access with a restricted server-side public booking endpoint using the minimum required privileges *(user's label "P-1")* | Rev 4 |
| **D-22** | Explicit database permissions; disable unnecessary default privileges and grant only what each role requires *(user's "P-2")* | Rev 4 |
| **D-23** | Database safeguards against invalid business, customer, vehicle, appointment and status relationships *(user's "P-3")* | Rev 4 |
| **D-24** | Owners can only read their own schedule; appointment and scheduling changes use authorized server-side operations and database protections *(user's "P-4")* | Rev 4 |
| **D-25** | Public booking must not expose private business or customer information *(user's "R-1")* | Rev 4 |
| **D-26** | Capacity-aware scheduling: mobile defaults to 1 simultaneous job; shops configure capacity; confirmed appointments and active holds never exceed capacity; duration-aware overlap; enforced in the database under concurrency; extensible to employees/bays/resources without building employee management | Rev 4 |
| **D-27** | Holds expire automatically by timestamp; expired holds don't block; holds cannot bypass capacity; safe handling of expiry and concurrent bookings | Rev 4 |

### 17.2 Recommendations (not approved)

| # | Recommendation | Essential before pilot? |
|---|---|---|
| REC-01 | Hold duration 2–72 h, default 24 h, ending by requested start | Needed in some form (D-27 requires expiry); values tunable |
| REC-02 | Proposal expiry default 48 h (2–72 h) | Same |
| REC-03 | Owner must explicitly release another request's hold when it blocks capacity | Recommended |
| REC-04 | Customer "Ask to reschedule" (request only) | No — can wait for pilot feedback |
| REC-05 | Max 3 open requests per contact per business; rate-limit values in §9.4 | Some limits essential; values tunable |
| REC-06 | Restricted accounts retained 180 days with 30/7-day notices | Before public launch |
| REC-07 | Closure grace period 30 days | Before public launch |
| REC-08 | Retention periods (§12.5) | Before public launch; pilot terms need a stated position |
| REC-09 | `past_due` grace 7 days | Phase 8 |
| REC-10 | Masked contact details on status pages (implements D-25) | Strongly recommended |
| REC-11 | Rates shown only with ≥ 5 items | No |
| REC-12 | All request workflow changes (not only scheduling) through functions; no direct owner writes to requests | Recommended |
| REC-13 | Mechanism for D-21: dedicated `booking_api` login role via pooler; fallback service-role module only with approval | Mechanism must be chosen in Phase 0 |
| REC-14 | Buffers are soft warnings, not part of the capacity rule | Recommended |
| REC-15 | Capacity decreases rejected when future usage exceeds the new capacity | Recommended (protects D-26) |
| REC-16 | Shops' capacity prefilled with 1 and explicitly confirmed in onboarding | Recommended |
| REC-17 | Mobile-only businesses may raise capacity (e.g., two vans) in settings | Open (Q-5) |
| REC-18 | Completed appointments release capacity | Recommended |
| REC-19 | Maximum capacity 20 | Tunable |
| REC-20 | Accept that owner workflow functions are callable with the owner's own session outside our UI, since they enforce identical checks | Decision needed (Q-6) |
| REC-21 | RLS enabled but not forced, with definer functions doing explicit checks | Needed; confirm after V-4 |
| REC-22 | Row lock on the resource (not SERIALIZABLE) for capacity enforcement | Recommended |
| REC-23 | Peak-usage algorithm in §6.6.3 | Recommended |
| REC-24 | Remove the revision-3 exclusion constraint | Follows from D-26 |

### 17.3 Label history (traceability)

| Revision 3 / review label | Revision 4 |
|---|---|
| Old P-1 (hold durations) | REC-01 |
| Old P-2 (proposal expiry) | REC-02 |
| Old P-3 (explicit release) | REC-03 |
| Old P-4 (ask to reschedule) | REC-04 |
| Old P-5 (caps, rate limits) | REC-05 |
| Old P-6, P-7, P-8 (retention, closure, periods) | REC-06, REC-07, REC-08 |
| Old P-9 (past_due grace) | REC-09 |
| Old P-10 (`booking_api` role) | Goal approved as **D-21**; mechanism remains REC-13 |
| Old P-11 (masking) | REC-10 (implements D-25) |
| Old P-12 (analytics threshold) | REC-11 |
| Review R-1 (service-role Option B) | Not recommended as default (conflicts with D-21 minimum privileges); fallback inside REC-13 |
| Review R-2 (revoke defaults) | Approved as **D-22** |
| Review R-3 (workflow via functions) | Scheduling part approved as **D-24**; remainder REC-12 |
| Review R-4 (read-only schedule; purge trigger) | Read-only approved as **D-24**; purge trigger superseded by timestamp-based expiry (D-27) |
| Review R-5 (single-session appointments) | **Withdrawn** — superseded by D-26 |
| User's revision-4 labels "P-1", "P-2", "P-3", "P-4", "R-1" | D-21, D-22, D-23, D-24, D-25 (interpreted by their wording, not by the old numbers) |

### 17.4 Open questions

1. **Q-1:** What do pilots pay after the $25 first month?
2. **Q-2:** How is the $25 collected (requires registering a payment provider — approval) and how is it taxed (accountant)?
3. **Q-3:** Domain timing for stable booking links.
4. **Q-4:** Approve or modify REC-01–REC-24.
5. **Q-5:** May mobile-only businesses set capacity above 1 (REC-17)?
6. **Q-6:** Is REC-20 acceptable, or must scheduling functions be callable only from our server (which would move some authorization out of the database)?
7. **Q-7:** If V-12 shows the default auth email sender cannot reach pilot owners, approve registering an email provider (free tier) before the pilot?
8. **Q-8:** If V-8/V-9 show the `booking_api` role is not workable, approve the service-role fallback in REC-13 or choose another mechanism?
9. **Q-9:** Which metro areas and first prospects?
10. **Q-10:** Create a `main` branch and open a pull request for the planning documents?

### 17.5 Risks

| Risk | Mitigation |
|---|---|
| Default privileges or exposed surfaces leak data | D-22 revocations; catalog tests; V-1–V-3 |
| Definer functions bypass RLS incorrectly | Explicit checks, `search_path = ''`, per-function tests, linter |
| Capacity check bug → overbooking | Single locked trigger path; concurrency suite; invariant checks |
| Lock contention or deadlocks | Fixed lock order; short single-call transactions; deadlock tests |
| `booking_api` role not feasible (V-8) | Q-8 fallback decision |
| Pooler/transaction mismatch (V-9) | One call = one transaction design |
| Auth email blocked for pilots (V-12) | Q-7 |
| Customers miss status changes | Status link everywhere; owner prompted to contact |
| Owners miss requests (in-app only) | Today screen, badges, tasks; owner email post-MVP |
| Multi-resource needs (technician + bay) arrive early | Allocation table extension path (§8.6.3) |
| Timezone/DST errors | UTC storage, allow-listed zones, tests |
| $49 not validated | Pilot validation before publishing |
| Unexpected deletion | No deletion at trial end; deletion jobs disabled until approved |
| Legal/privacy gaps | §12.7; legal review |
| Single developer | Database-first, tests, docs |

### 17.6 Branding

Name, wordmark text and support email live only in `/src/config`; public booking pages feature the detailer's brand with a small "Powered by" link; no logo, domain, handles or trademark filings until cleared and approved (D-19).
