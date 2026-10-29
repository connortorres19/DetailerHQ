# DetailerHQ — Product Plan

> **Status:** Draft for review · **Last updated:** 2026-10-29
> **Working name:** DetailerHQ. The name is *not* legally or commercially cleared. Treat it as a placeholder everywhere: keep it in a single config value, do not commission a logo, and do not buy paid brand assets until clearance is done (see §13).

---

## Contents

1. [Summary](#1-summary)
2. [Target customer and problems](#2-target-customer-and-problems)
3. [MVP scope](#3-mvp-scope)
4. [User roles and permissions](#4-user-roles-and-permissions)
5. [Pages and routes](#5-pages-and-routes)
6. [Key workflows](#6-key-workflows)
7. [Domain model](#7-domain-model)
8. [Security, privacy and data isolation](#8-security-privacy-and-data-isolation)
9. [Acceptance criteria](#9-acceptance-criteria)
10. [Architecture and operating cost](#10-architecture-and-operating-cost)
11. [Implementation phases](#11-implementation-phases)
12. [Testing strategy](#12-testing-strategy)
13. [Decisions, open questions and risks](#13-decisions-open-questions-and-risks)

---

## 1. Summary

DetailerHQ is a web application for independent auto detailers — mostly one- to three-person businesses, mobile or shop-based — that replaces the mix of text threads, Instagram DMs, paper notes and spreadsheets they use to run the business today.

The MVP does five things well:

1. Gives each business a **public booking page** where customers request an appointment for a specific service and vehicle.
2. Lets the owner **approve or decline** each request, which turns approved requests into scheduled appointments.
3. Keeps a clean record of **customers, vehicles, appointments, leads and quotes**, so nothing gets lost.
4. Surfaces **follow-up tasks** so the owner remembers to chase quotes and bring back past customers.
5. Shows **basic analytics computed only from what the business has actually recorded**.

The product does **not** send SMS, send email to customers, take payments or post to social media in the MVP. Where the owner needs to contact a customer, the app prepares the message and hands it to the owner's own phone (copy, `sms:`, `mailto:`, `tel:` links). This is a deliberate, honest constraint, and the marketing site must say so plainly.

### Success criteria for the MVP

| Goal | Measure |
|---|---|
| Genuinely useful | 5 detailers use it for real bookings for 4 consecutive weeks |
| Worth paying for | 3+ businesses convert to paid after the trial |
| Cheap to run | Hosting and services ≤ ~$50/month at up to ~100 businesses |
| Trustworthy | Zero cross-business data exposure; automated isolation tests pass on every deploy |

---

## 2. Target customer and problems

### 2.1 Primary customer

**Independent detailer, owner-operator.** Usually works alone or with one helper. Often mobile (works at the customer's home or office) or runs a small one- or two-bay shop. Earns most revenue from maintenance washes, interior/exterior details, paint correction and ceramic coatings. Spends the working day with wet hands and a phone, not at a desk.

Characteristics that shape the design:

- **Phone-first.** Most admin happens on a phone between jobs. Desktop is used for evening admin and quotes.
- **Low tolerance for setup.** If setup takes more than ~15 minutes, they won't finish it.
- **Already uses texting and Instagram.** We support those channels by recording where leads came from, not by replacing them.
- **Prices vary by vehicle size and condition.** A sedan and a three-row SUV are different prices; a heavily soiled interior needs a quote.
- **Few jobs per day** (typically 1–4), so each booking matters, and double-booking is very costly.
- **Price sensitive but will pay** for something that clearly wins or saves jobs.

### 2.2 Secondary users

- **The detailer's customers** — vehicle owners booking through the public page. They never create an account.
- **A helper or office manager** — *post-MVP* (see §4).

### 2.3 Problems we are solving

| Problem today | What DetailerHQ does |
|---|---|
| Booking requests arrive by text, DM, phone and website form; some get missed | One public booking page and one **Requests** inbox |
| Back-and-forth over "how much for my truck?" | Published service menu with prices by vehicle size and estimated durations |
| Double-booking or overbooking the day | Availability rules, buffers, daily job caps and conflict warnings before approving |
| No record of which car belongs to whom or what was done last time | Customer and vehicle records with service history |
| Quotes written in Notes app, never followed up | Structured quotes with a shareable link and an automatic follow-up task |
| Forgetting to bring back past customers | Follow-up tasks (e.g., "maintenance wash due") created from completed jobs |
| No idea which services or lead sources actually make money | Analytics built strictly from recorded appointments, quotes and leads |

### 2.4 Problems we are explicitly **not** solving in the MVP

Payments, payroll, inventory/chemical tracking, route optimisation, marketing automation, reviews management, and fleet/dealer accounts.

---

## 3. MVP scope

### 3.1 Included

| Area | Included capability |
|---|---|
| **Account & business** | Owner sign-up, email verification, sign-in, password reset; one business per owner; business profile (name, phone, email, timezone, service type: mobile / shop / both, service area description, shop address) |
| **Onboarding** | Guided setup: profile → hours → first services → booking page preview → publish |
| **Service menu** | Categories; services with description, price type (fixed / "from" / quote required), base price, estimated duration; optional price and duration per vehicle size class; add-ons; active/hidden toggle; display order |
| **Availability** | Weekly hours (multiple windows per day), start-time interval, minimum notice, booking horizon, buffer between jobs, max jobs per day, blocked dates / time off |
| **Public booking page** | Business profile, service menu, request-an-appointment flow, request-a-quote flow, request status page, owner-controlled "accepting requests" switch |
| **Requests** | Inbox of pending booking requests; approve (creates appointment) or decline; conflict warnings; customer matching on approval; "let the customer know" panel |
| **Appointments & calendar** | Day, week and agenda views; create appointments manually; statuses: Scheduled, In progress, Completed, Cancelled, No-show; record final price and a manual payment note on completion |
| **Customers & vehicles** | Customer list, search (name, phone, email, plate), customer detail with vehicles, appointments, quotes, notes; vehicle detail with service history |
| **Leads** | Pipeline list with statuses (New, Contacted, Quoted, Won, Lost) and source; created manually or from public quote requests |
| **Quotes** | Line-item quotes with per-business numbering, validity date, notes; statuses Draft, Sent, Accepted, Declined, Expired; shareable read-only link and print-friendly view; convert accepted quote to appointment |
| **Follow-up tasks** | Manual tasks; automatic tasks from rules (quote follow-up, post-job maintenance reminder); due-today list on the Today screen |
| **Analytics** | Requests, approval rate, completed jobs, recorded revenue, average job value, quote win rate, top services, lead sources, repeat customers — all from recorded data with date ranges |
| **Settings & data** | Business settings, account security, CSV export of customers/vehicles/appointments/quotes, account deletion request |
| **Marketing site** | Home, Pricing, Contact / early access, Terms, Privacy |

### 3.2 Explicitly excluded from the MVP

These will not be built, and **must not be mentioned as available** on the marketing site, in-app copy or sales conversations.

| Excluded | Why / what we do instead |
|---|---|
| Automated SMS to customers | Cost, carrier registration (10DLC/A2P), TCPA consent risk. Instead: prepared message + `sms:` link opening the owner's own messaging app. |
| Automated email to customers | Deliverability and compliance work. Instead: `mailto:` link and copy-to-clipboard. *(Owner-only notification email is a separate decision — see D-6.)* |
| Online payments, deposits, card on file, invoicing with payment | Cost and liability. Instead: owner records final price and a manual payment note ("Paid — card", "Unpaid"). Copy must say "recorded", never "collected". |
| Customer accounts / customer login | Unnecessary friction. Customers use unguessable status links. |
| Online quote acceptance / e-signature | Phase 2 candidate. MVP: owner marks quote accepted. |
| Instant (auto-approved) booking | Owners approve every request in v1. Data model allows auto-approve later. |
| Staff accounts, roles, scheduling multiple technicians | Post-MVP. Schema includes a membership table so this is additive. |
| Multiple locations per business | Post-MVP. |
| Google/Apple calendar sync | Post-MVP. A read-only iCal feed is a cheap Phase 2 candidate. |
| Social media posting, Instagram/Facebook inbox integrations | Out of scope. Lead *source* is recorded manually. |
| Photo uploads (before/after, damage photos) | Storage cost and moderation; Phase 2 candidate. |
| Route planning / travel time calculation | Owner sets a fixed buffer instead. |
| Reviews requests, loyalty, memberships, gift cards | Post-MVP. |
| Native mobile apps | Responsive web app; installable as a PWA (home-screen icon) only if trivial. |
| AI features | None. Do not market any. |
| Public API, Zapier | Post-MVP. |
| Dark mode for the dashboard | Deferred; tokens are structured to allow it. |

---

## 4. User roles and permissions

### 4.1 Roles

| Role | Who | Authenticates? | MVP? |
|---|---|---|---|
| **Owner** | The detailer who signed up | Yes (email + password) | ✅ |
| **Public visitor / customer** | Anyone with the booking link | No | ✅ |
| **Request holder** | A customer holding a request-status or quote link | No — possession of an unguessable token | ✅ |
| **Platform operator** | Us (DetailerHQ staff) | Yes, separate admin credentials | ✅ (no admin UI; scripted, audited) |
| **Staff member** | Helper / technician / office manager | Yes | ❌ Post-MVP |

### 4.2 Permission matrix (MVP)

| Capability | Owner | Public visitor | Request holder | Operator |
|---|---|---|---|---|
| View business's published booking page and active services | ✅ | ✅ | ✅ | ✅ |
| Submit booking or quote request | — | ✅ (rate-limited) | — | — |
| View status of one specific request | ✅ | — | ✅ (own request only) | — |
| View one specific shared quote | ✅ | — | ✅ (own quote only) | — |
| Read/write customers, vehicles, appointments, leads, quotes, tasks | ✅ own business only | ❌ | ❌ | Break-glass only, logged |
| Configure services, availability, booking page | ✅ own business only | ❌ | ❌ | ❌ |
| View analytics | ✅ own business only | ❌ | ❌ | Aggregate platform metrics only (counts, not PII) |
| Export data / request deletion | ✅ own business only | ❌ | ❌ | Executes deletion |
| Change subscription status (trial, active, paused) | ❌ | ❌ | ❌ | ✅ |

**Rules:**

- An Owner can belong to exactly one business in the MVP, but the relationship is stored in a `memberships` table with a `role` column so Staff can be added without migration pain.
- Operator access to tenant data is **break-glass only**: used to debug a reported issue with the owner's permission, recorded in the audit log with a reason.

---

## 5. Pages and routes

Route names are proposals. `[slug]` is the business's public booking handle; `[token]` is an unguessable random token (≥128 bits).

### 5.1 Marketing site (public)

| Route | Purpose |
|---|---|
| `/` | Home. Explains the product with real screenshots, the booking page, what's included and what isn't, pricing teaser, early access CTA. |
| `/pricing` | One or two plans, trial terms, FAQ (including "Does it send texts?" → "Not yet…"). |
| `/contact` | Early-access / contact form (stored in our DB; no third-party form service). |
| `/legal/terms` | Terms of Service. |
| `/legal/privacy` | Privacy Policy (covers both owners and their customers). |
| `/security` *(optional)* | Short, factual description of how data is isolated and protected. Only claims we can verify. |

### 5.2 Authentication

| Route | Purpose |
|---|---|
| `/sign-up` | Create owner account. During beta, gated by invite code (D-8). |
| `/sign-in` | Sign in. |
| `/verify-email` | Instructions and resend link after sign-up. |
| `/forgot-password` | Request reset email. |
| `/reset-password` | Set new password from emailed link. |

### 5.3 Onboarding

| Route | Purpose |
|---|---|
| `/onboarding` | Five-step setup: (1) Business profile & timezone, (2) Where you work — mobile / shop / both, service area, (3) Weekly hours & booking rules, (4) Add first services (with editable starter templates, prices left blank), (5) Preview booking page & publish. Progress is saved per step; owner can skip to dashboard. |

### 5.4 Business dashboard (authenticated, `/app/...`)

| Route | Purpose |
|---|---|
| `/app` | **Today.** Today's appointments in time order, pending requests count with oldest first, tasks due today/overdue, setup checklist until complete. The owner's home screen on the phone. |
| `/app/requests` | Inbox of booking requests. Tabs: Pending, Approved, Declined, All. Oldest pending first. |
| `/app/requests/[id]` | Request detail: requested service(s), vehicle, location, preferred time(s), customer contact, notes, availability check / conflicts, matched existing customer. Actions: Approve, Approve at different time, Decline. Then "Let the customer know" panel. |
| `/app/calendar` | Calendar with Day / Week / Agenda views (`?view=&date=`). Shows appointments and blocked time; pending requests shown as tentative. Mobile defaults to Agenda. |
| `/app/appointments/new` | Create an appointment directly (phone booking, repeat customer). |
| `/app/appointments/[id]` | Appointment detail: time, location, customer, vehicle, services and estimated price, status changes, completion (final price, payment note), internal notes, linked request/quote. |
| `/app/customers` | Searchable customer list (name, phone, email, plate). |
| `/app/customers/new` | Create customer (and optionally first vehicle). |
| `/app/customers/[id]` | Customer profile: contact details, vehicles, appointment history, quotes, leads, tasks, notes, lifetime recorded revenue. |
| `/app/vehicles/[id]` | Vehicle detail: year/make/model/trim, size class, color, plate, notes (e.g., "coated 2025-04"), service history. |
| `/app/leads` | Lead pipeline as a list (filter by status/source). A board view is optional and desktop-only. |
| `/app/leads/new`, `/app/leads/[id]` | Create / view lead: contact, vehicle info, what they want, source, status, activity notes, linked quote. |
| `/app/quotes` | Quote list with status filters and totals. |
| `/app/quotes/new`, `/app/quotes/[id]` | Quote editor: line items from service menu or custom, vehicle, validity, notes, terms; actions: mark sent (copy link / sms / mailto), mark accepted/declined, convert to appointment. |
| `/app/quotes/[id]/print` | Print-optimised quote (browser "Save as PDF"). |
| `/app/tasks` | All follow-up tasks: Overdue, Today, Upcoming, Done. |
| `/app/services` | Service menu: categories, services, add-ons; reorder; show/hide. |
| `/app/services/[id]` | Edit a service: name, description, price type, base price, per-size pricing & duration, add-ons, booking visibility. |
| `/app/availability` | Weekly hours, slot interval, notice, horizon, buffer, daily cap, time off / blocked dates. |
| `/app/booking-page` | Booking page settings: slug, intro text, policies (cancellation, prep instructions), accepting requests on/off, preview, copy link, downloadable QR code (generated locally). |
| `/app/analytics` | Analytics with date range (this month, last month, last 90 days, year to date, custom). |
| `/app/settings` | Business profile, contact details, timezone, vehicle size classes, follow-up rules. |
| `/app/settings/account` | Owner name, email, password, sign out of other sessions. |
| `/app/settings/data` | CSV export, account and data deletion request, data retention info. |

### 5.5 Public business pages (unauthenticated)

| Route | Purpose |
|---|---|
| `/b/[slug]` | Business booking page: name, short intro, service area / address, service menu with prices and durations, policies, buttons to request an appointment or a quote. If paused or not accepting: clear notice and phone/email to contact the business directly. |
| `/b/[slug]/book` | Multi-step request form: Service → Vehicle → Location → Time → Contact → Review. |
| `/b/[slug]/quote` | Quote request form for "quote required" services or general enquiries; creates a Lead. |
| `/r/[token]` | Request status: Pending / Approved (with date, time, location) / Declined (with optional message) / Cancelled. No other customer data. |
| `/q/[token]` | Read-only shared quote with business contact details. |

### 5.6 System pages

`404`, `500`, "booking page not found", "link expired or invalid", and a maintenance page — all styled, all with a clear next step.

---

## 6. Key workflows

### 6.1 Owner: sign-up and onboarding

1. Owner signs up with name, email, password (and invite code during beta).
2. Verifies email.
3. Onboarding step 1: business name, phone, contact email, timezone (defaulted from browser, confirmed).
4. Step 2: mobile / shop / both; service area description (free text, e.g., "North Austin, within 20 miles") and/or shop address.
5. Step 3: weekly hours (presets: "Mon–Sat, 8am–5pm"), start-time interval (default 60 min), minimum notice (default 24 h), horizon (default 60 days), buffer (default 30 min), max jobs/day (default 3).
6. Step 4: pick starter service templates (e.g., "Maintenance wash", "Interior detail", "Full detail", "Paint enhancement", "Ceramic coating — quote required"). **Prices are blank and must be entered** — we never pre-fill invented prices.
7. Step 5: preview booking page, choose slug, publish. Shown link, copy button and QR code.
8. Lands on **Today** with a setup checklist ("Share your booking link", "Add your existing customers").

### 6.2 Customer: request an appointment

1. Opens `/b/[slug]` from the business's Instagram bio, Google profile or a text.
2. Chooses a service (and optional add-ons). Prices shown according to the vehicle size they will pick ("from $180").
3. Enters vehicle: year, make, model (free text with suggestions), size class (with plain-language examples: "Mid-size SUV — e.g., RAV4, CR-V"), optional color and condition notes.
4. Chooses location: at their address (if business is mobile; address required, with a note on service area) or drop-off at the shop.
5. Picks a preferred start time from available slots; optionally one alternate.
6. Enters name, mobile phone, email (one of phone/email required; both recommended), contact preference, notes.
7. Ticks consent: "I agree that [Business] may contact me about this request" with links to the business's policy and our privacy policy.
8. Reviews summary: services, vehicle, estimated price and duration, preferred time. Submit text reads **"Send request"**, not "Book".
9. Confirmation screen: "Request sent. This is not confirmed yet. [Business] will contact you by phone or text to confirm." Shows a status link (`/r/[token]`) to bookmark.

### 6.3 Customer: request a quote

Same as 6.2 but without a time slot; adds "What do you need?" and an optional preferred timeframe. Creates a **Lead** with source "Booking page — quote request". Confirmation explains the business will respond with a quote.

### 6.4 Owner: review a booking request

1. Requests badge shows pending count. Owner opens the request.
2. Sees an **availability check**: whether the slot is still free, any overlap with appointments (including buffer), day's job count vs. cap, and whether the time is outside hours (possible if rules changed).
3. Sees **customer match**: "Possible existing customer: Jordan Reyes (same phone)". Owner can link to existing or create new. Vehicle matched similarly within the customer.
4. **Approve**: creates Appointment (Scheduled) with service snapshot and estimated price; creates/links Customer and Vehicle; request status → Approved.
   **Approve at a different time**: owner picks a new time; same outcome; status page shows the new time.
   **Decline**: optional message to customer (shown on status page) and optional internal reason; offers "Save as lead" so the contact isn't lost.
5. **Let the customer know** panel: prefilled message ("Hi Jordan, you're confirmed for a Full Detail on Sat, Nov 8 at 9:00 AM at 1234 Oak St. — Northside Detail Co."). Buttons: Copy, Text (`sms:`), Email (`mailto:`), Call (`tel:`). Owner can tick "Customer notified" (records timestamp). Nothing is sent by DetailerHQ.
6. Requests pending longer than 48 h are highlighted. Requests whose preferred time has passed are automatically marked **Expired** and listed separately.

### 6.5 Owner: day of the job

1. Opens **Today** on the phone: next appointment card with time, address (tap → opens maps app via a standard maps URL), customer phone (tap to call/text), vehicle, services, notes from last visit.
2. Marks **In progress** (optional), then **Complete**: confirms final price (defaults to estimate; editable with line adjustments), payment note (Unpaid / Paid — cash / card / transfer / other), internal job notes.
3. On completion, follow-up rule creates a task, e.g., "Maintenance wash reminder — Jordan Reyes, 2021 Tesla Model Y" due in 6 weeks (interval configurable per service).
4. Can mark **No-show** or **Cancelled** (with reason); cancellations frees the slot.

### 6.6 Owner: lead → quote → appointment

1. Lead arrives (public quote request) or is created manually ("Instagram DM — wants ceramic coating on new F-150").
2. Owner sets status Contacted, adds notes.
3. Creates a Quote from the lead: picks services/line items, adjusts prices, sets validity (default 14 days), adds terms.
4. Marks quote **Sent** using Copy link / Text / Email buttons (link goes to `/q/[token]`). Lead → Quoted. A follow-up task is created ("Follow up on Q-0012", due in 3 days, configurable).
5. When customer says yes, owner marks **Accepted** → "Schedule it" creates an appointment pre-filled from the quote; lead → Won; customer and vehicle are created/linked.
6. If declined or expired → lead → Lost with a reason (price, timing, went elsewhere, no response).

### 6.7 Owner: manual booking

Phone call from a repeat customer → **New → Appointment** → search customer → pick vehicle → pick services → pick time (availability shown, conflicts warned but owner may override with confirmation) → Save.

### 6.8 Owner: configure services and availability

- Services: add/edit/reorder; set price per size class or a single price; set duration per size class; mark "quote required" (shows on booking page with "Request quote" instead of time picker); hide without deleting (historic appointments keep their snapshot).
- Availability: edit weekly windows; add time off ("Nov 24–28, Holiday"); changes apply to future slot calculation only and never alter existing appointments.

### 6.9 Owner: analytics review

Owner opens Analytics, picks "Last month". Sees numbers with their definitions available on hover/tap (e.g., "Recorded revenue: sum of final prices on appointments marked Completed in this period"). If there's too little data (e.g., fewer than 5 completed jobs), the page says so rather than showing misleading percentages.

### 6.10 Owner: export and leave

Settings → Data → Export generates CSV files (zip) on demand. Deletion request: confirm by typing the business name; business is deactivated immediately (booking page offline), data hard-deleted after a 30-day grace period (D-10), backups age out per provider retention.

---

## 7. Domain model

### 7.1 Conventions

- Every tenant-owned table has a non-null **`business_id`**. No exceptions.
- Primary keys are random UUIDs (v4 or v7). Sequential numbers are never exposed in URLs. Human-friendly numbers (e.g., `Q-0012`) are display-only, unique per business.
- All timestamps stored in UTC (`timestamptz`); the business's IANA timezone (e.g., `America/Chicago`) is used for display and slot calculation. DST transitions must be tested.
- Money stored as integer **cents** with a currency code (`USD` by default; single currency per business).
- Soft-delete (`archived_at`) for customers, vehicles, services; hard delete only via the account deletion process.
- Appointments and quotes store a **snapshot** of service names, prices and durations at the time of creation so later menu edits don't rewrite history.
- `created_at`, `updated_at`, `created_by` on every table.

### 7.2 Entities

| Entity | Key fields (conceptual) | Notes |
|---|---|---|
| **User** | id, email, name, password (managed by auth provider), email_verified_at | Identity only; no business data here. |
| **Business** | id, name, slug, phone, email, timezone, service_mode (mobile/shop/both), service_area_text, shop_address, currency, account_status (trialing/active/paused/cancelled), accepting_requests, published_at | The tenant. |
| **Membership** | id, business_id, user_id, role (`owner`; later `staff`) | Unique (business_id, user_id). |
| **BookingSettings** | business_id, slot_interval_min, min_notice_min, horizon_days, buffer_min, max_jobs_per_day, hold_pending (bool), intro_text, policies_text, prep_instructions | 1:1 with Business. |
| **AvailabilityRule** | id, business_id, weekday (0–6), start_time, end_time | Multiple windows per weekday. Local wall-clock times. |
| **TimeOff** | id, business_id, starts_at, ends_at, label | Blocks slots. |
| **VehicleSizeClass** | id, business_id, name, description/examples, sort_order | Defaults: Car / Small SUV / Large SUV & Truck / Van. Editable. |
| **ServiceCategory** | id, business_id, name, sort_order | |
| **Service** | id, business_id, category_id, name, description, price_type (fixed / starting_at / quote_required), base_price_cents, base_duration_min, is_addon, is_public, sort_order, follow_up_after_days, archived_at | |
| **ServicePrice** | id, business_id, service_id, size_class_id, price_cents, duration_min | Optional overrides per size class. |
| **Customer** | id, business_id, first_name, last_name, phone (E.164), email, preferred_contact, address, notes, source, archived_at | Unique-ish matching on phone/email within business (not enforced unique — households share phones). |
| **Vehicle** | id, business_id, customer_id, year, make, model, trim, color, size_class_id, plate, vin (optional), notes, archived_at | |
| **BookingRequest** | id, business_id, status (pending/approved/declined/expired/cancelled), public_token_hash, requested_start, alternate_start, location_type, service_address, contact snapshot (name/phone/email), vehicle snapshot, notes, consent_at, ip_hash, decline_message, decided_at, decided_by, customer_id?, vehicle_id?, appointment_id?, customer_notified_at | Snapshot fields hold what the customer typed; links filled on approval. |
| **BookingRequestItem** | id, business_id, booking_request_id, service_id, name/price/duration snapshot | |
| **Appointment** | id, business_id, customer_id, vehicle_id, starts_at, ends_at, location_type, service_address, status (scheduled/in_progress/completed/cancelled/no_show), estimated_total_cents, final_total_cents, payment_note_status (unpaid/paid), payment_method_note, cancel_reason, completed_at, internal_notes, booking_request_id?, quote_id? | |
| **AppointmentItem** | id, business_id, appointment_id, service_id?, name, price_cents, duration_min, quantity | Snapshot lines; custom lines allowed. |
| **Lead** | id, business_id, status (new/contacted/quoted/won/lost), source (booking_page / phone / text / instagram / facebook / google / referral / walk_in / repeat / other), lost_reason, contact snapshot, vehicle description, request_text, customer_id?, public_token_hash? | |
| **Quote** | id, business_id, number (per business), status (draft/sent/accepted/declined/expired), customer_id?, lead_id?, vehicle_id?, vehicle_text, valid_until, notes, terms, subtotal_cents, discount_cents, total_cents, public_token_hash, sent_at, decided_at | |
| **QuoteItem** | id, business_id, quote_id, service_id?, name, description, price_cents, quantity, duration_min | |
| **Task** | id, business_id, title, due_at, status (open/done/dismissed), kind (manual / quote_follow_up / maintenance_reminder / request_follow_up), related_type, related_id, completed_at | Polymorphic link to customer / lead / quote / appointment, validated in application code. |
| **Note** | id, business_id, related_type, related_id, body, created_by | Timeline notes on customer/lead/appointment. |
| **AuditEvent** | id, business_id?, actor_type (owner/operator/system/public), actor_id, action, entity_type, entity_id, metadata (no PII payloads), ip_hash, created_at | Append-only. |
| **ContactSubmission** | id, name, email, business_name, message, created_at | Marketing-site enquiries; not tenant data. |

### 7.3 Relationships

```
User ──< Membership >── Business
                           │
   ┌───────────┬───────────┼─────────────┬──────────────┬──────────────┐
   │           │           │             │              │              │
BookingSettings  AvailabilityRule  TimeOff  VehicleSizeClass  ServiceCategory ──< Service ──< ServicePrice
                                                                                       │
Customer ──< Vehicle                                                                   │
   │  │                                                                                │
   │  └──< Appointment ──< AppointmentItem ──(snapshot of)─────────────────────────────┘
   │           ▲    ▲
   │           │    └── Quote ──< QuoteItem
   │           │          ▲
   │     BookingRequest   └── Lead
   │      ──< BookingRequestItem
   │
   └──< Task, Note (polymorphic: customer / lead / quote / appointment)
```

- A **BookingRequest** becomes at most one **Appointment** on approval.
- A **Lead** may have many **Quotes**; an accepted **Quote** may produce one or more **Appointments** (e.g., multi-day coating).
- A **Customer** has many **Vehicles**; an **Appointment** is for exactly one Vehicle in the MVP (multi-vehicle jobs = multiple appointments; revisit later).
- **Every** foreign key between tenant tables must reference a row in the **same business**. Enforce with composite foreign keys `(business_id, id)` so the database itself rejects cross-tenant references.

### 7.4 Slot calculation (conceptual)

For a requested date and total duration *D* (sum of selected services/add-ons for the chosen size class):

1. Take the business's availability windows for that weekday (local time).
2. Generate candidate start times every `slot_interval_min` such that `start + D ≤ window_end`.
3. Remove candidates earlier than `now + min_notice` or later than `today + horizon_days`.
4. Remove candidates overlapping `TimeOff`.
5. Remove candidates overlapping any Scheduled/In-progress appointment expanded by `buffer_min` on both sides (and pending requests too, if `hold_pending` is on).
6. If the day already has `max_jobs_per_day` scheduled appointments, remove all candidates for that day.

The public page shows only resulting start times — never other customers' details or why a slot is unavailable. Availability is re-checked at submission and again at approval.

---

## 8. Security, privacy and data isolation

### 8.1 Tenant isolation (non-negotiable)

Defence in depth — three independent layers, each of which must on its own prevent cross-business access:

1. **Application layer.** All tenant data access goes through a single data-access module that requires a `TenantContext` (business_id derived from the authenticated session's membership — never from a URL parameter, form field or header). Route handlers cannot call the database directly. A lint rule or code review checklist enforces this.
2. **Database layer — Row-Level Security.** RLS enabled and **forced** on every tenant table. Policies compare `business_id` to a per-transaction setting (e.g., `app.current_business_id`) set by the data-access module, or to the auth provider's JWT claim. The application connects with a role that **cannot bypass RLS**; migrations run under a separate owner role.
3. **Schema layer.** Composite foreign keys `(business_id, id)` prevent a row in one business referencing a row in another, even through a bug.

Additional rules:

- Lookups by ID always include the business filter; a record belonging to another business returns **404**, not 403 (don't confirm existence).
- Public pages resolve the business by slug and expose only explicitly public fields (allow-list serialisation).
- Public tokens (`/r/`, `/q/`) are 128+ bit random values; only a **hash** is stored; tokens expose exactly one record, scoped to that business; they can be revoked/regenerated by the owner.
- Background jobs (expiry, task generation) iterate per business and set tenant context explicitly.
- CSV exports are generated per business within tenant context and streamed directly; no shared temp storage.
- An automated **isolation test suite** (two seeded businesses; every endpoint and query attempted cross-tenant) runs in CI and blocks deploys on failure.

### 8.2 Authentication and sessions

- Email + password via a maintained auth provider/library (no hand-rolled crypto). Passwords hashed by the provider (bcrypt/argon2).
- Minimum 10-character passwords, checked against a common-password list; no composition rules.
- Email verification required before the booking page can be published.
- Sessions in `HttpOnly`, `Secure`, `SameSite=Lax` cookies; 30-day rolling session; "sign out other sessions" available.
- Rate limiting and progressive delays on sign-in, sign-up and reset endpoints.
- Password reset tokens single-use, expire in 60 minutes.
- Optional TOTP 2FA: post-MVP but planned.

### 8.3 Public endpoint protection

- Booking/quote request submission: per-IP and per-business rate limits, honeypot field, and a privacy-friendly challenge (e.g., Cloudflare Turnstile, free) when thresholds are exceeded (D-7).
- Server-side validation of every field (schema validation library); length limits on all text; phone normalised to E.164.
- Request submissions re-validate availability and service visibility server-side; client-provided prices are ignored and recomputed.

### 8.4 Web security baseline

- HTTPS only, HSTS.
- Content Security Policy (no inline scripts except nonced), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'` for app pages.
- CSRF protection for all state-changing requests (framework-native for server actions plus same-site cookies and origin checks).
- Output encoding by default (framework escaping); no `dangerouslySetInnerHTML` on user content. Owner-entered booking-page text rendered as plain text with line breaks — no HTML/Markdown in MVP.
- Dependency scanning (GitHub Dependabot, free) and lockfile committed.
- Secrets only in host environment variables; never in the repo.

### 8.5 Privacy

- **Roles under privacy law:** the business is the controller of its customers' data; DetailerHQ acts as processor/service provider. Terms and Privacy Policy must say this. (Legal review recommended before charging — see risks.)
- **Data minimisation:** collect only what's needed to perform the job — name, phone and/or email, service address (mobile only), vehicle details. VIN optional. No date of birth, no licence numbers, no payment card data.
- **No third-party tracking** on the public booking page or dashboard: no ad pixels, no session replay. Marketing site may use cookieless, privacy-friendly analytics only if cost allows (or none).
- **Logs:** no PII in application logs; IPs stored only as salted hashes for rate limiting/abuse; error monitoring configured to scrub request bodies.
- **Consent:** booking forms record consent timestamp for being contacted about the request. No marketing consent is collected because we don't send marketing.
- **Retention:** expired/declined requests without a linked customer purged after 12 months (configurable later). Audit events kept 12 months.
- **Rights requests:** owners can edit/delete a customer record (hard delete with confirmation, cascading to vehicles/notes; appointments anonymised to keep analytics totals). Export via CSV.
- **Account deletion:** immediate deactivation, hard deletion after 30 days, backup retention disclosed.

### 8.6 Auditing and operations

- Audit events for: sign-in, password change, request approve/decline, appointment status changes, data export, customer deletion, settings changes, any operator access.
- Daily automated database backups (provider-managed), with a documented and once-tested restore procedure before first paying customer.
- Error monitoring with PII scrubbing; uptime check on the booking page.

---

## 9. Acceptance criteria

Each feature is "done" when all criteria pass on **both** a 375 px-wide phone viewport and a 1280 px desktop viewport, meet the accessibility requirements in `DESIGN_SYSTEM.md` §12, and have automated tests where noted (🧪).

### 9.1 Account & authentication

- [ ] An owner can sign up with name, email and password and receives a verification email. 🧪
- [ ] An unverified owner can use onboarding but cannot publish the booking page; the UI explains why.
- [ ] Sign-in with wrong credentials shows a generic error ("Email or password is incorrect") and is rate-limited after repeated attempts. 🧪
- [ ] Password reset links expire after 60 minutes and work once. 🧪
- [ ] Signing out ends the session; "Sign out other sessions" invalidates other sessions. 🧪
- [ ] Authenticated pages redirect unauthenticated visitors to sign-in and back afterwards. 🧪

### 9.2 Onboarding

- [ ] A new owner can complete all five steps in under 10 minutes in a moderated test.
- [ ] Each step saves on continue; refreshing or returning later resumes at the last incomplete step.
- [ ] Starter service templates have **no prefilled prices**; the owner cannot publish a fixed-price service without a price.
- [ ] Slug must be unique, 3–40 chars, lowercase letters, numbers and hyphens; reserved words blocked. 🧪
- [ ] After publishing, the owner sees the full link, a copy button and a downloadable QR code.

### 9.3 Service menu

- [ ] Owner can create, edit, reorder, hide and archive services and categories.
- [ ] Price type "fixed" requires a price; "starting at" requires a price and displays "From $X"; "quote required" hides price and routes customers to the quote form. 🧪
- [ ] Per-size-class price/duration overrides take precedence over base values on the booking page and in totals. 🧪
- [ ] Editing a service's price does not change any existing appointment, request or quote totals. 🧪
- [ ] Add-ons can only be selected alongside a main service.

### 9.4 Availability

- [ ] Owner can set multiple windows per weekday, interval, notice, horizon, buffer and daily cap.
- [ ] Time off blocks slots for the whole range across days.
- [ ] Slot generation unit tests cover: windows, duration fit, notice, horizon, buffer both sides, daily cap, time off, pending holds, and DST start/end days in at least two US timezones. 🧪
- [ ] Changing availability never modifies existing appointments.

### 9.5 Public booking page and request flow

- [ ] `/b/[slug]` shows only active public services and public business fields; no private data appears in the HTML or network responses. 🧪
- [ ] Visitors can complete a request on a phone in ≤ 6 steps with no horizontal scrolling and with the keyboard type appropriate to each field (tel, email, numeric).
- [ ] Only valid slots are offered; if the slot becomes unavailable before submission, the customer is told and asked to choose another — no silent failure. 🧪
- [ ] Prices and durations shown match the server-computed totals; server ignores client-sent totals. 🧪
- [ ] Phone or email is required; phone numbers are normalised; consent checkbox required. 🧪
- [ ] On success, the confirmation screen clearly states the request is **not yet confirmed** and shows a status link.
- [ ] Submission is rate-limited and honeypot-protected; excessive submissions are rejected without revealing the limit. 🧪
- [ ] If the business is paused or not accepting requests, the page explains this and shows the business's phone/email instead of forms.
- [ ] Booking page LCP < 2.5 s on simulated mid-range phone / 4G (Lighthouse).

### 9.6 Requests inbox

- [ ] Pending requests appear within one page refresh of submission, oldest first, with a count badge in navigation.
- [ ] Request detail shows conflict warnings (overlap incl. buffer, daily cap, outside hours, time off). 🧪
- [ ] Approve creates exactly one appointment with snapshot items, links/creates customer and vehicle, sets status Approved, and records who/when. Double-clicking or retrying does not create duplicates (idempotent). 🧪
- [ ] "Approve at a different time" updates the appointment time and the customer's status page.
- [ ] Decline sets status Declined, optionally stores a customer-facing message (shown on status page) and optional internal reason, and offers "Save as lead".
- [ ] Requests whose requested time has passed while pending become Expired automatically. 🧪
- [ ] The "Let the customer know" panel produces correct `sms:`, `mailto:`, `tel:` links and copy text with the business's timezone-formatted date/time; DetailerHQ sends nothing itself.

### 9.7 Appointments & calendar

- [ ] Day, Week and Agenda views render appointments at correct local times, including across DST changes. 🧪
- [ ] Pending requests (if shown) are visually distinct from scheduled appointments and are not confused in counts.
- [ ] Owner can create an appointment manually; overlapping a confirmed appointment requires explicit confirmation.
- [ ] Status transitions allowed: Scheduled → In progress → Completed; Scheduled/In progress → Cancelled; Scheduled → No-show; Completed can be reopened to Scheduled only with confirmation (correcting mistakes). 🧪
- [ ] Completing requires a final price (defaults to estimate) and records a payment note; UI wording is "recorded", never "charged" or "collected".
- [ ] Address opens the device's maps app; phone number opens call/text.

### 9.8 Customers & vehicles

- [ ] Search finds customers by partial name, phone (any formatting), email or plate within 300 ms for 5,000 customers. 🧪
- [ ] Customer detail shows vehicles, upcoming and past appointments, quotes, leads, open tasks, notes, and lifetime recorded revenue (sum of completed appointments' final totals).
- [ ] Duplicate detection suggests existing customers on matching phone or email when creating a customer or approving a request.
- [ ] Archiving hides a customer from lists but keeps history; deleting (with typed confirmation) removes PII and anonymises historical appointments. 🧪
- [ ] Vehicle detail shows chronological service history.

### 9.9 Leads

- [ ] Public quote requests create a Lead with source "Booking page" and status New. 🧪
- [ ] Owner can create leads manually with any source and move them through statuses; Lost requires a reason.
- [ ] Creating a quote from a lead links them and sets lead status to Quoted (unless already Won/Lost).
- [ ] Converting a lead creates or links a Customer without duplicating existing ones.

### 9.10 Quotes

- [ ] Quote numbers are sequential and unique per business (Q-0001…), unaffected by other businesses. 🧪
- [ ] Totals = Σ(line price × qty) − discount, computed server-side in cents. 🧪
- [ ] Marking Sent sets `sent_at`, generates the share link, and creates a follow-up task per the business's rule. 🧪
- [ ] `/q/[token]` shows the quote and business contact info only; invalid/revoked tokens show a generic "link not valid" page. 🧪
- [ ] Quotes past `valid_until` while Sent become Expired automatically. 🧪
- [ ] The print view fits on US Letter and A4 without clipped content.
- [ ] "Schedule it" on an accepted quote opens a new appointment prefilled with customer, vehicle and quote items.

### 9.11 Follow-up tasks

- [ ] Owner can create, edit, complete, dismiss and reschedule tasks; tasks can link to a customer, lead, quote or appointment.
- [ ] Automatic tasks are created exactly once per trigger (quote sent; appointment completed for services with a follow-up interval). 🧪
- [ ] Today screen shows overdue and due-today tasks; overdue is marked with text, not only color.
- [ ] No automatic task ever sends a message to a customer.

### 9.12 Analytics

- [ ] Every metric has a written definition visible in the UI and matches a reference SQL query in tests using seeded data. 🧪
- [ ] Metrics: requests received; approval rate (approved ÷ decided); completed appointments; recorded revenue; average recorded job value; cancellations & no-shows; quote win rate (accepted ÷ (accepted + declined + expired)); top services by count and recorded revenue; leads by source and outcome; new vs. returning customers.
- [ ] Date ranges are applied in the business's timezone. 🧪
- [ ] With insufficient data the UI shows "Not enough data yet" with the underlying count rather than a percentage of a tiny sample (threshold: < 5 decided items for rates).
- [ ] No demo, sample or projected numbers are ever shown in production accounts.

### 9.13 Settings & data

- [ ] Owner can update business profile, timezone, size classes and follow-up rules; timezone changes warn that existing appointments keep their absolute time.
- [ ] CSV export includes customers, vehicles, appointments (with items), quotes (with items), leads, tasks; files open correctly in Excel and Google Sheets (UTF-8 BOM, ISO dates). 🧪
- [ ] Deletion request requires typing the business name, deactivates immediately, and schedules hard deletion. 🧪

### 9.14 Data isolation (cross-cutting)

- [ ] For every authenticated route and server action, a test signed in as Business A cannot read, list, create-linked, update or delete any Business B record; responses are 404. 🧪
- [ ] Direct database tests with the application role prove RLS blocks cross-tenant reads/writes even when the application filter is omitted. 🧪
- [ ] Attempting to link an appointment to another business's customer fails at the database level. 🧪

### 9.15 Marketing site

- [ ] All claims on the site correspond to shipped features; a checklist review is done before each publish.
- [ ] No fabricated testimonials, customer logos, user counts or ratings.
- [ ] Lighthouse: Performance ≥ 90, Accessibility 100, Best Practices ≥ 95 on Home and Pricing (mobile).

---

## 10. Architecture and operating cost

### 10.1 Principles

- **One deployable application**, one database. No microservices, no queues, no separate API server.
- **Boring, well-documented technology** with large communities.
- **Server-rendered by default**, minimal client JavaScript; the booking page in particular must be fast on poor mobile connections.
- **Managed services on free or low fixed tiers**; nothing priced per-message.

### 10.2 Proposed stack (recommendation — to confirm in review)

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | One language front to back; type-safe domain model. |
| Web framework | Next.js (App Router), React server components + server actions | Marketing site, public pages and dashboard in one app; SSR for speed and SEO. |
| Database | PostgreSQL (managed — Supabase or Neon) | Relational data, RLS for tenant isolation, mature tooling. |
| Data access | Drizzle ORM + SQL migrations in repo | Typed queries, readable SQL, explicit migrations; easy to set the per-transaction tenant setting for RLS. |
| Auth | Supabase Auth *or* an open-source library storing users in our Postgres (e.g., Better Auth / Auth.js) | Avoid hand-rolled auth. Decision D-3. |
| Validation | Zod schemas shared by forms and server | Single source of validation truth. |
| UI | Hand-built components on accessible headless primitives (e.g., Radix UI) + CSS variables / Tailwind configured **only** with our design tokens | Accessibility for free; visual identity entirely ours (no default theme). |
| Icons | Lucide (MIT) | Consistent, neutral line icons. |
| Dates | `date-fns` + `date-fns-tz` (or Temporal polyfill) | Timezone-correct slot logic. |
| Scheduled work | Host cron (e.g., Vercel Cron) calling one authenticated endpoint every 15 min | Expire requests/quotes, generate tasks. No queue needed. |
| Transactional email (auth only) | Provider free tier (e.g., Resend) via SMTP | Verification and password reset only. |
| Bot protection | Cloudflare Turnstile (free) | Only on public forms when needed. |
| Error monitoring | Sentry free tier with PII scrubbing | |
| Testing | Vitest, Playwright (E2E), axe-core | See §12. |
| CI | GitHub Actions (free minutes for small repos) | Lint, type-check, tests, isolation suite. |

### 10.3 Estimated monthly cost

Prices change; verify at the time of purchase. Nothing is purchased until approved.

| Item | Development | Production (first ~100 businesses) |
|---|---|---|
| Hosting (Vercel Pro — Hobby tier is non-commercial use only) | $0 (Hobby) | ~$20 |
| Postgres + auth + daily backups (Supabase Pro) | $0 (Free; pauses when idle) | ~$25 |
| Transactional email (auth emails only) | $0 | $0 (free tier) |
| Turnstile, Sentry, GitHub, Dependabot | $0 | $0 |
| Domain | — | ~$1–2 (≈$15–25/year) |
| **Total** | **$0** | **≈ $45–47/month** |

**Lower-cost alternative:** a single small VPS (≈ $5–15/month) running the app and Postgres in containers. Cheaper, but we'd own patching, backups, TLS and uptime. Not recommended for a team that should be spending time with customers.

**Billing for DetailerHQ itself:** during beta, invoice the first customers manually via Stripe Payment Links / Invoices (no monthly fee; per-transaction only) and set `account_status` by hand. Build in-app subscription billing only once there are enough customers to justify it (D-9).

### 10.4 Application structure (proposed)

```
/app            Next.js routes: (marketing), (auth), onboarding, app/*, b/[slug], r/[token], q/[token]
/src/domain     Pure business logic: slots, pricing, status transitions, metrics (no I/O; heavily unit-tested)
/src/data       The only module that talks to the database; requires TenantContext
/src/ui         Design-system components and tokens
/src/server     Auth, rate limiting, audit, cron handlers
/db             Schema, migrations, RLS policies, seed scripts (dev only)
/tests          unit, integration (DB + RLS), e2e, isolation
/docs           Planning and decision records
```

---

## 11. Implementation phases

Each phase ends with a demo on a real phone and a review before the next begins. Durations are rough for one developer working with Claude Code.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** (≈1 wk) | Repo, CI, lint/format, TypeScript strict, design tokens + core components (button, input, select, field, table, dialog/sheet, toast, badge, empty state), DB schema v1 with RLS and composite FKs, auth, tenant context, audit log, isolation test harness | Sign up → empty dashboard shell on phone & desktop; isolation tests green |
| **1. Setup & booking page** (≈1.5 wks) | Onboarding, services & size classes, availability, slot engine, public booking page and request flow, request status page | A real detailer configures their menu and a friend submits a request from a phone |
| **2. Requests, appointments, calendar** (≈1.5 wks) | Requests inbox, approve/decline, customer matching, notify panel, appointments, calendar views, completion, Today screen | Full loop: request → approve → appointment → complete |
| **3. Customers & vehicles** (≈1 wk) | Lists, search, detail pages, manual creation, duplicates, archiving/deletion, notes | Owner imports or enters 20 existing customers comfortably on a phone |
| **4. Leads, quotes, tasks** (≈1.5 wks) | Lead pipeline, quote editor, share and print views, follow-up rules, tasks page, cron jobs | Lead → quote → accepted → scheduled, with follow-up task |
| **5. Analytics, settings, export** (≈1 wk) | Analytics with definitions, settings, CSV export, deletion request | Metrics verified against reference queries |
| **6. Hardening & beta** (≈1–2 wks) | Security review, rate limits, CSP, backup restore drill, accessibility audit, performance pass, marketing site, legal pages, monitoring | Invite 3–5 detailers; weekly feedback calls |
| **Phase 2 candidates** | Owner notification emails (if not in MVP), online quote acceptance, iCal feed, photo uploads, staff accounts, auto-approve, 2FA, in-app subscription billing, SMS (with proper compliance) | Prioritised by beta feedback |

---

## 12. Testing strategy

| Level | Tooling | What it covers |
|---|---|---|
| **Unit** | Vitest | Domain logic: slot generation (incl. DST), pricing by size class, totals in cents, status transition rules, quote numbering, metric calculations, phone normalisation. Target ≥ 90% coverage of `/src/domain`. |
| **Integration (database)** | Vitest + disposable Postgres (local Docker or CI service) | Migrations apply cleanly; RLS policies block cross-tenant access using the app role; composite FKs reject cross-tenant links; idempotent approval; cron jobs expire correctly. |
| **Tenant isolation suite** | Vitest + Playwright | Two seeded businesses; automatically enumerate routes/actions and assert 404 for cross-tenant IDs. Mandatory, blocks deploy. |
| **End-to-end** | Playwright (mobile and desktop projects) | Onboarding; customer request on phone viewport; approve/decline; complete appointment; lead → quote → appointment; export. |
| **Accessibility** | axe-core in Playwright + manual keyboard and VoiceOver/TalkBack passes per phase | Zero serious/critical axe violations; manual checklist in `DESIGN_SYSTEM.md` §12. |
| **Visual regression** *(optional)* | Playwright screenshots of key components/pages | Catch accidental design drift. |
| **Performance** | Lighthouse CI on booking page and home | Budgets from §9. |
| **Security** | Dependabot, `npm audit` in CI, manual review checklist (OWASP ASVS L1 subset) before beta | |
| **Usability** | 3–5 moderated sessions with real detailers per phase from Phase 1 | Task completion without help; time-to-complete onboarding. |

Test data: realistic seeded fixtures (dev/test only), clearly fake names and `555-01xx` phone numbers, never real customer data.

---

## 13. Decisions, open questions and risks

### 13.1 Decisions proposed in this plan (please confirm or change)

| # | Decision | Proposal |
|---|---|---|
| D-1 | Owner approves all requests in v1 | Yes; schema allows auto-approve later |
| D-2 | Stack | Next.js + TypeScript + Postgres + Drizzle, hosted on Vercel + Supabase (≈$45/mo) |
| D-3 | Auth provider | Supabase Auth (simplest with Supabase) vs. self-hosted library in our DB (more portable). Recommend Supabase Auth unless portability matters more. |
| D-4 | One owner, one business in MVP | Yes, with a membership table for future staff |
| D-5 | Customers never create accounts | Yes; tokenised status/quote links |
| D-6 | **Owner notification email for new requests** | Recommended for MVP (owner-only, transactional, free tier). Without it, owners must remember to check the app. Needs your approval since it's an email integration. |
| D-7 | Bot protection | Honeypot + rate limit; add Turnstile (free) when abuse appears or from day one |
| D-8 | Invite-only sign-up during beta | Yes |
| D-9 | DetailerHQ's own billing | Manual Stripe invoices/payment links during beta |
| D-10 | Deletion grace period | 30 days |
| D-11 | Market & locale | United States, USD, English, US phone formats first |

### 13.2 Open questions

1. **Market:** US-only at launch? (Affects phone formats, currency, tax wording, privacy law coverage — e.g., CCPA, and whether GDPR applies.)
2. **Pricing for DetailerHQ:** monthly price point and trial length? (Suggest testing ~$29–49/month with a 30-day trial; validate in interviews.)
3. **Mobile vs. shop mix** of the first target customers — determines how much we invest in address/service-area handling.
4. **Deposits:** Is "no deposits" a deal-breaker for coating/correction detailers? (Common pain point; would pull payments forward.)
5. **Owner notifications:** is email acceptable (D-6), or do owners require push/SMS to notice requests?
6. **Multi-vehicle bookings** (e.g., two family cars in one visit): how common among target users?
7. **Existing customer import:** do early adopters need CSV import at launch?
8. **Brand:** timeline and budget for name clearance (trademark search, domain, social handles).
9. **Who are the first 5 beta businesses**, and can we observe them using it?
10. **Tax:** do detailers need tax lines on quotes in their states? (MVP proposal: optional single tax-rate line on quotes, shown as "estimated".)

### 13.3 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Cross-tenant data leak** | Fatal to trust; legal exposure | Three-layer isolation, mandatory isolation suite, security review before beta |
| **Brand name not cleared** | Rebrand cost, legal dispute | Name in one config value; no logo spend; trademark search before public launch |
| **Owners don't see requests quickly** (no notifications) | Lost jobs, churn | D-6 owner email; Today badge; PWA home-screen install |
| **Expectation gap** — customers assume "booked" when it's a request | Bad experiences for detailers | Explicit "request, not confirmed" copy throughout; status page |
| **Timezone/DST bugs** in scheduling | Wrong-time appointments | Store UTC, compute in business TZ, DST test cases |
| **Feature creep** (SMS, payments, deposits) before validation | Delayed launch, cost overrun | Strict exclusion list; Phase 2 only from beta evidence |
| **Free-tier limits / pricing changes** | Cost rises above budget | Monitor usage; architecture is portable Postgres + Node |
| **Spam on public forms** | Inbox noise, owner distrust | Rate limit, honeypot, Turnstile |
| **Privacy/legal obligations** (processor role, CCPA) | Compliance gap | Lawyer review of Terms/Privacy/DPA before charging; minimisation |
| **Competition from established tools** (general field-service and detailing apps) | Hard to differentiate | Focus on approval-first booking, vehicle-size pricing, honest analytics, and a markedly better mobile experience |
| **Single developer / bus factor** | Stalled maintenance | Simple architecture, docs, tests, decision records |
| **Hobby-tier misuse** | Terms violation | Upgrade hosting to a commercial plan before taking payment |
