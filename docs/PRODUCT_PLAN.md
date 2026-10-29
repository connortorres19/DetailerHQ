# DetailerHQ — Product Plan

> **Status:** Draft for review · **Revision 2** · **Last updated:** 2026-10-29
> **Working name:** DetailerHQ is provisional and has **not** been legally or commercially cleared. Treat it as a placeholder everywhere (see §17.3). No domains, services or brand assets are to be purchased or registered during planning.
> **Companion document:** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)

### What changed in revision 2

- Locked decisions: **US only**, **Supabase Auth + Row Level Security**, **7-day no-card trial at public paid launch**, **pilot program before that**, **no customer payments or deposits**, **no automated customer messaging**, **in-app notifications only**.
- Booking workflow expanded: owners can **propose a different time**; the customer status page now gives a clear next step for every state; explicit rules for **duplicates, cancellations, rescheduling, conflicts, time zones and DST**, and **how pending requests interact with slots**.
- Leads and quotes separated from booking requests with new lead statuses (**New, Contacted, Quote sent, Follow-up due, Booked, Lost**); added a **communication log** and **editable message templates**.
- Analytics now separates **quoted value**, **booked job value** and **recorded revenue**, with a definition for every metric and a rule against implying causation.
- New sections: **authorization checks per operation**, **trial / pilot / subscription states and data retention**, **assumptions to verify before launch**, **customer acquisition plan**.
- Scope is split into **MVP (pilot)**, **required before public paid launch**, and **later**.
- Removed: Drizzle ORM (Supabase client + SQL migrations instead), owner notification email from the MVP, CSV import from the MVP.

---

## Contents

1. [Summary](#1-summary)
2. [Target customer and problems](#2-target-customer-and-problems)
3. [Scope](#3-scope)
4. [User roles and permissions](#4-user-roles-and-permissions)
5. [Pages and routes](#5-pages-and-routes)
6. [Booking requests: rules and lifecycle](#6-booking-requests-rules-and-lifecycle)
7. [Other key workflows](#7-other-key-workflows)
8. [Domain model](#8-domain-model)
9. [Security, privacy and data isolation](#9-security-privacy-and-data-isolation)
10. [Notifications](#10-notifications)
11. [Analytics definitions](#11-analytics-definitions)
12. [Pilot, trial, subscription and data retention](#12-pilot-trial-subscription-and-data-retention)
13. [Acceptance criteria](#13-acceptance-criteria)
14. [Architecture, budget and assumptions to verify](#14-architecture-budget-and-assumptions-to-verify)
15. [Customer acquisition plan](#15-customer-acquisition-plan)
16. [Implementation phases and testing](#16-implementation-phases-and-testing)
17. [Decisions, open questions and risks](#17-decisions-open-questions-and-risks)

---

## 1. Summary

DetailerHQ is a web application for **independent auto detailers in the United States** — owner-operators and small shops, mobile or fixed-location — that replaces the mix of text threads, Instagram DMs, paper notes and spreadsheets they use today.

The MVP does six things well:

1. A **public booking page** where customers **request** an appointment. A request is never a confirmed booking.
2. An **approval workflow**: the owner approves, declines, or proposes a different time, and the customer always sees a clear status and next step.
3. Clean records of **customers, vehicles and appointments**, always tied to the correct business.
4. **Leads and quotes**, tracked separately from booking requests, with a communication log.
5. **Follow-ups**: in-app tasks, reminders and editable message templates the owner sends from their own phone or email.
6. **Honest analytics** calculated only from recorded data, with every metric defined.

The product **does not** automatically send SMS, email or social messages; does **not** take customer payments or deposits; and does **not** depend on any paid messaging service. Copy throughout the product and marketing site must reflect this.

### Success criteria

| Goal | Measure |
|---|---|
| Genuinely useful | 5 pilot businesses use it for real requests for 4 consecutive weeks |
| Worth paying for | ≥ 3 pilot businesses pay (pilot fee or subscription) |
| Cheap to run | Infrastructure ≤ ~$50/month through the first ~100 businesses |
| Trustworthy | Zero cross-business data exposure; isolation tests pass on every deploy |
| Honest | Every marketing and in-app claim maps to a shipped, tested feature |

---

## 2. Target customer and problems

### 2.1 Primary customer

**Independent mobile detailers and small detailing shops in the United States** (1–5 people).

- **Phone-first.** Admin happens between jobs, outdoors, often with wet hands. Desktop for evening admin and quotes.
- **Low setup tolerance.** Setup must take under ~15 minutes.
- **Already uses texting and Instagram/Facebook.** We record those conversations; we don't replace the channels.
- **Every business prices differently.** Prices depend on the business, the vehicle's size, its condition and the region. The product never assumes universal detailing prices.
- **Few jobs per day** (typically 1–4); a missed request or double-booking is costly.
- **Price sensitive**, but will pay for something that clearly wins jobs or saves time.

### 2.2 Secondary users

- **The detailer's customers** — vehicle owners using the public booking page and status links. No accounts.
- **Helpers / office managers** — later (see §3.3).

### 2.3 Problems solved

| Problem today | What DetailerHQ does |
|---|---|
| Requests arrive by text, DM, phone and web forms; some get missed | One public booking page, one **Requests** inbox, in-app notifications |
| Customers don't know if they're booked | A status page per request with the current status and a clear next step |
| "How much for my truck?" back-and-forth | The business's own published service menu, with optional prices by vehicle size |
| Double-booking | Configured hours and time off, plus database-enforced prevention of overlapping confirmed appointments |
| Lost track of who owns which car | Customer and vehicle records with service history |
| Quotes in the Notes app, never followed up | Structured leads and quotes, follow-up tasks, message templates, communication log |
| No idea what actually makes money | Analytics from recorded jobs, clearly separating quoted, booked and recorded values |

---

## 3. Scope

Scope is split into three tiers. A feature moves up a tier only with evidence (§3.4).

### 3.1 MVP — required for the pilot

| Area | Requirement |
|---|---|
| **Accounts** | Owner sign-up (invite-only during pilot) and sign-in via **Supabase Auth** (email + password); email verification; password reset; one business per owner |
| **Business profile** | Name, phone, contact email, US timezone, service mode (mobile / shop / both), service area description, shop address, provisional booking slug |
| **Onboarding** | Profile → hours → services → booking page preview → publish |
| **Service menu** | Business-defined categories, services, descriptions, prices, estimated durations; price type fixed / "from" / quote required; optional price and duration per vehicle size class; add-ons; **bookable on/off per service**; ordering. No prefilled prices. |
| **Availability** | Weekly working hours (multiple windows/day), unavailable periods (time off), start-time interval, minimum notice, booking horizon, buffer, max jobs per day, "hold requested times" setting |
| **Public booking page** | Business profile, bookable services, appointment-request flow, inquiry/quote-request flow, "accepting requests" switch |
| **Customer status page** | Per-request status page with next steps; accept/decline a proposed time; withdraw a request; cancel an approved appointment before the business's cutoff |
| **Requests inbox** | Approve, decline, propose a different time; conflict checks; duplicate flags; customer matching |
| **Appointments & calendar** | Day/Week/Agenda; manual creation; reschedule; cancel; complete with recorded final amounts; statuses Scheduled, In progress, Completed, Cancelled, No-show; database-enforced no-overlap |
| **Customers & vehicles** | Manual entry, search, detail pages, history, archive, delete |
| **Leads & quotes** | Inquiries tracked separately from booking requests; statuses New, Contacted, Quote sent, Follow-up due, Booked, Lost; line-item quotes with Draft/Sent/Accepted/Declined/Expired; shareable read-only quote link; print view |
| **Communication log** | Manually logged calls, texts, emails, DMs, in-person conversations (inbound/outbound) on customers and leads |
| **Follow-ups** | In-app tasks and reminders; automatic task rules; editable message templates with placeholders; "copy / open in Messages / open in Mail" with "mark as sent" logging; response tracking |
| **Notifications** | In-app notification list, badges and Today screen (§10) |
| **Analytics** | Defined metrics from recorded data (§11) with empty states |
| **Settings & data** | Business settings, templates, account security, CSV **export**, deletion request |
| **Pilot access** | `pilot` account status set by the operator; pilot end date shown in-app; written pilot terms (§12.2) |
| **Marketing site** | Home, Pilot program / pricing page, Contact, Terms, Privacy — claims limited to shipped features |

### 3.2 Required before the public paid launch (not built during planning or early pilot)

These must be implemented **and tested** before the product is publicly offered for money with a 7-day free trial.

| Requirement | Notes |
|---|---|
| **Subscription billing** for businesses | Provider to be selected (Stripe Billing is the likely candidate; verify fees). Webhooks verified server-side. |
| **7-day free trial enforcement** | No card required (current preference). Exactly 7 × 24 hours from trial start (§12.3). |
| **Subscription status handling** | trialing → active / trial_expired; past_due grace; cancellation; restricted access without data loss (§12.4) |
| **Retention and deletion policy** | Written, legally reviewed, disclosed in Terms/Privacy, with pre-deletion notices (§12.5) |
| **Transactional email provider for auth emails** | Supabase's default sender is intended for low-volume/testing use; a custom SMTP provider is expected to be needed (§14.4) |
| **Public self-serve sign-up** | Replaces invite-only sign-up |
| **Legal review** | Terms, Privacy Policy, service-provider/processor language |
| **Marketing trial copy** | "7-day free trial, no credit card required" appears **only** after the above ships |
| **Domain and final name** | After name clearance and explicit approval to spend |

### 3.3 Later — not in the MVP

Must not be presented as available anywhere until shipped.

| Feature | Condition to reconsider |
|---|---|
| Automated SMS to customers | Pilot evidence + consent capture + TCPA/10DLC compliance review + cost approval |
| Automated email to customers | Pilot evidence + reliable provider + unsubscribe/consent handling |
| Owner email notifications (new request, etc.) | After a reliable email provider is selected; first candidate after the MVP |
| Social media posting / inbox integrations | Strong pilot demand only |
| Customer deposits, online payments, card on file | Pilot evidence that deposits block adoption |
| CSV import of customers/vehicles | Pilot customers demonstrate it's essential (could be promoted into the MVP) |
| Online quote acceptance / e-signature | Pilot demand |
| Customer self-service rescheduling | Pilot demand; MVP uses cancel + new request or contacting the business |
| Auto-approved (instant) booking | Owner demand; schema allows it |
| Staff accounts, multiple technicians, concurrent jobs | Businesses with helpers among paying customers |
| Calendar sync / iCal feed | Pilot demand (iCal feed is cheap) |
| Photo uploads | Storage cost reviewed; pilot demand |
| Multiple locations, multi-currency, non-US markets | Post-validation |
| Dashboard dark mode, native apps, public API, AI features | Not planned |

### 3.4 Feature intake rule

We do not build features because they sound impressive. A feature is added to the active plan only if **at least one** is true:

1. Two or more pilot businesses independently ask for it **and** describe the problem it solves in their own workflow.
2. A pilot business states it is the reason they will not pay.
3. It is required for security, privacy, legal compliance or data integrity.

Each addition is logged in `docs/decisions/` with the evidence.

---

## 4. User roles and permissions

### 4.1 Roles

| Role | Who | Authentication | MVP |
|---|---|---|---|
| **Owner** | The detailer who created the business | Supabase Auth session | ✅ |
| **Public visitor** | Anyone with the booking link | None | ✅ |
| **Token holder** | A customer holding a request-status or quote link | Possession of an unguessable token (only its hash is stored) | ✅ |
| **Platform operator** | DetailerHQ staff | Supabase dashboard / CLI with MFA; no in-app admin UI in MVP | ✅ |
| **System** | Scheduled jobs (`pg_cron` inside the database) | Database role; no network exposure | ✅ |
| **Staff** | Helper, technician, office manager | Supabase Auth | ❌ Later |

### 4.2 Permission matrix

| Capability | Owner | Public visitor | Token holder | Operator |
|---|---|---|---|---|
| View published booking page & bookable services | ✅ | ✅ | ✅ | ✅ |
| Submit appointment request or inquiry | — | ✅ rate-limited | — | — |
| View status of one request; accept/decline proposed time; withdraw; cancel before cutoff | ✅ (in app) | ❌ | ✅ that request only | — |
| View one shared quote | ✅ | ❌ | ✅ that quote only | — |
| Read/write business data (customers, vehicles, requests, appointments, leads, quotes, tasks, templates, communications, notifications) | ✅ own business only | ❌ | ❌ | Break-glass only, audited |
| Configure services, availability, booking page | ✅ own business only | ❌ | ❌ | ❌ |
| Analytics | ✅ own business only | ❌ | ❌ | Platform aggregates only (no PII) |
| Export data / request deletion | ✅ own business only | ❌ | ❌ | Executes deletion |
| Change account status (pilot, trial, active, suspended) | ❌ | ❌ | ❌ | ✅ (later: billing webhook) |

Notes:

- Owner ↔ business is stored in a `memberships` table with a `role` column (`owner` only in MVP), so Staff can be added without restructuring.
- Operator access to business data is **break-glass only** (debugging a reported issue, with the owner's permission), recorded with a reason in the audit log.

---

## 5. Pages and routes

`[slug]` = public booking handle. `[token]` = 128-bit+ random token, stored hashed.

### 5.1 Marketing site (public)

| Route | Purpose |
|---|---|
| `/` | Home: real product screenshots, booking page, what's included **and what isn't**, pilot/trial CTA appropriate to the current stage |
| `/pricing` | **Pilot stage:** "Pilot program" — by invitation, pilot terms summary, how to apply. **Paid launch:** plan, price, 7-day trial explanation and what happens when it ends |
| `/contact` | Contact / pilot application form (stored in our database; no third-party form service) |
| `/legal/terms` | Terms of Service (plus pilot terms during pilot) |
| `/legal/privacy` | Privacy Policy covering owners and their customers, including retention and deletion |

### 5.2 Authentication (Supabase Auth)

| Route | Purpose |
|---|---|
| `/sign-up` | Pilot: invite-only (invite link or code). Paid launch: open sign-up starting the 7-day trial |
| `/sign-in` | Email + password |
| `/auth/confirm` | Handles Supabase email confirmation / magic-link callbacks |
| `/forgot-password`, `/reset-password` | Password recovery via Supabase Auth |

### 5.3 Onboarding

| Route | Purpose |
|---|---|
| `/onboarding` | (1) Business profile and US timezone, (2) Where you work, (3) Hours and booking rules, (4) First services — **names, prices and durations entered by the owner**; optional starter *names* only, never prices, (5) Preview and publish. Saved per step. |

### 5.4 Dashboard (authenticated, `/app/...`)

| Route | Purpose |
|---|---|
| `/app` | **Today**: requests awaiting action, today's schedule, tasks due, recent notifications, account/trial banner, setup checklist |
| `/app/notifications` | In-app notification list (read/unread) |
| `/app/requests` | Inbox. Tabs: Needs action (Pending + customer responded), Waiting on customer (Time proposed), Approved, Closed (Declined, Withdrawn, Expired, Duplicate) |
| `/app/requests/[id]` | Detail: requested items, vehicle, location, preferred times, contact, notes, conflicts, possible duplicates, customer match, history. Actions: **Approve**, **Propose a different time**, **Decline**, **Close as duplicate**. Then the "Let the customer know" panel |
| `/app/calendar` | Day / Week / Agenda; appointments, time off, buffers; tentative holds |
| `/app/appointments/new` | Manual appointment |
| `/app/appointments/[id]` | Detail; actions: Start, Complete (record final amounts), Reschedule, Cancel, Mark no-show; history |
| `/app/customers`, `/app/customers/new`, `/app/customers/[id]` | List/search; create; profile with vehicles, appointments, quotes, leads, tasks, communication log, notes |
| `/app/vehicles/[id]` | Vehicle details and service history |
| `/app/leads`, `/app/leads/new`, `/app/leads/[id]` | Lead list by status/source; create; detail with communication log, quotes, follow-up tasks, outcome |
| `/app/quotes`, `/app/quotes/new`, `/app/quotes/[id]`, `/app/quotes/[id]/print` | Quotes list, editor, detail, print view |
| `/app/tasks` | Follow-up tasks: Overdue, Today, Upcoming, Done |
| `/app/services`, `/app/services/[id]` | Service menu and editor |
| `/app/availability` | Working hours, time off, booking rules |
| `/app/booking-page` | Slug, intro, policies, cancellation cutoff, accepting requests, preview, link and QR code |
| `/app/analytics` | Metrics with definitions and date range |
| `/app/settings` | Business profile, timezone, vehicle size classes, follow-up rules |
| `/app/settings/templates` | Message templates |
| `/app/settings/account` | Name, email, password, sessions |
| `/app/settings/plan` | Pilot: pilot terms and end date. Paid launch: trial status, subscription, billing portal link |
| `/app/settings/data` | CSV export, retention information, deletion request |

### 5.5 Public business pages

| Route | Purpose |
|---|---|
| `/b/[slug]` | Booking page: business info, bookable services with the business's prices and durations, policies, "Request an appointment" and "Ask a question / request a quote" |
| `/b/[slug]/request` | Multi-step appointment request: Service → Vehicle → Location → Time → Contact → Review |
| `/b/[slug]/inquiry` | Inquiry / quote request (no time slot) → creates a **Lead** |
| `/r/[token]` | Request status page with next steps and permitted customer actions |
| `/q/[token]` | Read-only quote |

### 5.6 System pages

404, 500, "booking page unavailable", "link not valid", maintenance — all with a clear next step.

---

## 6. Booking requests: rules and lifecycle

### 6.1 Principle

> **An appointment request is not a booking.** It becomes a confirmed appointment only when the owner approves it, or when the customer accepts a time the owner proposed. Every customer-facing screen says this plainly.

### 6.2 Request statuses

| Status | Meaning | Set by |
|---|---|---|
| `pending` | Submitted; waiting for the owner | Customer submission |
| `time_proposed` | Owner proposed a different time; waiting for the customer | Owner |
| `approved` | Confirmed; an appointment exists | Owner approval, or customer accepting a proposal |
| `declined` | Owner declined | Owner |
| `proposal_declined` | Customer declined the proposed time | Customer |
| `withdrawn` | Customer withdrew before a decision | Customer |
| `expired` | No decision before the requested time, or proposal not answered before its expiry | System |
| `closed_duplicate` | Owner closed it as a duplicate of another request | Owner |

After approval the **appointment** owns the lifecycle (Scheduled → In progress → Completed / Cancelled / No-show); the status page reflects the appointment.

```
              ┌──────────── withdrawn (customer)
              │
 submit ──► pending ──► approved ──► [appointment lifecycle]
              │  │          ▲
              │  └─► time_proposed ──► (customer accepts) ─┘
              │          │
              │          ├─► proposal_declined (customer)
              │          └─► expired (no answer)
              ├─► declined (owner)
              ├─► closed_duplicate (owner)
              └─► expired (requested time passed)
```

### 6.3 Customer status page — status and next steps

The status page shows only that request: business name and contact options, services, vehicle, requested/proposed/confirmed time **with timezone**, and the next step.

| State shown | Headline | Next step text | Customer actions |
|---|---|---|---|
| Pending | Request received — not confirmed yet | "[Business] reviews requests and will confirm, decline, or suggest another time. Check this page for updates; they may also contact you directly." | Withdraw request · Call / text business |
| Time proposed | [Business] suggested a different time | "Accept to confirm, or decline and contact them. This suggestion is held until [time]." | **Accept this time** · Decline · Call / text |
| Approved / Scheduled | Confirmed for Sat, Nov 8, 9:00 AM CT | Location, prep instructions, cancellation policy | Cancel (until cutoff) · Call / text |
| Rescheduled | Time changed — now Sun, Nov 9, 10:00 AM CT | "Your appointment was moved by [Business]. Previously: Sat, Nov 8, 9:00 AM." | Cancel (until cutoff) · Call / text |
| In progress / Completed | Completed on Nov 8 | "Thanks — contact [Business] with any questions." | Call / text |
| Declined | [Business] can't take this request | Owner's optional message; "You're welcome to send a new request." | Send a new request · Call / text |
| Proposal declined | You declined the suggested time | "Contact [Business] or send a new request." | Send a new request |
| Withdrawn | You withdrew this request | — | Send a new request |
| Cancelled (by customer / by business) | Appointment cancelled | Who cancelled and when; optional message | Send a new request · Call / text |
| Expired | This request expired | "It wasn't confirmed before the requested time." | Send a new request |
| Closed as duplicate | This request was combined with another | "[Business] is handling your booking through another request you sent." | Call / text |

The page **never** shows other customers' information, internal notes, or why a slot is unavailable.

Because DetailerHQ doesn't message customers in the MVP, the customer learns about changes by (a) revisiting the status page and (b) the owner contacting them. The confirmation screen therefore offers **Copy link** and asks the customer to save the link, and every owner message template includes the `{status_link}` placeholder by default.

### 6.4 How pending requests interact with available slots

| Item | Effect on public availability | Effect on owner calendar |
|---|---|---|
| Confirmed appointment (Scheduled / In progress) | Blocks its time **plus buffer** | Shown as an appointment |
| Time off | Blocks | Shown as time off |
| **Pending request — default** (`hold_pending = off`) | **Does not block.** Other customers may request the same time. | Shown as tentative; the request shows "1 other request for this time" |
| **Pending request — hold enabled** (`hold_pending = on`) | Blocks its requested time (plus buffer) until decided, withdrawn or expired, up to **48 hours** after submission (then it stops blocking, but stays pending) | Shown as tentative hold |
| **Time proposed by the owner** | **Always blocks** the proposed time until the customer answers or the proposal expires (default 48 h, never later than the proposed start minus minimum notice) | Shown as tentative hold |
| Declined / withdrawn / expired / duplicate | No effect | Hidden |

**Default rationale:** holding times for unconfirmed requests lets one spam submission or an unresponsive customer block a detailer's day. The default favours the owner's control; owners who prefer protecting customers from collisions can turn holding on. Daily job caps count only confirmed appointments (and holds, when holding is on).

### 6.5 Conflicting appointments — validation rules

**Hard rules (always enforced; cannot be overridden):**

1. Two appointments of the same business with status **Scheduled** or **In progress** must not overlap in time (`[starts_at, ends_at)`). Enforced by a PostgreSQL **exclusion constraint** on `(business_id, tstzrange(starts_at, ends_at))`, so no code path — approval, accepting a proposal, manual creation, rescheduling, reopening — can create an overlap, even under concurrent requests.
2. `ends_at > starts_at`; appointment length between 15 minutes and 72 hours (multi-day shop jobs such as coatings are created manually; public requests are limited to a single working window).
3. Appointments reference a customer and vehicle of the **same business** (composite foreign keys).
4. Approval is idempotent: a request can produce at most one appointment (unique constraint on `appointments.booking_request_id`).

**Soft rules (warn; owner must explicitly confirm):**

- Overlaps another appointment's **buffer**
- Outside working hours, or during time off
- Exceeds the max jobs per day
- Less than the minimum notice, or in the past
- Overlaps a **tentative hold** (another pending request with holding on, or an outstanding proposal)

**Public requests** may only choose slots that pass all hard and soft rules. Availability is re-checked when the request is submitted and again on approval; if a hard rule fails on approval, approval is blocked and the owner is offered **Propose a different time**.

When a customer accepts a proposed time, the hard rules run again. If the time is no longer available (e.g., the owner booked over it manually after confirming a warning), acceptance fails gracefully: the customer sees "This time is no longer available — [Business] will contact you", the request returns to `pending`, and the owner gets a notification.

### 6.6 Duplicate requests

| Case | Rule |
|---|---|
| Double-click / network retry | Each form session carries an **idempotency key**; resubmitting returns the original request and status link. No duplicate row. |
| Same contact sends another request while one is open | Accepted, but flagged **"Possible duplicate"** when the normalized phone or email matches an open (`pending` / `time_proposed`) request for the same business. Both are linked in the inbox; the owner can **Close as duplicate** (customer sees "combined with another request"). |
| Excessive open requests | Max **3 open requests per contact per business**. Beyond that, the form shows a generic message: "We couldn't send this request. Please contact [Business] directly at (512) 555-0142." It does not reveal whether that phone/email has other requests. |
| Automated spam | Per-IP and per-business rate limits and a honeypot field; a free bot challenge (e.g., Cloudflare Turnstile) can be added if abuse appears (requires account registration — later decision). |
| Same person, different businesses | Not a duplicate. Businesses never see each other's requests or customers. |

### 6.7 Cancellations

| Who | When | Rule |
|---|---|---|
| Customer | `pending` / `time_proposed` | **Withdraw** from the status page at any time. Frees any hold. Owner notified in-app. |
| Customer | Approved appointment, **before** the business's cancellation cutoff (default 24 h before start; configurable 0–72 h, or self-cancellation disabled) | **Cancel** from the status page with an optional reason. Appointment → Cancelled (by customer); slot freed; owner notified. |
| Customer | After the cutoff | Status page shows the business's cancellation policy and call/text buttons; no self-cancel. |
| Owner | Any time before completion | **Cancel** with a reason (internal) and optional customer-facing message; slot freed; status page updated; "Let the customer know" panel shown. |
| Owner | Customer didn't show | **Mark no-show** (only after the start time). |

Cancelled appointments are kept (with `cancelled_by`, `cancelled_at`, reason) for history and analytics. Nothing is charged or refunded: there are no payments in the MVP.

### 6.8 Rescheduling

- **Owner reschedules** an appointment from its detail page: picks a new time, runs hard and soft rules, saves. The previous time is kept in history; the status page shows "Time changed" with the new and previous times; the owner is prompted to inform the customer using the "Appointment rescheduled" template.
- **Before approval**, changing the time is done with **Propose a different time** (the customer must accept).
- **Customer-initiated rescheduling** is not self-service in the MVP. The status page says: "Need a different time? Contact [Business]" (call/text), or the customer can cancel (before cutoff) and send a new request.
- Rescheduling never changes prices; the recorded estimate stays unless the owner edits items.

### 6.9 Time zones and daylight-saving time

1. **Business timezone is authoritative.** Each business has one IANA timezone from the **US list** (e.g., `America/New_York`, `America/Chicago`, `America/Denver`, `America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `Pacific/Honolulu`, plus other US IANA zones such as `America/Detroit`, `America/Indiana/Indianapolis`, `America/Boise`). Chosen during onboarding; the browser's zone is only a suggestion.
2. **Storage:** all instants in UTC (`timestamptz`). Working hours are stored as **local wall-clock times** per weekday; time off as local dates or local start/end times; both are interpreted in the business timezone at calculation time.
3. **Display:** public pages always show the business's timezone ("Times are in Central Time (CT)"). If the visitor's device is in a different zone, a notice says so. The dashboard shows the zone abbreviation only when the device zone differs from the business zone. Customer-facing confirmations always include the abbreviation (e.g., "9:00 AM CST").
4. **Spring forward** (local 2:00–2:59 AM doesn't exist): candidate start times in the gap are skipped. Appointments are stored as real durations, so a job spanning the change ends one wall-clock hour later than naive arithmetic suggests.
5. **Fall back** (local 1:00–1:59 AM occurs twice): slots are generated per real instant; any ambiguous time is labelled with its abbreviation (CDT/CST).
6. **Arizona (`America/Phoenix`) and Hawaii** have no DST; tests cover them.
7. **Changing the business timezone:** existing appointments keep their absolute instant. The owner sees a warning listing future appointments whose local time will display differently and must confirm. Working hours keep their wall-clock values in the new zone.
8. **"Today", date filters, daily caps, analytics periods and expiry jobs** all use the business's local calendar day.
9. Request expiry, proposal expiry and cancellation cutoffs compare UTC instants.

---

## 7. Other key workflows

### 7.1 Owner sign-up and onboarding

1. **Pilot:** owner receives an invite (operator-created via Supabase Auth invite or an invite code) and accepts the pilot terms. **Paid launch:** owner signs up publicly; the 7-day trial starts when the business is created.
2. Verifies email (Supabase Auth). An unverified owner can set up but cannot publish the booking page.
3. Onboarding steps (§5.3). Services require the owner's own names, descriptions, prices and durations; we never fill in prices.
4. Publish: link, copy button, QR code (generated locally).
5. Lands on **Today** with a setup checklist.

### 7.2 Customer submits an appointment request

1. Opens `/b/[slug]`; sees the business's bookable services, prices and durations.
2. Chooses service(s) and add-ons → vehicle (year, make, model, size class with examples, optional color/condition notes) → location (their address if the business is mobile; shop if fixed) → preferred start time (+ optional alternate) → contact (name, mobile phone and/or email; preferred contact method) → review.
3. Consent checkbox: "I agree that [Business] may contact me about this request."
4. Submit button: **"Send request"**.
5. Confirmation: "Request sent — not confirmed yet," next steps, status link with **Copy link**.

### 7.3 Customer sends an inquiry / quote request

Same flow without a time slot, with "What do you need?" and an optional timeframe. Creates a **Lead** (status New, source "Booking page"), not a booking request. Confirmation explains the business will reply directly.

### 7.4 Owner handles a request

1. Notification + inbox badge. Opens the request.
2. Reviews conflicts (§6.5), duplicate flags (§6.6), and customer/vehicle matching (exact normalized phone or email match within **this business only**; owner confirms link-or-create).
3. **Approve** → appointment created; status page shows Confirmed.
   **Propose a different time** → choose time (hard rules enforced), optional message, expiry → status `time_proposed`; the time is held.
   **Decline** → optional customer message and internal reason; option to **Save as lead**.
4. **Let the customer know** panel: template pre-filled with request details and `{status_link}`. Buttons: Copy, Open in Messages (`sms:`), Open in Mail (`mailto:`), Call (`tel:`). After using one, the owner is asked **"Did you send it?"** — *Yes* logs an outbound communication; *Not yet* creates nothing. DetailerHQ itself sends nothing.

### 7.5 Day of the job

1. **Today**: next appointment with time, address (opens maps app), tap-to-call/text, vehicle, services, prep notes, last visit's notes.
2. **Start** (optional) → **Complete**: confirm **recorded final amounts** per line item (default to the booked estimate, editable; add/remove lines), optional payment note (Not recorded / Marked paid — cash / card / transfer / other / Unpaid). Copy: "Recorded amounts are for your records. DetailerHQ doesn't process payments."
3. Completion triggers follow-up rules (e.g., maintenance reminder task in N days, set per service by the owner).

### 7.6 Leads and quotes

Leads are **inquiries and prospects**, tracked separately from booking requests. A lead may come from the public inquiry form, a declined request saved as a lead, or manual entry (phone, text, Instagram, Facebook, Google, referral, walk-in, repeat customer, other).

| Lead status | Meaning | Transition |
|---|---|---|
| **New** | Not yet contacted | Default on creation |
| **Contacted** | Owner has been in touch | Manual, or automatically when an outbound communication is logged on a New lead |
| **Quote sent** | A quote has been marked sent | Automatic when a linked quote is marked Sent |
| **Follow-up due** | The lead's next follow-up date has passed with no recorded inbound response since | Automatic (scheduled job) from Contacted / Quote sent; or manual |
| **Booked** | An appointment was created for this lead | Automatic when an appointment is created from the lead or its accepted quote |
| **Lost** | Not proceeding | Manual, with a reason (price, timing, went elsewhere, no response, not a fit, other) |

Owners can move a lead to any status manually; every change is recorded in its history.

**Quotes:** line items (from the business's services or custom), vehicle, valid-until date (default 14 days), notes, terms, optional single estimated tax line. Statuses: Draft → Sent → Accepted / Declined / Expired (automatic after valid-until). Shared via `/q/[token]` (read-only) and print view. **Accepted** → "Schedule it" pre-fills an appointment.

**Values are recorded separately:** the quote's total is the **quoted value**; the appointment's estimated total is the **booked job value**; the completed appointment's recorded final amount is the **recorded revenue**. Changing one never overwrites another.

### 7.7 Follow-ups, reminders and templates

- **Tasks:** title, due date/time, optional link to customer / lead / quote / appointment, status (open, done, dismissed), and an **outcome** when completed: *Responded*, *No response*, *Booked*, *Not interested*, *Other*.
- **Automatic task rules** (owner-editable, can be turned off):
  - Quote marked Sent → "Follow up on quote Q-0012" in 3 days.
  - Appointment completed → "Maintenance reminder for [customer]" after the service's follow-up interval (blank by default; the owner sets it).
  - Request pending > 24 h → "Respond to request from [customer]".
  - Appointment tomorrow → optional "Remind [customer] about tomorrow" (off by default).
- **Message templates** (`/app/settings/templates`): editable text with placeholders. Defaults provided for: request approved, time proposed, request declined, appointment reminder, appointment rescheduled, appointment cancelled, quote sent, quote follow-up, thank-you after job, maintenance reminder. Default texts contain **no prices or business-specific claims**.
  - Placeholders: `{customer_first_name}`, `{business_name}`, `{business_phone}`, `{service_names}`, `{vehicle}`, `{appointment_date}`, `{appointment_time}`, `{appointment_address}`, `{proposed_time}`, `{status_link}`, `{quote_link}`, `{quote_total}`, `{quote_valid_until}`.
  - A missing value (e.g., no address) is highlighted and must be edited before copying.
- **Response tracking:** logging an **inbound** communication on a lead records a response and clears Follow-up due; task outcomes record whether the lead responded or booked.
- **Communication log:** each entry has channel (call, text, email, Instagram, Facebook, in person, other), direction (inbound/outbound), date/time, summary, optional template used, and who logged it. Entries are created **only** manually or after the owner confirms "Did you send it?". The product never claims a message was delivered.

### 7.8 Manual appointment

New → Appointment → search or create customer → pick or add vehicle → services (business prices pre-filled, editable) → time (availability shown; hard rules enforced; soft rules warn) → save.

### 7.9 Configure services and availability

- Services: create/edit/reorder; **bookable on/off**; hide/archive without affecting historical snapshots; per-size-class prices/durations; "quote required" sends customers to the inquiry form.
- Availability: weekly windows, time off (single day, date range, or partial day), rules (§6.4). Changes affect only future slot calculation; existing appointments are never moved.

### 7.10 Trial end and subscription (paid launch)

See §12. In short: banner during the trial with the exact end date and time; at expiry the account becomes **restricted** (read-only + export + subscribe), the booking page stops accepting new requests, and **no data is deleted**.

### 7.11 Export and deletion

- Export: CSV zip (customers, vehicles, appointments + items, requests, leads, quotes + items, tasks, communications) generated on demand, available in every account state including restricted.
- Deletion request: typed confirmation → booking page offline immediately → hard deletion after the disclosed grace period (§12.5).

---

## 8. Domain model

### 8.1 Conventions

- **Every business-owned table has a non-null `business_id`.** No exceptions.
- Primary keys: random UUIDs. Human-readable numbers (`R-0042`, `Q-0012`) are per-business display values only.
- Timestamps in UTC (`timestamptz`); business timezone for local interpretation (§6.9).
- Money in integer **cents**, USD only.
- Snapshots: requests, appointments and quotes copy service names, prices and durations so menu edits never rewrite history.
- `created_at`, `updated_at`, `created_by` everywhere; `business_id` is **immutable** after insert (trigger).
- Soft archive (`archived_at`) for customers, vehicles, services; hard deletion only through explicit deletion flows.

### 8.2 Entities

| Entity | Key fields (conceptual) |
|---|---|
| **auth.users** (Supabase) | id, email, encrypted password, email confirmation — managed by Supabase Auth; no business data |
| **Profile** | user_id, display name |
| **Business** | id, name, slug, phone, email, timezone (US IANA), service_mode, service_area_text, shop_address, accepting_requests, published_at, account_status, pilot_ends_at, trial_started_at, trial_ends_at, access_restricted_at, deletion_requested_at |
| **Membership** | business_id, user_id, role (`owner`) — unique pair |
| **BookingSettings** | business_id (1:1), slot_interval_min, min_notice_min, horizon_days, buffer_min, max_jobs_per_day, hold_pending, proposal_expiry_hours, customer_cancel_cutoff_hours, customer_self_cancel, intro_text, policies_text, prep_instructions |
| **AvailabilityRule** | business_id, weekday, start_time, end_time (local) |
| **TimeOff** | business_id, starts_local, ends_local (or all-day dates), label |
| **VehicleSizeClass** | business_id, name, examples, sort_order |
| **ServiceCategory** | business_id, name, sort_order |
| **Service** | business_id, category_id, name, description, price_type, base_price_cents, base_duration_min, is_addon, is_bookable, follow_up_after_days, sort_order, archived_at |
| **ServicePrice** | business_id, service_id, size_class_id, price_cents, duration_min |
| **Customer** | business_id, first/last name, phone_e164, email, preferred_contact, address (mobile jobs only), notes, source, archived_at |
| **Vehicle** | business_id, customer_id, year, make, model, trim, color, size_class_id, plate (optional), notes, archived_at |
| **BookingRequest** | business_id, number, status, idempotency_key, token_hash, requested_start/end, alternate_start, proposed_start/end, proposal_message, proposal_expires_at, location_type, service_address, contact snapshot (name, phone_e164, email, preferred_contact), vehicle snapshot, notes, consent_at, duplicate_of_id, decline_message, decline_reason (internal), decided_at/by, customer_id, vehicle_id |
| **BookingRequestItem** | business_id, request_id, service_id, name/price/duration snapshot |
| **Appointment** | business_id, customer_id, vehicle_id, booking_request_id (unique, nullable), quote_id, lead_id, starts_at, ends_at, location_type, service_address, status, estimated_total_cents, recorded_total_cents, payment_note, cancelled_by (customer/business), cancelled_at, cancel_reason, customer_message, completed_at, internal_notes |
| **AppointmentItem** | business_id, appointment_id, service_id, name, quantity, estimated_price_cents, recorded_price_cents, duration_min |
| **Lead** | business_id, status, source, lost_reason, contact snapshot, customer_id, vehicle_description, request_text, next_follow_up_at, last_inbound_at |
| **Quote** | business_id, number, status, lead_id, customer_id, vehicle_id/vehicle_text, valid_until, notes, terms, subtotal/discount/tax/total cents, token_hash, sent_at, decided_at |
| **QuoteItem** | business_id, quote_id, service_id, name, description, quantity, price_cents, duration_min |
| **Task** | business_id, title, due_at, status, kind (manual / rule), rule_key, related_type, related_id, outcome, completed_at |
| **MessageTemplate** | business_id, purpose, name, body, is_default |
| **Communication** | business_id, customer_id, lead_id, related_type/id, channel, direction, occurred_at, summary, template_id, logged_by |
| **Note** | business_id, related_type/id, body, created_by |
| **Notification** | business_id, type, related_type/id, title, created_at, read_at |
| **ActivityEvent** | business_id, entity_type/id, kind (status_changed, rescheduled, …), from/to, actor (owner / customer / system), created_at — powers timelines and status page history |
| **AuditEvent** | business_id (nullable), actor_type/id, action, entity, metadata (no PII), ip_hash, created_at — append-only security log |
| **Subscription** *(paid launch)* | business_id, provider, provider_customer_id, provider_subscription_id, status, current_period_end, cancel_at_period_end |
| **ContactSubmission** | Marketing-site contact/pilot applications (not business data) |

### 8.3 Relationships

```
auth.users ──< Membership >── Business ──1 BookingSettings
                                 │
     ┌───────────┬───────────────┼───────────────┬──────────────────┐
AvailabilityRule TimeOff  VehicleSizeClass  ServiceCategory ──< Service ──< ServicePrice
                                 │
Customer ──< Vehicle             │
   │                             │
   ├──< BookingRequest ──< BookingRequestItem
   │        │ 0..1
   │        ▼
   ├──< Appointment ──< AppointmentItem
   │        ▲
   ├──< Lead ──< Quote ──< QuoteItem
   │
   └──< Communication, Task, Note (polymorphic: customer / lead / quote / appointment / request)
Notification, ActivityEvent, AuditEvent — per business
```

### 8.4 How records stay with the correct business

1. **The business is never taken from the client.** For owner actions, `business_id` comes from the authenticated user's membership. For public submissions, it comes from resolving the `[slug]` on the server. Client-provided `business_id` values are ignored.
2. **Composite foreign keys** `(business_id, id)` on every reference between business-owned tables: a vehicle, appointment, quote or task can only point at rows of the same business. The database rejects anything else.
3. **`business_id` is immutable** (trigger rejects updates).
4. **Matching is per business.** Customer de-duplication (by phone/email) only searches within the same business. The same person booking with two businesses has two unrelated customer records; there is no global customer identity.
5. **RLS** on every table (§9.3) — even a buggy query cannot read another business's rows.
6. **Exports, scheduled jobs and analytics** run per business.

### 8.5 Slot calculation

For a date and total duration *D* (selected services + add-ons for the chosen size class):

1. Load the business's working windows for that local weekday.
2. Generate candidate start instants every `slot_interval_min` (local wall-clock), skipping non-existent DST times, with `start + D ≤ window end`.
3. Remove candidates before `now + min_notice` or beyond `horizon_days`.
4. Remove candidates overlapping time off.
5. Remove candidates overlapping confirmed appointments ± buffer, outstanding proposals, and pending requests if `hold_pending` is on (§6.4).
6. If the day has reached `max_jobs_per_day`, remove the day.

Only start times are returned publicly.

---

## 9. Security, privacy and data isolation

### 9.1 Principles

- Each business can access **only its own data**, enforced in three independent layers: server authorization, **Supabase Row Level Security**, and schema constraints.
- **Privileged credentials never reach the browser.**
- Collect the minimum customer data needed to do the job; retain it only as long as disclosed.

### 9.2 Authorization checks for every operation

All owner operations run **server-side** (Next.js server actions/route handlers) using a Supabase client bound to the **user's session**, so RLS applies to every query. Public operations call narrowly scoped database functions.

| Operation | Caller | Server-side check | Database protection |
|---|---|---|---|
| List / read business records | Owner | Valid session; resolve membership → business | RLS `SELECT` policy: `is_member(business_id)` |
| Create a business record | Owner | Session + membership; set `business_id` from membership; validate input (Zod); check account can write (§12.4) | RLS `INSERT … WITH CHECK is_member(business_id) AND can_write(business_id)`; composite FKs |
| Update a record | Owner | Same as create; record ID scoped to business | RLS `UPDATE USING` + `WITH CHECK`; `business_id` immutable trigger; composite FKs |
| Delete / archive | Owner | Same; destructive actions require typed confirmation for customers and the business | RLS `DELETE` policy |
| Approve / decline / propose / close duplicate | Owner | Membership; request in an allowed state; inside one transaction | Database function running as the caller (`SECURITY INVOKER`) so RLS applies; exclusion constraint; unique `booking_request_id` |
| Reschedule / cancel / complete appointment | Owner | Membership; allowed status transition | RLS; exclusion constraint; transition check in function |
| Configure services, availability, booking page, templates | Owner | Membership; validation | RLS |
| Export CSV | Owner | Membership; allowed in all non-suspended states | RLS (export uses the user's session) |
| View analytics | Owner | Membership | RLS; analytics views use `security_invoker` |
| View public booking page | Anyone | Resolve slug; business published & not suspended | `SECURITY DEFINER` function returning an **allow-list** of public fields only; no direct table access for `anon` |
| Get available slots | Anyone | Rate limit | Definer function returning start times only |
| Submit request / inquiry | Anyone | Rate limit, honeypot, idempotency key, validation, accepting requests, open-request cap | Definer function; prices/durations recomputed in the database; `business_id` from slug |
| View request status / accept / decline proposal / withdraw / cancel | Token holder | Rate limit; hash token; allowed state & cutoff | Definer function looks up by token hash, scoped to one request; allow-listed output |
| View shared quote | Token holder | Rate limit; hash token | Definer function; allow-listed output |
| Scheduled jobs (expire requests/proposals/quotes, follow-up due, task rules) | System (`pg_cron`) | — | Runs inside the database; iterates per business |
| Change account status / billing events *(paid launch)* | Operator / billing webhook | Webhook signature verified; idempotent | Server-only privileged path (§9.4) |
| Break-glass support access | Operator | Owner permission; reason recorded | Audit event |

A record belonging to another business always yields **404 Not Found**, never 403, so existence isn't revealed.

Security-definer functions: fixed `search_path`, owned by a dedicated role, `EXECUTE` granted only to the intended roles, inputs validated, outputs explicitly listed. Each has dedicated tests.

### 9.3 Row Level Security

- RLS **enabled and forced** on every table in exposed schemas. A CI check queries the catalog and fails the build if any table lacks RLS or policies.
- Helper `is_member(business_id)` (stable, `SECURITY DEFINER`, fixed search path) checks `memberships` against `auth.uid()`.
- Separate policies per command (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) with both `USING` and `WITH CHECK`.
- The `anon` role has **no direct privileges** on business tables; public access is only through the definer functions above.
- Write policies also check `can_write(business_id)` so restricted accounts (§12.4) are read-only at the database level (added in the paid-launch phase; pilot accounts always writable).
- Run Supabase's security advisor / database linter before each release.
- RLS is tested with **pgTAP** (supported by the Supabase CLI) as both the app role and `anon`.

### 9.4 Secrets and privileged credentials

- The Supabase **anon (publishable) key** is designed to be public and is only safe because of RLS; it may be present in the browser.
- The **service-role (secret) key**:
  - is **never** exposed to the browser, never in a `NEXT_PUBLIC_*` variable, never logged, never committed;
  - is **not used by the web application's request handlers in the MVP** — public operations use definer functions, and scheduled jobs run in `pg_cron`;
  - is used only by the operator's local scripts/CLI and, at paid launch, by the billing webhook handler in a server-only module (`import "server-only"`).
- CI scans the built client bundle for secret patterns and fails if found.
- Secrets live in the hosting provider's environment variables; `.env*` files are git-ignored; an `.env.example` lists names only.

### 9.5 Authentication (Supabase Auth)

- Email + password; email confirmation required before publishing.
- Server-side session handling with Supabase's SSR helpers; HTTP-only cookies.
- Password policy configured in Supabase (minimum length ≥ 10; leaked-password protection if available on the plan — verify).
- Supabase Auth rate limits plus our own limits on sign-in/up forms.
- Operator accounts (Supabase dashboard) use MFA.
- Optional owner 2FA (Supabase MFA) — later.

### 9.6 Web security baseline

HTTPS/HSTS; Content Security Policy; CSRF protection (server actions' origin checks + SameSite cookies); framework output escaping, no HTML rendering of user input; owner-entered booking page text rendered as plain text; dependency scanning (Dependabot); lockfile committed; strict input validation and length limits on every field.

### 9.7 Privacy and data minimization

- **Roles:** the detailer is responsible for their customers' data (controller); DetailerHQ processes it on their behalf (service provider/processor). Stated in Terms and Privacy Policy, subject to legal review.
- **Customer data collected:** name, phone and/or email, preferred contact method, service address (mobile jobs only), vehicle year/make/model/size/color, optional plate, notes. **Not collected:** date of birth, driver's license, payment card data, precise location tracking. VIN not collected in the MVP.
- **No third-party trackers** (ad pixels, session replay) on the booking page or dashboard.
- **Logs:** no PII; IPs only as salted hashes for rate limiting; error monitoring (if used) scrubs request bodies.
- **Consent:** only for being contacted about the request. No marketing consent collected because no marketing is sent.
- **US considerations:** CAN-SPAM applies to our own outreach email (§15); TCPA/10DLC would apply before any future automated SMS; state privacy laws (e.g., California) to be assessed in legal review. *This plan is not legal advice.*

### 9.8 Retention and deletion (summary; details in §12.5)

| Data | Retention |
|---|---|
| Active account data | Kept while the account exists; owner controls edits and deletion |
| Declined / withdrawn / expired / duplicate requests not linked to a customer | Purged 12 months after closing |
| Customer deleted by owner | Hard-deleted with vehicles, communications and notes; historical appointments kept **anonymized** so totals remain accurate |
| Notifications | 90 days |
| Audit events | 12 months |
| Restricted accounts (trial expired / subscription ended) | **Not deleted at trial end**; retained per §12.5 |
| Backups | Provider-managed; deleted data persists until backups rotate (disclosed) |

End customers who ask DetailerHQ to delete their data are directed to the business; we assist the business on request.

### 9.9 Auditing and operations

Audit events for sign-in, password change, approve/decline/propose, cancellations, reschedules, exports, customer deletion, settings changes, account status changes and any operator access. Daily provider backups with a restore drill before the first pilot uses real data. Uptime check on the booking page.

---

## 10. Notifications

**MVP: in-app only.** No email, SMS or push notifications are sent to owners or customers. Core functionality must work without any messaging service.

| Event | In-app notification | Also surfaced in |
|---|---|---|
| New appointment request | ✅ | Requests badge, Today |
| Possible duplicate request | ✅ (grouped) | Request detail |
| New inquiry (lead) | ✅ | Leads badge, Today |
| Customer accepted / declined a proposed time | ✅ | Request detail |
| Customer withdrew a request / cancelled an appointment | ✅ | Today, calendar |
| Proposal or request expired | ✅ | Requests (Closed) |
| Quote expired | ✅ | Quotes |
| Task due / overdue | — | Tasks badge, Today |
| Pilot / trial ending (≤ 3 days) | Banner | Every page |

- **Freshness:** server-rendered on navigation, plus lightweight polling (e.g., every 60 s while the tab is visible) for badge counts. No paid real-time service. Supabase Realtime may be evaluated later if included in the plan.
- **Installable web app:** owners can add the app to their home screen; no push promises in the MVP.
- **Customers** get status updates by visiting their status page; the owner's messages include the link.
- **Later:** owner email notifications once a reliable provider is selected (§3.3).

---

## 11. Analytics definitions

Rules:

- Every metric is computed **only from recorded data** in the selected period, in the **business's timezone**.
- Every metric shows its definition in the UI (info button).
- **Rates** require at least **5** items in the denominator; otherwise show "Not enough data yet" with the count (e.g., "3 decided requests").
- No industry benchmarks, projections, or invented comparisons. Comparisons to the previous period are shown only when both periods meet the threshold.
- **No causal claims.** The product never states or implies that a follow-up, template or reminder *caused* a booking. Sequential metrics are labelled "after", not "from" or "because of".
- No demo or sample data is ever shown in a real account.

### 11.1 Three distinct money values

| Term | Definition | Source |
|---|---|---|
| **Quoted value** | Sum of `total` of quotes **sent** in the period (by sent date) | Quotes |
| **Booked job value** | Sum of `estimated_total` of appointments **scheduled for** the period (by start date) with status Scheduled, In progress or Completed | Appointments |
| **Recorded revenue** | Sum of `recorded_total` of appointments **completed** with start date in the period, as entered by the owner. Not verified payments. | Completed appointments |

UI label for recorded revenue always includes the qualifier: "Recorded revenue — amounts you entered when completing jobs."

### 11.2 Metric catalog

| Metric | Definition |
|---|---|
| Requests received | Appointment requests created in the period (duplicates closed by the owner shown separately) |
| Median first response time | Median time from request creation to the owner's first decision (approve, propose, decline) for requests created in the period |
| Request outcomes | Count of requests created in the period by current status |
| Request-to-booking rate | Requests created in the period that became an appointment ÷ requests created in the period, excluding closed duplicates and requests still open |
| Appointments completed | Appointments with status Completed and start date in the period |
| Average recorded job value | Recorded revenue ÷ appointments completed |
| Cancellations and no-shows | Counts by who cancelled, and no-shows, for appointments with start date in the period; rate = count ÷ appointments with start date in the period (excluding still-scheduled future ones) |
| Quote acceptance rate | Quotes sent in the period now Accepted ÷ (Accepted + Declined + Expired). Quotes still open are shown separately and excluded |
| Leads by source | Leads created in the period grouped by source, with current status breakdown |
| Lead-to-booked rate (by source) | Leads created in the period now Booked ÷ leads created in the period. Note shown: "Recent leads may not have had time to book." |
| Follow-up activity | Outbound communications logged and follow-up tasks completed in the period, with recorded outcomes |
| Leads booked after a logged follow-up | Count of leads that reached Booked **after** at least one outbound communication was logged. Label: "This shows timing only — it doesn't mean the follow-up caused the booking." |
| Top services | By count of completed appointment items and by recorded line amounts (recorded per item, no allocation) |
| New vs. returning customers | Customers whose first completed appointment falls in the period vs. customers with an earlier completed appointment |

Each metric has a reference SQL query in the test suite (§16.2).

---

## 12. Pilot, trial, subscription and data retention

### 12.1 Stages

| Stage | Who | Access | Billing |
|---|---|---|---|
| **Pilot** (MVP) | Invited businesses | Full features under written pilot terms | None in-product. Any pilot fee is handled manually outside the app (method to be decided). |
| **Public paid launch** | Anyone in the US | 7-day free trial, then subscription | Integrated subscription billing (§3.2) |

**Pilot access is not a trial.** Pilot businesses are told in writing that they are in a pilot, what it includes, what it costs (if anything), when it ends, and what happens afterwards. The product and site never describe pilot access as a "free trial" or as a fully implemented subscription.

### 12.2 Pilot terms (to draft before inviting pilots)

Covers: pilot duration and end date; price (free or a stated pilot fee) and how it's paid; features included and that they may change; no service-level guarantee; data ownership, export at any time, and deletion on request; what happens at pilot end (offer to convert to a subscription when available, export, or deletion); how feedback is collected; how to contact us.

### 12.3 The 7-day free trial (paid launch)

- **Duration:** exactly 7 × 24 hours, starting when the business is created. `trial_ends_at` is stored; the UI shows it in the business timezone (e.g., "Your trial ends Thu, Nov 6 at 3:42 PM CT").
- **No credit card required** to start (current preference; revisit if abuse appears).
- **Includes** all paid features available at the time.
- **Disclosed** on the pricing page, at sign-up, and in-app: duration, end time, what's included, what happens at the end, that no data is deleted at trial end, and how to subscribe.
- **In-app reminders:** banner throughout the trial; prominent from 3 days before; on the last day. (Email reminders only once email is available.)
- One trial per business; operator can extend a trial manually.

### 12.4 Account states and access

| State | Dashboard | Booking page | Customer status links | Export |
|---|---|---|---|---|
| `pilot` | Full | Accepting (if switched on) | Full | ✅ |
| `trialing` | Full | Accepting | Full | ✅ |
| `active` | Full | Accepting | Full | ✅ |
| `past_due` (grace, e.g., 7 days — confirm with billing provider behavior) | Full + banner | Accepting | Full | ✅ |
| `trial_expired` / `inactive` (subscription ended or grace elapsed) | **Restricted:** read-only; can view all data, export, subscribe, manage account, request deletion | **Not accepting new requests**; shows the business's phone/email | Show current status; customers can still withdraw/cancel (frees the owner's calendar); accept-proposal disabled with "Contact [Business]" | ✅ |
| `cancelled` (cancels at period end) | Full until period end, then `inactive` | Until period end | Full | ✅ |
| `suspended` (operator, abuse/terms) | Blocked except export & support contact | Offline | Generic "not available" | ✅ (on request) |

Restricted access is enforced in the server layer **and** in RLS write policies (`can_write`). Subscribing restores full access immediately, with all data intact.

### 12.5 Data retention after access ends (proposal — requires approval and legal review before disclosure)

- **No data is deleted when a trial ends or a subscription lapses.**
- Restricted accounts are retained for **180 days** after access ends. The owner can subscribe and continue at any time during this period.
- Before deletion, the owner is notified in-app and — once email is available — by email at **30 days** and **7 days** prior.
- After 180 days, business data is hard-deleted; backups rotate out per provider retention (disclosed).
- An owner may request earlier deletion at any time (§7.11): booking page offline immediately; hard deletion after a **30-day** grace period during which they can cancel the request.
- **Automated deletion jobs are not enabled** until the policy is approved, disclosed in Terms/Privacy, and pre-deletion notices can be reliably delivered.

---

## 13. Acceptance criteria

Every feature is done only when it passes on a **375 px phone**, a **768 px tablet** and a **1280 px desktop**, meets `DESIGN_SYSTEM.md` §12 (accessibility), and has the automated tests marked 🧪.

### 13.1 Accounts and authentication (Supabase Auth)

- [ ] Pilot sign-up works only with a valid invite; invalid/used invites show a clear message. 🧪
- [ ] Sign-up, email confirmation, sign-in, sign-out and password reset work through Supabase Auth; no custom password storage exists in our schema. 🧪
- [ ] Unconfirmed owners cannot publish the booking page; the UI explains why.
- [ ] Wrong credentials produce a generic error; repeated attempts are rate-limited. 🧪
- [ ] Authenticated routes redirect to sign-in and back. 🧪

### 13.2 Onboarding and services

- [ ] Onboarding can be completed in under 10 minutes in a moderated test; progress persists across sessions.
- [ ] No service is created with a price the owner didn't enter; starter suggestions contain names only. 🧪
- [ ] Fixed requires a price; "From" requires a price and displays "From $X"; "Quote required" hides price and routes to the inquiry form. 🧪
- [ ] Only services marked **bookable** appear on the booking page. 🧪
- [ ] Size-class overrides apply on the booking page and in totals. 🧪
- [ ] Editing a service never changes existing requests, appointments or quotes. 🧪

### 13.3 Availability and slots

- [ ] Owners can set multiple windows per weekday, time off (full day, range, partial day), interval, notice, horizon, buffer, daily cap and hold setting.
- [ ] Slot tests cover windows, duration fit, notice, horizon, buffer, cap, time off, holds on/off, and outstanding proposals. 🧪
- [ ] Changing availability never modifies existing appointments. 🧪

### 13.4 Public booking page and request submission

- [ ] Only allow-listed public fields are returned; no private data appears in HTML or network responses. 🧪
- [ ] A request can be completed on a phone in ≤ 6 steps without horizontal scrolling, with correct keyboard types.
- [ ] Only valid slots are offered; if a slot becomes unavailable before submit, the customer is told and asked to pick another. 🧪
- [ ] Prices and durations are recomputed server-side; client totals are ignored. 🧪
- [ ] Phone or email required; consent required; phone normalized to E.164 (US numbers). 🧪
- [ ] Confirmation says "not confirmed yet", explains next steps, and shows the status link with Copy. 
- [ ] Booking page LCP < 2.5 s on simulated mid-range phone / 4G.

### 13.5 Booking workflow — approve, decline, propose

- [ ] Approve creates exactly one appointment, links/creates customer and vehicle within the same business, and updates the status page. Retrying never duplicates. 🧪
- [ ] Propose sets `time_proposed`, holds the time, sets an expiry, and shows Accept/Decline on the status page. 🧪
- [ ] Customer accepting a proposal creates the appointment if hard rules pass; otherwise the request returns to pending, the customer sees a clear message, and the owner is notified. 🧪
- [ ] Decline stores optional customer message (shown on status page) and internal reason (never shown); "Save as lead" creates a lead. 🧪
- [ ] Each request status shows the headline, next step and actions defined in §6.3. 🧪

### 13.6 Duplicate requests

- [ ] Resubmitting with the same idempotency key returns the original request; no new row. 🧪
- [ ] A second open request with the same normalized phone or email for the same business is flagged and linked; different businesses are never linked. 🧪
- [ ] The 4th open request from the same contact for the same business is rejected with a generic message that does not reveal existing requests. 🧪
- [ ] "Close as duplicate" sets `closed_duplicate` and the status page shows the combined message. 🧪
- [ ] Rate limit and honeypot reject automated submissions. 🧪

### 13.7 Cancellations

- [ ] Customer can withdraw a pending/time-proposed request; any hold is released; owner notified. 🧪
- [ ] Customer can cancel an approved appointment only before the cutoff (and only if self-cancel is enabled); after the cutoff the page shows policy and contact options. Tests cover exactly-at-cutoff. 🧪
- [ ] Owner cancellation records reason and `cancelled_by = business`, frees the slot, and updates the status page. 🧪
- [ ] No-show can only be set after the start time. 🧪

### 13.8 Rescheduling

- [ ] Owner reschedule enforces hard rules, warns on soft rules, keeps previous time in history, and shows "Time changed" with old and new times on the status page. 🧪
- [ ] Rescheduling doesn't change recorded prices. 🧪
- [ ] Status page offers no self-reschedule; it shows contact options and cancel (before cutoff).

### 13.9 Conflicts

- [ ] The database rejects any overlapping Scheduled/In-progress appointments for the same business, including under concurrent approval attempts (parallel test). 🧪
- [ ] Appointments of **different** businesses may overlap freely. 🧪
- [ ] Soft-rule violations (buffer, hours, time off, cap, notice, holds) show specific warnings and require explicit confirmation. 🧪
- [ ] Approval blocked by a hard conflict offers "Propose a different time".

### 13.10 Time zones and DST

- [ ] Slots and appointments display correctly in Eastern, Central, Mountain, Arizona (no DST), Pacific, Alaska and Hawaii zones. 🧪
- [ ] Spring-forward: no slot in the missing hour; a job spanning the change keeps its real duration. 🧪
- [ ] Fall-back: repeated-hour slots are distinct instants with abbreviations. 🧪
- [ ] Public pages always state the business's timezone; a notice appears when the visitor's device zone differs.
- [ ] Changing the business timezone warns, lists affected future appointments, and keeps their absolute instants. 🧪
- [ ] "Today", daily caps, expiry and analytics periods use the business's local day. 🧪

### 13.11 Appointments and calendar

- [ ] Day, Week (≥ 768 px) and Agenda views show correct local times; tentative holds are visually distinct.
- [ ] Allowed transitions only: Scheduled → In progress → Completed; Scheduled/In progress → Cancelled; Scheduled → No-show (after start); Completed → Scheduled only with confirmation. 🧪
- [ ] Completion records per-item recorded amounts; wording says "recorded", never "charged"/"collected".
- [ ] Addresses open maps; phone numbers open call/text.

### 13.12 Customers and vehicles

- [ ] Manual creation of customers and vehicles with only the fields in §9.7. 🧪
- [ ] Search by partial name, phone (any format), email or plate returns within 300 ms for 5,000 customers. 🧪
- [ ] Duplicate suggestions search only within the current business. 🧪
- [ ] Archive hides without losing history; delete removes PII and anonymizes past appointments. 🧪

### 13.13 Leads, quotes and communication log

- [ ] Inquiries create leads, never booking requests; booking requests never appear in the leads list unless saved as a lead. 🧪
- [ ] Lead status automation: Contacted on first outbound log (from New), Quote sent on quote sent, Follow-up due when `next_follow_up_at` passes without an inbound log, Booked on appointment creation. Manual override always possible and recorded. 🧪
- [ ] Lost requires a reason.
- [ ] Quote numbers are sequential per business; totals computed in cents server-side; Expired set automatically after valid-until. 🧪
- [ ] Quoted value, booked job value and recorded revenue are stored in separate fields and never overwrite each other. 🧪
- [ ] Communication entries can be added manually with channel, direction, time and summary; entries from templates are created only after the owner confirms "Did you send it?". 🧪

### 13.14 Follow-ups and templates

- [ ] Owners can create, edit, complete (with outcome), dismiss and reschedule tasks.
- [ ] Automatic rules create each task exactly once per trigger and can be turned off. 🧪
- [ ] Templates are editable; placeholders render with record data; missing values are highlighted and block copying until edited. 🧪
- [ ] No feature sends a message automatically; all copy says "Open in Messages" / "Open in Mail" / "Copy". 🧪 (copy lint)

### 13.15 Notifications

- [ ] Each event in §10 creates exactly one notification for the correct business only. 🧪
- [ ] Badges update on navigation and via polling while visible; read/unread state persists.
- [ ] No email/SMS/push is sent.

### 13.16 Analytics

- [ ] Every metric in §11 matches its reference SQL query on seeded data. 🧪
- [ ] Rates under the threshold show "Not enough data yet" with the count. 🧪
- [ ] The "after a logged follow-up" metric displays the non-causation note.
- [ ] Quoted, booked and recorded values are labelled distinctly everywhere.
- [ ] Production accounts never show sample data. 🧪

### 13.17 Authorization and data isolation

- [ ] For every server action and route, Business A's owner receives 404 for Business B's IDs on read, update, delete and linking. 🧪
- [ ] pgTAP: as an authenticated user of Business A, direct table queries (bypassing app code) return zero Business B rows and writes fail. 🧪
- [ ] pgTAP: `anon` has no direct access to business tables; definer functions return only allow-listed fields. 🧪
- [ ] CI fails if any table lacks RLS or policies. 🧪
- [ ] CI fails if the service-role key or other secret patterns appear in the client bundle. 🧪
- [ ] Linking a record to another business's customer/vehicle fails at the database level. 🧪
- [ ] Token endpoints return only the one request/quote and reject guessed or revoked tokens generically. 🧪

### 13.18 Pilot, trial and subscription *(trial and subscription criteria apply at paid launch)*

- [ ] Pilot businesses see "Pilot access until [date]" and never the words "free trial". 🧪
- [ ] Trial end equals start + 7 days exactly and is displayed in the business timezone. 🧪
- [ ] At expiry: dashboard read-only (server and RLS), export works, booking page not accepting requests, status links still show status, **no rows deleted**. 🧪
- [ ] Subscribing restores full access with all data. 🧪
- [ ] Billing webhooks are signature-verified and idempotent. 🧪
- [ ] No automated deletion job runs unless the retention policy flag is enabled. 🧪

### 13.19 Settings, export and deletion

- [ ] CSV export opens correctly in Excel and Google Sheets (UTF-8 BOM, ISO dates) and works in restricted states. 🧪
- [ ] Deletion request requires typing the business name, takes the booking page offline, and schedules deletion per §12.5. 🧪

### 13.20 Marketing site

- [ ] Every claim maps to a shipped feature; reviewed before each publish.
- [ ] No testimonials, logos, ratings, user counts or performance statistics unless real and documented.
- [ ] "7-day free trial" copy appears only after §3.2 is complete.
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility 100, Best Practices ≥ 95.

---

## 14. Architecture, budget and assumptions to verify

### 14.1 Principles

One deployable web app, one managed Postgres database, no microservices or queues; server-rendered by default; boring, well-documented tools; free or low fixed-price tiers; nothing billed per message.

### 14.2 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language, typed domain |
| Framework | Next.js (App Router), server components and server actions | Marketing site, public pages and dashboard in one app |
| Database | **Supabase Postgres** | Managed Postgres, RLS, `pg_cron`, backups on paid plan |
| Auth | **Supabase Auth** (`@supabase/ssr` for server-side sessions) | No hand-built password handling |
| Data access | `supabase-js` with generated TypeScript types; complex operations as SQL functions | RLS applies automatically with the user's session |
| Migrations | Supabase CLI SQL migrations in the repo | Reviewable, reproducible schema and policies |
| Scheduled jobs | `pg_cron` in the database | No dependency on host cron limits; no exposed endpoint |
| Validation | Zod | Shared client/server validation |
| UI | Hand-built components on accessible headless primitives (e.g., Radix UI); styling bound to our tokens only | Accessible, distinctive |
| Icons | Lucide | Consistent line icons |
| Dates | A timezone-aware library (e.g., `date-fns-tz` or a Temporal polyfill) | DST-correct |
| Testing | Vitest, Playwright, pgTAP, axe-core | §16.2 |
| CI | GitHub Actions | Lint, types, tests, RLS checks, bundle secret scan |

### 14.3 Estimated monthly cost

Figures are planning estimates as understood at the time of writing. **Nothing is purchased or registered until explicitly approved.**

| Item | Development | Pilot with real business data | Public paid launch |
|---|---|---|---|
| Hosting (Vercel) | $0 (Hobby) | ~$20 (Pro — Hobby is non-commercial) | ~$20 |
| Supabase | $0 (Free) | ~$25 (Pro — backups, no inactivity pausing) | ~$25 |
| Auth email (custom SMTP) | $0 (default sender for testing) | $0 (default sender / invites — verify) | $0 on a free tier (provider TBD) |
| Domain | — | Decision needed (≈$15–25/yr) | ≈$1–2/mo |
| Billing provider | — | — | No monthly fee expected; % of subscription revenue |
| Error monitoring (optional) | $0 | $0 free tier | $0 free tier |
| **Total** | **$0** | **≈ $45/month** | **≈ $45–47/month + billing fees** |

### 14.4 Assumptions that must be verified before launch

| # | Assumption | Why it matters | Verify |
|---|---|---|---|
| A-1 | Vercel Hobby prohibits commercial use; Pro is ~$20/user/month | Pilots are commercial use | Current Vercel terms & pricing; alternatively confirm whether another host's free tier permits commercial use with Next.js |
| A-2 | Supabase Free pauses inactive projects, has limited database size, and doesn't provide the backups we need | Real customer data needs backups | Current Supabase plan limits; Pro price and backup retention |
| A-3 | `pg_cron` is available on our Supabase plan | Scheduled expiry and follow-up jobs | Supabase extension docs |
| A-4 | Supabase's default auth email sender is rate-limited and intended for testing | Sign-up/reset emails could fail at scale | Current limits; choose custom SMTP provider and free-tier limits before public launch |
| A-5 | Supabase Auth features we rely on (invites, email confirmation, password policy, leaked-password protection, MFA) are on our plan | Security baseline | Plan feature matrix |
| A-6 | No file storage is needed in the MVP | Storage costs | Confirm no uploads are in scope |
| A-7 | Bandwidth, function execution and database egress stay within included quotas for ~100 businesses | Cost ceiling | Usage estimates after pilot; set spend alerts/caps |
| A-8 | Billing provider has no fixed monthly fee and acceptable % fees | Margin | Provider pricing at paid launch |
| A-9 | Booking links on a platform subdomain will change when a domain is bought | Detailers will have shared links | Decide domain timing before pilots share links widely; plan redirects |
| A-10 | Free bot protection (e.g., Turnstile) remains free | Spam | Only if needed |

Set usage alerts and spend caps on every provider where available.

### 14.5 Repository structure (proposed)

```
/app            Next.js routes: (marketing), (auth), onboarding, app/*, b/[slug], r/[token], q/[token]
/src/domain     Pure logic: slots, DST, pricing, transitions, metrics (no I/O)
/src/data       Server-only data access using the user's Supabase session
/src/ui         Design-system components and tokens
/src/config     Brand and product configuration (name, wordmark, support email)
/supabase       migrations/, RLS policies, SQL functions, pgTAP tests, seed (dev only)
/tests          unit, e2e, isolation
/docs           Plans, decisions (docs/decisions/), pilot terms drafts
```

---

## 15. Customer acquisition plan

### 15.1 Target

Independent **mobile detailers and small detailing shops** in the US who already take bookings by text/DM and have steady weekly work. Start with 1–3 metro areas to allow in-person visits if useful.

### 15.2 Finding prospects (manual, respectful)

- Google Maps / Google Business Profiles for "mobile detailing" in target areas.
- Instagram and Facebook business pages (local hashtags, local car groups), following each platform's rules.
- Local car meets and detailing supply stores.
- Maintain a simple prospect sheet: business, contact channel, notes, last contact, outcome. **No scraping tools, no automated DMs, no purchased lists.**

### 15.3 Outreach

- **Personalized** email and social messages, written individually: reference something specific (their service menu, recent work), state who we are, ask for a 20-minute conversation about how they handle bookings. No fake urgency, no claims about features that don't exist.
- **Email compliance (CAN-SPAM):** accurate sender and subject, identify the message as a business contact, include a physical mailing address and a working opt-out; honor opt-outs promptly. *(Legal confirmation recommended.)*
- At most one follow-up per prospect unless they reply.

### 15.4 Discovery and pilot

1. **Discovery call** (no pitch first): how requests arrive today, what gets missed, how they quote, follow-up habits, tools used, what they pay for software.
2. If there's fit → offer the **pilot** with written pilot terms (§12.2). Prefer a **paid** pilot (even small) to validate willingness to pay; pricing to be decided.
3. Onboard together (screen share or in person); observe the first week.
4. Weekly 15-minute feedback check-in; log requests against the intake rule (§3.4).

### 15.5 Funnel metrics (tracked manually)

Prospects contacted → replies → discovery calls → pilots started → pilots active after 4 weeks → paying. Review weekly; adjust messaging and the target segment, not the feature list, first.

### 15.6 Expansion criteria

Expand outreach and consider the paid launch when: ≥ 3 businesses are paying, ≥ 5 are actively using it weekly, and no pilot reports a blocking issue that isn't scheduled.

---

## 16. Implementation phases and testing

### 16.1 Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** | Repo, CI, design tokens & core components, Supabase project (local via CLI), schema v1, RLS + pgTAP, Supabase Auth, membership model, audit log, isolation test harness, bundle secret scan | Sign in → empty dashboard shell on phone/tablet/desktop; all isolation and RLS tests green |
| **1. Setup & booking page** | Onboarding, services, size classes, availability, slot engine (DST), public booking page, request submission, status page (pending state) | Real detailer configures menu; a request is submitted from a phone |
| **2. Booking workflow & calendar** | Inbox, approve/decline/propose, duplicates, holds, conflicts (exclusion constraint), appointments, calendar, cancel/reschedule, full status page, Today, in-app notifications | Every row of §6.3 demonstrable end to end |
| **3. Customers & vehicles** | Manual entry, search, detail pages, matching, archive/delete | Owner enters 20 existing customers comfortably on a phone |
| **4. Leads, quotes, follow-ups** | Leads & statuses, quotes, share/print, communication log, templates, tasks & rules, scheduled jobs | Inquiry → lead → quote → follow-up → booked, with log entries |
| **5. Analytics, settings, export** | Metric catalog, definitions, thresholds, settings, CSV export, deletion request | Metrics match reference queries |
| **6. Hardening & pilot** | Security review, rate limits, CSP, restore drill, accessibility audit, performance, marketing site (pilot stage), legal pages, pilot terms | 3–5 pilots invited |
| **7. Paid-launch readiness** | Billing integration, 7-day trial enforcement, account states and RLS `can_write`, retention policy & notices, custom SMTP, legal review, public sign-up, trial copy | All §13.18 criteria pass; legal sign-off |
| **Later** | §3.3 items by evidence | — |

### 16.2 Testing strategy

| Level | Tooling | Coverage |
|---|---|---|
| Unit | Vitest | Slots, DST, pricing, totals, status transitions, cutoffs, duplicate detection, template rendering, metric calculations; ≥ 90% of `/src/domain` |
| Database | pgTAP via Supabase CLI | RLS per table and command as owner A/B and `anon`; definer function outputs; exclusion constraint; composite FKs; immutable `business_id`; scheduled jobs |
| Isolation | Vitest + Playwright | Two seeded businesses; every route/action attempted cross-business → 404 |
| Concurrency | Integration tests | Parallel approvals/accepts for overlapping times → exactly one succeeds |
| End-to-end | Playwright (phone, tablet, desktop projects) | Onboarding; request on phone; approve; propose → accept; decline; withdraw; cancel before/after cutoff; reschedule; inquiry → quote → booked; export; restricted state (phase 7) |
| Accessibility | axe-core + manual keyboard/VoiceOver/TalkBack per phase | Zero serious/critical violations |
| Performance | Lighthouse CI | Booking page and home budgets |
| Security | Dependabot, `npm audit`, secret scan, Supabase advisor, OWASP ASVS L1 subset review | Before pilot and paid launch |
| Copy | Lint for banned claims ("sent", "charged", "free trial" during pilot, "AI") in UI strings | Every PR |
| Usability | 3–5 sessions with real detailers per phase | Task completion without help |

Test data is fictional (`555-01xx` numbers) and never copied from real customers.

---

## 17. Decisions, open questions and risks

### 17.1 Decisions (confirmed in this revision)

| # | Decision |
|---|---|
| D-1 | United States only (USD, US timezones, US phone formats, English) |
| D-2 | Supabase Auth; no custom password authentication |
| D-3 | Supabase RLS as a database-level isolation layer, plus server authorization and composite FKs |
| D-4 | Owner approves, declines or proposes a time; requests are never confirmed bookings |
| D-5 | Each business defines its own services, prices and durations; no default prices |
| D-6 | Leads/inquiries and quotes tracked separately from booking requests |
| D-7 | No automated SMS, email or social messages in the MVP; templates + owner's own apps |
| D-8 | In-app notifications only in the MVP; owner email notifications later |
| D-9 | CSV import later unless pilots show it's essential; CSV export in MVP |
| D-10 | No customer deposits or payments; subscription billing built before public paid launch |
| D-11 | 7-day free trial, no card (current preference), at public paid launch only |
| D-12 | Pilot program before paid launch, under written pilot terms, never described as a trial |
| D-13 | No automatic data deletion at trial end |
| D-14 | Provisional, configurable branding; no spending |
| D-15 | Next.js + Supabase (Postgres, Auth, pg_cron) on Vercel; target ≈ $45/month |

### 17.2 Decisions proposed in this plan (please confirm)

| # | Proposal |
|---|---|
| P-1 | Pending requests **don't** hold slots by default; owner can enable holding (48 h max) (§6.4) |
| P-2 | Owner-proposed times **always** hold the slot until answered or expired (default 48 h) |
| P-3 | Customer self-cancel allowed until 24 h before start by default; owner configurable |
| P-4 | Max 3 open requests per contact per business |
| P-5 | Retain restricted accounts for 180 days after access ends, with notices at 30 and 7 days (§12.5) |
| P-6 | Owner-requested deletion completes after a 30-day grace period |
| P-7 | Unlinked closed requests purged after 12 months; notifications after 90 days; audit events after 12 months |
| P-8 | Rates need ≥ 5 items before displaying a percentage |
| P-9 | `past_due` grace period of 7 days (to align with billing provider behavior) |
| P-10 | Pilot fee collected manually outside the product, if any |

### 17.3 Branding

- "DetailerHQ" lives only in `/src/config` (name, short name, wordmark text, support email) and is never hard-coded in components, copy files or database values.
- The booking page shows the **detailer's** brand; our name appears only in a small "Powered by" footer link.
- No logo commissioned, no domain or social handles purchased, no trademark filings until the name is cleared and spending is approved.
- Before public launch: trademark search, domain and handle availability, then final naming decision.

### 17.4 Open questions

1. **Pilot pricing:** free or paid pilot? If paid, amount and manual payment method?
2. **Subscription price** for the paid launch, and one plan or two?
3. **Domain timing:** pilots will share booking links — buy a domain (after name clearance) before pilots, or accept a link change later with redirects?
4. **Trial start:** at business creation (proposed) or at email confirmation?
5. **Mobile vs. shop mix** among first pilots — affects address and service-area handling.
6. **Multi-vehicle visits** (two family cars): common enough to support in one request?
7. **Retention periods** in P-5 to P-7 — acceptable before legal review?
8. **Who are the first 10–20 prospects**, and which metro areas?
9. **Tax lines on quotes:** needed in target states, or leave as optional estimated line?

### 17.5 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-business data leak | Fatal to trust; legal exposure | Server checks + forced RLS + composite FKs; pgTAP and isolation suites block deploys; no service-role key in request handlers |
| Misconfigured RLS or exposed table via Supabase's Data API | Data exposure | CI catalog check, `anon` grants revoked, Supabase advisor before release |
| Service-role key leakage | Full database compromise | Server-only module, not used in request handlers, bundle scan, key rotation procedure |
| Customers think a request is a booking | Bad experiences | Explicit copy and status page; owner message templates include status link |
| Customers never see status updates (no messaging) | Missed proposals, no-shows | Status link emphasized; owner prompted to contact customer; proposal expiry; later email |
| Owners miss requests (in-app only) | Lost jobs, churn | Today screen, badges, polling, home-screen install, pending-request task rule; owner email first post-MVP |
| Timezone/DST bugs | Wrong-time appointments | UTC storage, business-zone calculation, explicit DST tests across US zones |
| Free-tier/pricing changes | Budget overrun | §14.4 verification, spend alerts, portable Postgres |
| Pilot misrepresented as a trial | Trust and consumer-protection issues | Written pilot terms; copy lint; trial copy gated on §3.2 |
| Data deleted unexpectedly after trial | Severe trust damage | No deletion at trial end; deletion jobs disabled until policy approved and notices exist |
| Brand not cleared | Rebrand cost, legal dispute | Config-only branding, no spend |
| Feature creep (SMS, payments, deposits) | Delay and cost | Intake rule (§3.4); "later" list |
| Spam on public forms | Inbox noise | Rate limits, honeypot, open-request cap, optional bot challenge |
| Outreach seen as spam | Reputation, platform bans | Personalized manual messages, CAN-SPAM compliance, one follow-up max |
| Legal/privacy gaps (processor role, state laws) | Compliance risk | Legal review before paid launch; data minimization |
| Single developer | Maintenance stalls | Simple architecture, docs, tests, decision records |
