# DetailerHQ — Design System

> **Status:** Final draft for approval · **Revision 4.2** · **Last updated:** 2026-10-30
>
> **Revision 4.2 (approved by the owner):** the homepage opens with one scroll-controlled film that hands over to the product showcase in the same pinned sequence (§8.1). §7.2 allows this one owner-supplied AI-generated film, credited on the page.
>
> **Revision 4.1 (approved amendment):** §8 now allows exactly two pinned, scroll-driven sequences on the marketing homepage — the hero opening and the product showcase. Every other motion rule is unchanged.
> Companion to [`PRODUCT_PLAN.md`](./PRODUCT_PLAN.md). The product name is a placeholder; nothing in this system depends on it.
> Decision labels (D-n approved, REC-n not approved) follow PRODUCT_PLAN §17. Visual specifications below are design recommendations unless they implement an approved decision.

### What changed in revision 4

- **Capacity-aware calendar** (§13.4): concurrent jobs in side-by-side lanes, capacity usage per time band, holds shown as consuming capacity (implements D-26, D-27).
- **Capacity messages** replace single-overlap conflict wording (§13.12); "full" states never reveal capacity to customers (D-25).
- New **capacity setting** component used in onboarding and availability (§13.19).
- Holds described as using one job slot; expired holds disappear from the calendar at expiry.
- Owner scheduling actions are always explicit buttons that call server-side operations — no inline editing or drag-and-drop of appointments (D-24).

### What changed in revision 3

- **Early-access pricing presentation** ($25 for the first month) and stage rules for showing the $49 target price (§2.4, §9.2, §9.5).
- **Temporary holds**: calendar, request-detail and status-page treatments; the old "business holds pending times" setting is gone (§13.4, §13.11, §13.12).
- **One vehicle per request** in the public flow, and a new **customer & vehicle linking** panel for approval (§9.4, §13.17).
- **Policy settings** form with 24 h shown as a suggestion, and **"Ask to reschedule"** on the status page (§13.11, §13.18).
- **Activation banner** before the trial starts; masked contact details on status pages; "no tax calculation" wording.

### What changed in revision 2

- Added §1.1 **One system, three contexts** — how the same tokens serve the marketing site, the public booking/status pages and the dashboard.
- Added a **claims and honesty policy** (§2.4): no fake testimonials, invented statistics or unsupported performance claims; stage-appropriate pilot vs. trial wording.
- Copy updated for **no automated messaging** ("Open in Messages", never "Send SMS") and **recorded** (not collected) amounts.
- Landing page and pricing hierarchy now adapt to the **pilot** stage and the later **7-day trial** stage.
- Explicit **tablet** layout (768–1023 px).
- New component specs: **customer status page**, **propose a different time**, **conflict and duplicate warnings**, **notification center**, **message templates and "Did you send it?"**, **communication log**, **account banners and restricted (read-only) state**, **analytics money labels**.
- Status badge set updated for the new request and lead statuses.

---

## Contents

1. [Design principles](#1-design-principles)
2. [Voice and interface content](#2-voice-and-interface-content)
3. [Color](#3-color)
4. [Typography](#4-typography)
5. [Spacing and layout grid](#5-spacing-and-layout-grid)
6. [Sizing, radii, borders, shadows](#6-sizing-radii-borders-shadows)
7. [Icons and imagery](#7-icons-and-imagery)
8. [Motion](#8-motion)
9. [Marketing site and landing page](#9-marketing-site-and-landing-page)
10. [Dashboard layout and navigation](#10-dashboard-layout-and-navigation)
11. [Responsive behavior](#11-responsive-behavior)
12. [Accessibility](#12-accessibility)
13. [Components](#13-components)
14. [Avoiding generic AI-generated aesthetics](#14-avoiding-generic-ai-generated-aesthetics)
15. [Tokens and implementation notes](#15-tokens-and-implementation-notes)
16. [Design review checklist](#16-design-review-checklist)

---

## 1. Design principles

The visual reference point is **well-made automotive and instrument design**: a German car's switchgear, a good workshop manual, a torque wrench's engraved scale. Precise, quiet, legible, built to be used with confidence by someone who knows their trade. Not a sports-car advertisement.

1. **Tool first, brand second.** In the dashboard, every pixel serves a task. The brand shows up through precision and restraint, not decoration.
2. **Quiet surfaces, clear signals.** Neutral, low-contrast structure (borders, backgrounds) so that the few things that carry meaning — a pending request, an overdue task, a conflict — are unmistakable.
3. **Readable at arm's length, in sunlight, with wet hands.** Owners use this outdoors on phones. Generous type sizes on mobile, high contrast, large targets, no hover-dependent UI.
4. **Real content, always.** Designs, prototypes and screenshots use realistic detailing data. No lorem ipsum, no invented metrics.
5. **Honest UI.** The interface never implies something happened that didn't ("Message sent" when we only opened the phone's messages app). Wording mirrors what the system actually does.
6. **Consistency over novelty.** One way to do each thing. A new pattern needs a reason that an existing one can't serve.
7. **Density where it helps.** Desktop tables and calendars may be compact; mobile prioritises one clear task per screen.

### 1.1 One system, three contexts

The marketing site, the public pages each detailer shares with customers, and the dashboard all use **the same tokens, typefaces, grid and components**. They differ in tone and density, not in identity.

| | Marketing site | Public booking & status pages | Dashboard |
|---|---|---|---|
| **Job** | Explain the product honestly and earn a conversation | Help a vehicle owner send a request and understand its status | Help the owner run the day |
| **Brand presence** | Ours (provisional name from config) | **The detailer's**; ours only as a small "Powered by" link | Minimal; the business's name in the sidebar |
| **Color** | Graphite dark sections + light sections; brass details allowed | Light only; graphite + steel; no brass | Light only; graphite + steel + status colors; no brass |
| **Imagery** | Licensed, real automotive/detailing photography; real product screenshots | None (the detailer's own logo later) | None |
| **Type scale** | Up to `display` (56px max) | Up to `h2` | Up to `h2`; dense `body` 15px on desktop |
| **Density** | Generous (80–128px section padding) | Calm, single column, 640px max | Compact tables and calendars; one task per screen on phones |
| **Motion** | One subtle image fade; one approved scroll-driven film + showcase sequence on the homepage (§8.1) | State changes only | State changes only |
| **Primary action** | Apply for early access / Start trial (stage-dependent) | Send request · Accept this time | Approve request · Mark complete, etc. |

If a pattern exists in one context, reuse it in the others before inventing a variant (e.g., the same badge, button and form field everywhere).

---

## 2. Voice and interface content

### 2.1 Voice

Direct, practical, calm — like an experienced shop manager. Short sentences. Trade vocabulary detailers use ("paint correction", "decon wash", "ceramic coating", "interior reset"), no corporate or startup jargon.

| Do | Don't |
|---|---|
| "Approve request" | "Submit" / "Let's go!" |
| "3 requests waiting" | "You've got new opportunities! 🎉" |
| "Recorded revenue" | "Revenue collected" (we don't collect) |
| "Open in Messages" / "Open in Mail" / "Copy message" | "Send SMS" / "Email customer" / "Message sent" |
| "Request sent — not confirmed yet" | "You're booked!" (for a request) |
| "Recorded amount" | "Payment received" / "Charged" |
| "Pilot access until Dec 15" (pilot stage) | "Free trial" (before trials exist) |
| "Early access: $25 for your first month" | "70% off — limited time!" |
| "Your time is being held — not confirmed yet" | "Reserved!" / "Booked" (for a hold) |
| "No account needed" (booking page) | "Sign up to book" |
| "This slot was just taken. Choose another time." | "Oops! Something went wrong." |
| "Not enough data yet — 2 completed jobs this month." | A chart with two points and a "+100%" badge |
| "3 leads booked after a logged follow-up" | "Follow-ups generated 3 bookings" |

### 2.2 Content rules

- Sentence case everywhere (buttons, headings, nav, table headers). Never Title Case, never ALL CAPS except tiny overline labels (see §4).
- Buttons describe the action with a verb + object: "Save service", "Decline request", "Mark complete".
- Numbers: `$1,240` (no cents when whole dollars in summaries; cents shown in editors and quotes), durations as `3h 30m`, dates as `Sat, Nov 8` and `Nov 8, 2026` when year is ambiguous, times as `9:00 AM` (US locale). All times in the **business's timezone**; show the zone abbreviation only when the viewer's device zone differs.
- Vehicles: `2021 Tesla Model Y · White` — year, make, model, then color.
- Plates and VINs in monospace (§4).
- Never show an empty value as "null", "undefined", "N/A" or "—" without meaning. Use "Not provided" or omit the row.
- Errors say what happened and what to do next.

### 2.3 Realistic sample content (use in all mocks, prototypes and marketing screenshots)

| Field | Examples |
|---|---|
| Businesses | Northside Detail Co. · Ridgeway Mobile Detailing · Clearcoat Studio |
| Customers | Jordan Reyes · Priya Natarajan · Marcus Bell · Elena Kowalski · Sam Whitaker |
| Vehicles | 2021 Tesla Model Y · 2019 Toyota Tacoma TRD · 2023 Honda Odyssey · 2016 BMW 340i · 2022 Ford F-150 Lariat |
| Services | Maintenance wash — $65 / 1h · Interior reset — $180 / 2h 30m · Full detail — from $260 / 4h · One-step paint enhancement — from $450 / 6h · Ceramic coating (3-year) — quote required |
| Notes | "Dog hair, back seats" · "Gate code 4471" · "Coated Apr 2025 — check hydrophobics" |
| Phones | (512) 555-0142 (always `555-01xx` fictional range) |

Marketing screenshots must be taken from the real product with this seeded data, not mocked in a drawing tool.

The prices above are **illustrative values for one fictional business** in mocks and screenshots. They are never used as defaults in the product, never shown as typical market prices, and every screenshot showing prices belongs visibly to a named fictional business.

### 2.4 Claims and honesty policy

Applies to the marketing site, in-app copy, onboarding, emails we write ourselves and sales conversations.

- **No fake testimonials**, stock-photo "customers", invented quotes, or composite reviews. Real testimonials only with the person's written permission, their real name and business, and unedited meaning.
- **No invented statistics**: no user counts, "bookings processed", ratings, time-saved or revenue-increase figures unless measured, documented and current. No industry statistics without a cited source.
- **No unsupported performance claims** ("Double your bookings", "Never miss a lead", "Save 10 hours a week").
- **No customer logos** without permission.
- **No features described before they ship** — including automated texts/emails, payments, deposits, integrations and AI. "Coming soon" lists are avoided; if needed, use "Not available yet" in the included/not-included section.
- **Stage-correct wording:** during the pilot, use "early access", "pilot program" and "pilot access"; "7-day free trial" and "no credit card required" appear only after trial enforcement and billing ship (PRODUCT_PLAN §3.2).
- **Early-access price:** shown as "Early access: $25 for your first month" with, in the same block, what happens after the first month (as decided — PRODUCT_PLAN §17.3). No implied discount from an unvalidated "regular price", no countdowns, no scarcity claims beyond the true pilot size ("We're working with a small group of 3–5 businesses").
- **Public price:** the $49/month target is an internal hypothesis and is **not** published until validated (PRODUCT_PLAN §12.1).
- **Trial start:** wherever the trial is described, say it starts "once you verify your email and set up your business".
- **Tax:** never imply the product calculates tax or handles payments.
- **Trial terms are stated plainly** wherever the trial is offered: length, exact end time, what happens at the end, and that data isn't deleted when it ends.
- A claims checklist is reviewed before each marketing publish (§16).

---

## 3. Color

### 3.1 Approach

A **warm-neutral graphite** scale does almost all of the work. One functional accent (**Steel**) for links, selection and focus. A small, muted set of status colors. A single brand accent (**Brass**) appears only in the marketing site and the logo mark — never as an interface signal in the dashboard.

No gradients in the product UI. No pure black (`#000`) text or pure gray (`#808080`) neutrals.

### 3.2 Neutrals — Graphite

| Token | Hex | Primary uses |
|---|---|---|
| `graphite-0` | `#FFFFFF` | Raised surfaces: cards, tables, inputs, modals |
| `graphite-25` | `#FAFAF9` | App canvas (page background) |
| `graphite-50` | `#F4F4F2` | Subtle fills: table header, hover row, sidebar background |
| `graphite-100` | `#E9E9E6` | Dividers, inner borders |
| `graphite-200` | `#DADAD6` | Default borders on inputs and cards |
| `graphite-300` | `#BDBDB8` | Strong borders, disabled control borders |
| `graphite-400` | `#8E8E89` | Icons (non-essential), disabled text. **Not for required text** (3.3:1 on white) |
| `graphite-500` | `#6B6B66` | Secondary text, placeholders, metadata (5.3:1 on white) |
| `graphite-600` | `#52524E` | Labels, table headers |
| `graphite-700` | `#3A3A37` | Strong secondary text |
| `graphite-800` | `#262624` | Primary button hover; dark marketing surfaces |
| `graphite-900` | `#171716` | Primary text; primary buttons; dark marketing background |

### 3.3 Functional accent — Steel

| Token | Hex | Uses |
|---|---|---|
| `steel-50` | `#EEF3F8` | Selected row, selected calendar day, info background |
| `steel-100` | `#DCE6F0` | Selected borders, "Scheduled" badge background |
| `steel-500` | `#3D6E9E` | Focus ring |
| `steel-600` | `#2F5D8A` | Links, active nav indicator, selected control (6.9:1 on white) |
| `steel-700` | `#244A70` | Link hover/pressed |

### 3.4 Status colors

Muted, slightly desaturated — readable, not alarming. Every status is shown with **text** (and usually a small icon or dot), never color alone.

| Status meaning | Text / icon | Background | Border | Used for |
|---|---|---|---|---|
| **Attention** (amber) | `#8A5A00` | `#FBF3E2` | `#EBD6A8` | Pending request, follow-up due, possible duplicate, conflict warning, trial ending |
| **Scheduled / info** (steel) | `#2F5D8A` | `#EEF3F8` | `#C9D8E7` | Scheduled appointment, held time, time proposed (waiting on customer), quote sent, contacted |
| **Positive** (green) | `#2E6B3F` | `#EAF3EC` | `#C3DDC9` | Approved, completed, accepted, booked |
| **Critical** (red) | `#A6352B` | `#FBECEA` | `#EBC3BE` | Errors, overdue, no-show, destructive actions, restricted account |
| **Neutral** (graphite) | `#52524E` | `#F0F0EE` | `#DADAD6` | New, draft, cancelled, declined, withdrawn, expired, duplicate, lost, archived |
| **In progress** (graphite strong) | `#171716` | `#FFFFFF` | `#171716` | In-progress appointment (outlined, distinct without adding a hue) |

All text/background pairs above meet ≥ 4.5:1.

### 3.5 Brand accent — Brass (marketing only)

| Token | Hex | Uses |
|---|---|---|
| `brass-300` | `#D9B77A` | Hairline rules and small details on dark marketing sections |
| `brass-500` | `#B08A43` | Logo mark, small overline labels on dark backgrounds |
| `brass-700` | `#7D5F27` | Brass text on light backgrounds (≥ 4.5:1 on `#FAFAF9`) |

Brass is never used for buttons in the product, status, charts or links. It is a signature, not a signal.

### 3.6 Data visualisation

Charts use a single series color (`steel-600`) by default, with `graphite-300` for comparison periods. When categories are needed (e.g., lead sources, max 6), use this ordered set and always label directly:

`#2F5D8A` steel · `#6E8B5E` sage · `#B08A43` brass · `#7A6A93` slate violet · `#A3624A` clay · `#5E7C86` teal gray

Gridlines `graphite-100`, axis text `graphite-500`, no chart backgrounds, no 3D, no pie charts with more than 4 slices (prefer bars).

### 3.7 Dark mode

The dashboard ships light-only in the MVP (high contrast in sunlight). All colors are defined as semantic tokens (§15) so a dark theme can be added later without touching components. The **marketing site** uses dark graphite sections intentionally.

---

## 4. Typography

### 4.1 Typefaces

| Role | Family | Why |
|---|---|---|
| UI and marketing | **IBM Plex Sans** (OFL, free) | Engineered, slightly technical grotesk with real character; excellent tabular figures; reads as "precision instrument" rather than generic startup. |
| Data & codes | **IBM Plex Mono** (OFL, free) | Plates, VINs, quote numbers, times in dense calendar cells when alignment matters. |

- Self-host via the framework's font optimisation (no runtime requests to third-party font CDNs).
- Load only weights 400, 500, 600 (Sans) and 400, 500 (Mono).
- Enable tabular figures (`font-variant-numeric: tabular-nums`) in tables, prices, times, analytics.
- *Paid upgrade path (optional, post-revenue):* a premium grotesk such as Söhne or Untitled Sans for marketing headlines only.
- **Not** Inter, Poppins, Montserrat, or system "rounded" fonts — they are the default look of templated SaaS.

### 4.2 Type scale

Base size 16px for marketing and mobile app; **15px** dashboard body on desktop for density. Line heights snap to the 4px grid.

| Token | Size / line height | Weight | Letter spacing | Use |
|---|---|---|---|---|
| `display` | 56/60 (desktop) · 36/40 (mobile) | 500 | −0.02em | Marketing hero only. Never larger. |
| `h1` | 36/44 · 28/36 | 500 | −0.015em | Marketing section titles |
| `h2` | 24/32 | 600 | −0.01em | App page titles ("Requests", "Jordan Reyes") |
| `h3` | 18/28 | 600 | −0.005em | Panel / card titles, modal titles |
| `h4` | 15/24 | 600 | 0 | Group headings within forms and panels |
| `body-lg` | 18/28 | 400 | 0 | Marketing paragraphs |
| `body` | 15/24 (desktop app) · 16/24 (mobile) | 400 | 0 | Default text |
| `body-sm` | 13/20 | 400 | 0 | Metadata, helper text, table secondary lines |
| `label` | 13/20 | 500 | 0 | Form labels, table headers |
| `overline` | 12/16 | 500 | +0.06em, uppercase | Tiny section labels (sparingly; max once per view) |
| `mono` | 13/20 | 400–500 | 0 | Plates, VINs, IDs |
| `metric` | 28/32 | 500 | −0.01em, tabular | Analytics numbers |

Rules:

- Max line length: 68ch for paragraphs.
- Headings use weight and size, not color, for hierarchy. Never use more than three sizes in one dashboard view.
- No italic for emphasis in UI; use weight 600.
- Body text color `graphite-900`; secondary `graphite-500`; never lighter for anything the user must read.
- Inputs use 16px minimum on mobile to prevent iOS zoom.

---

## 5. Spacing and layout grid

### 5.1 Spacing scale (4px base)

| Token | px | Typical use |
|---|---|---|
| `space-0` | 0 | — |
| `space-0.5` | 2 | Icon–text nudge |
| `space-1` | 4 | Badge padding, tight inline gaps |
| `space-2` | 8 | Icon-to-label, compact stacks |
| `space-3` | 12 | Field label → input, table cell vertical padding |
| `space-4` | 16 | Default gap; mobile page gutter; card padding (mobile) |
| `space-5` | 20 | Form field to field |
| `space-6` | 24 | Card/panel padding (desktop); section gap inside a page |
| `space-8` | 32 | Between page sections; desktop page gutter |
| `space-10` | 40 | Page header to content |
| `space-12` | 48 | Marketing small section padding |
| `space-16` | 64 | — |
| `space-20` | 80 | Marketing section padding (mobile) |
| `space-24` | 96 | — |
| `space-32` | 128 | Marketing section padding (desktop) |

Use the scale only; no arbitrary values. Vertical rhythm comes from consistent gaps, not from boxes around everything.

### 5.2 Layout grid

- **Marketing:** 12-column grid, max content width 1200px, 24px gutters, 32px outer margin desktop / 16px mobile. Text columns max 640px.
- **Dashboard:** sidebar (240px) + fluid content. Content max width **1280px** for tables and calendar; **720px** for forms and detail reading columns. Detail pages use a 2-column layout on ≥ 1024px: main (≈ 2/3) + context rail (≈ 1/3, e.g., customer and vehicle summary).
- **Public booking page:** single column, max width 640px, centred — it must feel like the *detailer's* page, calm and focused.

---

## 6. Sizing, radii, borders, shadows

### 6.1 Control sizes

| Size | Height | Use |
|---|---|---|
| `sm` | 32px | Dense table actions, filter chips (desktop only) |
| `md` | 40px | Default desktop controls |
| `lg` | 48px | Mobile primary actions, public booking form controls |

On touch devices, all interactive targets are **at least 44 × 44px** (extend hit area with padding if the visual is smaller).

### 6.2 Radii

Restrained, consistent, mechanical.

| Token | Value | Use |
|---|---|---|
| `radius-none` | 0 | Tables, calendar grid, full-bleed sections, images on marketing |
| `radius-sm` | 4px | Buttons, inputs, selects, badges, checkboxes (3px) |
| `radius-md` | 6px | Cards, panels, popovers, menus, toasts |
| `radius-lg` | 8px | Modals, mobile bottom sheets (top corners only) |
| `radius-full` | 9999px | Avatars, status dots, toggle switches only |

No pill-shaped buttons. No radius larger than 8px anywhere in the product.

### 6.3 Borders

- Default: 1px `graphite-200`. Dividers inside a surface: 1px `graphite-100`.
- Inputs: 1px `graphite-300`; hover `graphite-400`; focus `steel-600` border + focus ring (§12).
- Prefer **dividers and whitespace** over nested boxes. A card inside a card is not allowed.
- Status emphasis may use a 2px left border in the status color on list rows (e.g., overdue tasks), never full colored backgrounds on large areas.

### 6.4 Elevation and shadows

Flat by default. Shadows only indicate something floating above the page.

| Token | Value | Use |
|---|---|---|
| `shadow-none` | none | Cards, panels, tables (border only) |
| `shadow-sm` | `0 1px 2px rgba(23,23,22,0.06)` | Sticky headers/bars when content scrolls beneath |
| `shadow-md` | `0 4px 12px rgba(23,23,22,0.08), 0 1px 3px rgba(23,23,22,0.06)` | Popovers, dropdown menus, toasts |
| `shadow-lg` | `0 12px 32px rgba(23,23,22,0.12), 0 2px 6px rgba(23,23,22,0.06)` | Modals, sheets |

Overlay scrim: `rgba(23,23,22,0.40)`. No colored shadows, no glows, no inner shadows, no glassmorphism blur.

---

## 7. Icons and imagery

### 7.1 Icons

- **Library:** Lucide, outline style, **1.5px stroke**, sizes **16px** (inline, tables, buttons) and **20px** (navigation, empty states). One library only.
- Color: inherit text color; `graphite-500` for decorative/supporting icons.
- Icons accompany labels; icon-only buttons are allowed only for universally understood actions (close, more, previous/next, search) and **must** have an accessible name and tooltip on desktop.
- **No emoji** anywhere in the interface, notifications or transactional copy.
- **No icons in colored rounded squares** ("feature tile" pattern).
- No custom illustrated mascots or cartoon people.
- Status icons: `circle-dashed` pending, `calendar-check` scheduled, `loader` *not* used for status (only for loading), `check` completed, `x` declined/cancelled, `alert-triangle` warning/conflict, `clock` overdue.

### 7.2 Photography (marketing site only)

- **Real, licensed photography of real detailing work**: close-ups of paint correction under inspection lights, a foam cannon mid-wash, microfiber on a hood, a detailer kneeling at a wheel, interior steam cleaning, a finished car in soft overcast light. Process and craft, not just glamour.
- Natural or workshop light; neutral to cool grading; matte, not over-saturated. Water beading and reflections are fine; lens flares, neon, smoke, and dramatic sunsets are not.
- Prefer commissioning a local detailer shoot (often affordable in exchange for a free account) or using properly licensed stock with model/property releases. **No AI-generated imagery** — car details (badges, wheel counts, reflections) look wrong and detailers notice immediately.
- **Exception (revision 4.2):** the homepage film is an owner-supplied, Runway-generated commercial. It is credited on the page ("Film: AI-generated") and never presented as a real customer, job or business. The vehicle is a recognisable Mercedes-AMG GT: the site must not use Mercedes branding or imply partnership or endorsement, and trademark review is required before public launch. No other AI imagery is allowed.
- No supercars-only imagery; show vehicles the customers actually own: pickups, SUVs, minivans, Teslas, a few enthusiast cars.
- Avoid visible license plates, car brand logos as focal points, and faces without releases.
- Images are full-bleed or sharp-edged (radius 0); never in tilted frames, floating cards or with drop shadows.

### 7.3 Product screenshots

- Taken from the real application with seeded realistic data (§2.3).
- Shown at true scale or slightly reduced, inside a minimal device/browser frame (thin 1px border, no fake glossy device mockups, no 3D tilts).
- Phone screenshots shown at actual phone proportions to prove mobile quality.

### 7.4 Dashboard imagery

None. No banners, no stock photos, no illustrations in empty states. The business's own name and (optional, post-MVP) logo are the only "images".

---

## 8. Motion

Motion explains change; it never decorates.

| Use | Duration | Easing |
|---|---|---|
| Hover/press color change | 100ms | linear |
| Popover/menu open | 120ms (fade + 4px translate) | `cubic-bezier(0.2, 0, 0, 1)` |
| Modal open / close | 160ms / 120ms (fade + scale 0.98 → 1) | same |
| Mobile sheet | 200ms slide up / 160ms down | same |
| Toast in/out | 160ms | same |
| Row removed after an action | 160ms height collapse | same |

Rules:

- No scroll-triggered reveal animations in the app. On marketing, at most a single 200ms fade for images on first load — except the sequence in §8.1.
- No parallax, no auto-playing carousels, no animated gradients, no number count-ups in analytics, no bouncing, no confetti.
- Skeleton loaders: static `graphite-50` blocks matching the final layout; a gentle opacity pulse is allowed, no shimmer sweeps.
- Respect `prefers-reduced-motion`: replace all transitions with instant changes or opacity-only fades.
- Never animate layout during user input.

### 8.1 Approved scroll-driven sequence (marketing homepage only)

Exactly one pinned sequence is allowed: the opening film, followed in the same pin by the product showcase. No other section may use scroll-triggered or scroll-linked motion.

| Part | What scroll controls | Fallback |
|---|---|---|
| **Film** | The film's `currentTime` (forwards and backwards): wash, finish, the detailer, the phone push-in. The headline and calls to action sit on a fixed graphite shade and fade as scrolling starts; short chapter captions sit on dark, quiet areas. | Phones, tablets and short screens: a lighter 16:9 film band, shorter pin. Reduced motion, Data Saver/2G or a load failure: a static poster (plus "Watch the film" with controls for reduced motion and Data Saver). |
| **Hand-off** | As the black phone screen fills the frame, it fades to graphite and the real interface preview fades in already filling the stage, holds, then shrinks into the showcase frame. | — |
| **Product showcase** | One device frame steps through Today, Requests, Calendar, Customers, Quotes, Follow-ups, Analytics (opacity + ≤ 12px vertical drift), snapping to each screen. Tabs are clickable step links. | The same screens as accessible tabs in a normal section. |

Rules:
- Page elements animate `transform` and `opacity` only; no animated gradients, parallax layers, blur, colour cycling or counting numbers.
- Content is real HTML and complete without JavaScript; the film never replaces content.
- The interface shown is the existing HTML previews with labelled sample data — never footage or generated screens.
- Implemented with GSAP + ScrollTrigger (`gsap.matchMedia()`-style mode selection, `prefers-reduced-motion` respected). No scroll-smoothing or scroll-hijacking libraries; native scrolling, anchors and keyboard scrolling keep working; a "Skip film" link is always available.
- No other AI imagery or 3D models (§7.2). Photography elsewhere stays as marked placeholders until licensed.

---

## 9. Marketing site and landing page

The marketing site may be more atmospheric than the product — dark graphite sections, real photography, brass detailing — but it uses the same type, grid and component rules. It should feel like a premium tool manufacturer's site, not a startup template.

### 9.1 Global header

- Left: wordmark (set in Plex Sans 600, letter-spaced −0.01em; placeholder until the name is cleared). Optional small brass mark.
- Center/right: Product · Pricing (labelled "Early access" during the pilot) · Sign in · primary button whose label depends on the stage: **"Apply for early access"** during the pilot; **"Start 7-day free trial"** only after trial enforcement and billing ship.
- Height 64px, solid background (dark on the hero, light below). No transparency blur.
- Mobile: wordmark + "Sign in" + menu button opening a full-screen sheet.

### 9.2 Landing page hierarchy (top to bottom)

1. **Hero** — dark graphite (`graphite-900`) with one strong photograph (e.g., detailer inspecting paint under a swirl-finder light), photo occupying the right half on desktop / below text on mobile.
   - Overline (brass, optional): "Software for independent detailers"
   - Headline (`display`, max two lines, left-aligned): *"Run your detailing business from one tidy place."*
   - Supporting line (`body-lg`, max 2 lines): "Take booking requests, approve jobs, keep every customer and vehicle on record, and follow up on quotes — from your phone."
   - Primary button (stage-dependent label, see §9.1) + secondary text link ("See the booking page →").
   - No floating badges, no "Trusted by 10,000+", no star ratings, no performance claims (§2.4).
2. **The booking page, shown for real** — light section. A real phone screenshot of a business booking page and its status page, next to a short explanation of the flow as numbered steps in plain text (not icon tiles): *Customer sends a request → you approve, decline or suggest another time → they see the status on their link.*
3. **The owner's day** — a desktop screenshot of the Today screen and calendar, with 3–4 short annotations connected by thin hairlines pointing to real UI elements ("Requests waiting for you", "Next job and gate code").
4. **Customers and vehicles** — short copy + screenshot of a customer profile with vehicle history.
5. **Leads, quotes and follow-ups** — screenshot of a lead with its quote, communication log and follow-up task; one line explaining templates open in the owner's own Messages or Mail app.
6. **Honest numbers** — analytics screenshot with the line: "Every number comes from jobs you've actually recorded." Shows quoted value, booked job value and recorded revenue as separate, labelled figures.
7. **What's included and what isn't (yet)** — a plain two-column list. *Included:* booking page and request status links, approvals and suggested times, calendar, customers & vehicles, leads & quotes, follow-up reminders and message templates, analytics, CSV export. *Not available yet:* automatic texts or emails, online payments and deposits, social media integrations, CSV import. This builds trust.
8. **Pricing teaser** — **pilot stage:** "Early access for 3–5 detailing businesses — $25 for your first month," one line on what happens after, and a link to the early-access page; **paid-launch stage (after price validation):** one plan, price, and the trial stated in full ("7-day free trial. No credit card required. When it ends, subscribe to keep using DetailerHQ — your data isn't deleted.").
9. **Founder note** — short, signed, real person (photo optional), why this is being built and how to reach them. Replaces fake testimonials until real ones exist.
10. **FAQ** — 5–7 practical questions (data ownership, export, texting, mobile, cancellation).
11. **Footer** — dark; product links, legal, contact email, © year. Small and tidy.

### 9.3 Marketing layout rules

- Alternate dark and light sections at most 3 times; section padding 128px desktop / 80px mobile.
- Headlines left-aligned (centred only in the final CTA band, if any).
- One primary CTA style per page, repeated at most three times.
- Photography never has text overlaid on busy areas; text sits on solid graphite.
- Thin brass hairlines (1px, `brass-300` at 60%) may separate sections on dark backgrounds — the one decorative device we allow.

### 9.4 Public booking page (`/b/[slug]`)

This is the detailer's page, not ours. Our branding is a single small "Powered by DetailerHQ" footer link.

- Header: business name (`h2`), one line of service area ("Mobile detailing · North Austin & Round Rock"), phone and hours summary.
- Owner's intro text (max ~300 chars).
- Service menu: grouped by category; each row shows name, short description, duration, price (`From $260` / `$65` / `Quote required`). Rows, not cards. Primary button at the bottom (sticky on mobile): "Request an appointment"; secondary: "Request a quote".
- Request flow: one step per screen on mobile with a step indicator ("Step 2 of 6 · Vehicle"), back link, sticky bottom action bar showing the running estimate ("Full detail · Large SUV · from $310 · 4h 30m"). On desktop, the summary sits in a right rail.
- **No account needed:** the first screen states it in one quiet line ("No account needed — you'll get a link to check your request"). No sign-in links anywhere in the customer flow.
- **One vehicle per request:** the Vehicle step asks for a single vehicle (year, make, model, size class, optional color and notes) with the heading "Which vehicle is this for?". Helper text below: "Booking for more than one vehicle? Send a separate request for each." The review step shows the vehicle in its own row.
- Time selection: date strip (next 14 days, horizontally scrollable) + list of available start times as 48px buttons. Unavailable dates are visibly disabled with an accessible label, not hidden.
- Confirmation: plain, reassuring, explicit that it is a request: "Request sent to Northside Detail Co. — not confirmed yet." followed by what happens next and the status link with **Copy link** (see §13.11).
- **Timezone:** a quiet line above the time list — "Times are in Central Time (CT)". If the visitor's device is in another zone, an info banner says so.
- **Inquiry flow** (`/b/[slug]/inquiry`) uses the same steps minus time selection, with a larger "What do you need?" textarea. Its confirmation says the business will reply directly.

### 9.5 Pricing page

- **Pilot stage:** title "Early access". Price block: "$25 for your first month" (`metric` style numerals, no strikethrough), directly followed by what happens after the first month and how payment is collected. Then: what's included, what we ask in return (feedback), pilot size and length, data ownership and export, link to pilot terms, application form or link to `/contact`. Never the words "free trial"; no unvalidated public price.
- **Paid-launch stage:** one plan card (border only, no shadow), price, billing interval, the full trial statement (length, no card, what happens at the end, data retention), included features list identical to the home page's "included" list, FAQ.
- No comparison tables against competitors, no "Most popular" ribbons, no strikethrough prices.

---

## 10. Dashboard layout and navigation

### 10.1 Desktop (≥ 1024px)

```
┌──────────────┬─────────────────────────────────────────────────────────┐
│ Business ▾   │  Page title          [Search ⌘K]  [Bell 2]  [+ New ▾]   │
│              ├─────────────────────────────────────────────────────────┤
│ Today        │  [Account banner — pilot/trial/restricted, if any]      │
│ Requests   3 │  Page content                                           │
│ Calendar     │  (max 1280px; forms 720px)                              │
│ Customers    │                                                         │
│ Leads        │                                                         │
│ Quotes       │                                                         │
│ Tasks      2 │                                                         │
│              │                                                         │
│ SETUP        │                                                         │
│ Services     │                                                         │
│ Availability │                                                         │
│ Booking page │                                                         │
│ Analytics    │                                                         │
│              │                                                         │
│ Settings     │                                                         │
│ Jordan R. ▾  │                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘
```

- **Sidebar** 240px, background `graphite-50`, right border `graphite-200`. Nav items 36px tall, `body` size, icon 20px + label. Active item: `graphite-0` background, `graphite-900` text, 2px `steel-600` left indicator. Counts are plain numerals (`graphite-600`), with amber text only for pending requests.
- **Top bar** 56px: page title (h2) left; global search (customers, vehicles by plate, quotes by number), notifications button (bell icon with unread count, opens the notification panel, §13.13) and "New" menu (Appointment, Customer, Lead, Quote, Task, Log communication) right. Sticky with `shadow-sm` once scrolled.
- **Account banner** (§13.16) sits directly under the top bar on every dashboard page when relevant (pilot ending, trial, restricted).
- **Page header** within content: title, one-line description if needed, primary page action right-aligned, then filters/tabs below.
- At 1024–1279px the sidebar stays at full width (240px); content narrows. Below 1024px the tablet navigation rail (§11.2) takes over.

### 10.2 Navigation priorities

Daily work first (Today, Requests, Calendar), records next (Customers, Leads, Quotes, Tasks), configuration last (Services, Availability, Booking page), insight (Analytics), then account. The order is the same on every device.

### 10.3 Today screen (owner's home)

Ordered by urgency, not by data type:

1. **Needs your action** — pending requests (oldest first, with age: "Waiting 26h"), customers who responded to a proposed time, possible duplicates. Hidden when empty.
2. **Recent changes** — the latest unread notifications that change today's plan (customer cancelled, proposal accepted), max 3, link to all.
3. **Today's schedule** — chronological list: time range, customer, vehicle, services, address; next job expanded with tap-to-call/navigate.
4. **Tasks due** — overdue first (red text "Overdue · 2 days"), then today; leads in Follow-up due.
5. **This week at a glance** — small, factual: "6 jobs scheduled · $1,480 booked job value". No charts here.
6. **Setup checklist** — until complete, then gone.

No KPI tile row of vanity metrics on the home screen.

### 10.4 Detail page pattern

Header: name/number, status badge, primary action(s) right ("Approve", "Mark complete"), overflow menu (⋯) for secondary actions. Body: main column with sections separated by dividers and `h4` headings; right rail with linked customer/vehicle summary and activity timeline.

---

## 11. Responsive behavior

### 11.1 Breakpoints

| Name | Min width | Notes |
|---|---|---|
| `xs` | 0 | Design baseline: **375px** (test down to 320px) |
| `sm` | 640px | Large phones / small tablets |
| `md` | 768px | Tablets: navigation rail replaces bottom tab bar (§11.2) |
| `lg` | 1024px | Sidebar appears |
| `xl` | 1280px | Comfortable desktop |

Design mobile-first; every screen is designed at 375px *and* 1280px before build.

### 11.2 Tablet dashboard (768–1023px)

- **Navigation rail** 80px wide on the left: 20px icon above a 12px label for each primary destination (Today, Requests, Calendar, Customers, Leads, Quotes, Tasks), "More" at the bottom for setup and settings. No bottom tab bar.
- Top bar as on desktop, with search collapsed to an icon.
- **Landscape (≥ 1000px wide in practice):** list–detail split for Requests, Leads and Customers (list 360px, detail fills the rest), so the owner can work through the inbox without navigating back and forth.
- **Portrait:** single pane, lists as on mobile; tables with ≤ 5 columns may remain tables.
- Calendar: Week view available; Day view default.
- Modals stay centred dialogs (not sheets) at 560px max width.
- Touch target rules (44px) apply as on phones; no hover-only affordances.

### 11.3 Mobile dashboard (< 768px)

- **Bottom tab bar** (64px + safe-area inset): Today · Requests (badge) · Calendar · Customers · More. "More" opens a sheet with Leads, Quotes, Tasks, Services, Availability, Booking page, Analytics, Settings.
- **Top bar** 56px: page title, search icon, "+" (New) icon button.
- Page gutters 16px. Sections separated by dividers, not cards.
- **Tables become lists**: each row becomes a 2–3 line list item (primary text, secondary metadata, status badge right-aligned), full-row tap target, chevron indicator.
- **Primary actions** for the current record in a sticky bottom action bar above the tab bar (e.g., "Decline" secondary + "Approve" primary, each ≥ 48px tall).
- **Modals become bottom sheets** (full height for forms, auto height for confirmations), with a visible "Cancel" and drag handle; swipe-to-dismiss only when there's no unsaved input.
- **Calendar defaults to Agenda**; Day view available; Week view only ≥ 768px.
- Filters collapse into a "Filter" button opening a sheet; active filters shown as removable chips.
- Phone numbers, emails and addresses are tappable (`tel:`, `sms:`, `mailto:`, maps link).
- No hover-only affordances; no horizontal page scrolling (horizontal scrolling allowed only inside the date strip and wide tables explicitly marked scrollable).
- Respect safe-area insets and the on-screen keyboard (sticky bars move above it or hide while typing).

### 11.4 Public pages on all devices

The booking, inquiry, status and quote pages are single-column at every width (640px max). On desktop the request summary moves to a right rail beside the form (form 560px + rail 280px within a 900px container); everything else stays the same.

### 11.5 Installable web app

Provide a web app manifest and icons so owners can "Add to Home Screen". Standalone display, `graphite-900` theme color. No offline or push-notification promises in the MVP.

---

## 12. Accessibility

Target **WCAG 2.2 Level AA** across marketing, public booking pages and dashboard.

### 12.1 Requirements

- **Contrast:** text ≥ 4.5:1 (≥ 3:1 for ≥ 24px or 19px bold); UI component boundaries and focus indicators ≥ 3:1 against adjacent colors.
- **Focus:** always visible on keyboard focus — 2px `steel-500` outline with 2px offset (`:focus-visible`). Never removed. Not obscured by sticky headers/bars (scroll padding set accordingly).
- **Keyboard:** everything operable by keyboard in logical order; no traps except modals (which trap focus and return it to the trigger on close); `Esc` closes overlays; skip-to-content link.
- **Targets:** ≥ 24×24px everywhere (2.5.8), ≥ 44×44px on touch for primary actions.
- **Semantics:** native elements first (`button`, `a`, `input`, `table`); landmarks (`header`, `nav`, `main`); one `h1` per page (visually the page title); headings in order.
- **Forms:** every input has a visible `<label>`; required fields marked with text "(required)" or all-required notice; errors linked with `aria-describedby`, announced, and summarized at the top on submit with links to fields; don't clear user input on error; correct `autocomplete` and `inputmode` attributes (`tel`, `email`, `postal-code`, `name`).
- **Status and color:** status always conveyed by text; charts include data tables or text summaries.
- **Live updates:** toasts and async results announced via `aria-live="polite"`; errors `assertive`. Toasts with actions don't auto-dismiss while focused/hovered, and important outcomes also persist on the page.
- **Calendar:** grid has an equivalent list (Agenda) view; appointment blocks are buttons with full accessible names ("9:00 to 1:00 PM, Jordan Reyes, 2021 Tesla Model Y, Full detail, Scheduled").
- **Date/time pickers:** keyboard operable; typed entry accepted as alternative.
- **Motion:** honor `prefers-reduced-motion`; nothing flashes.
- **Zoom & reflow:** usable at 200% zoom and at 320px width without loss of content (1.4.10); text spacing overrides don't break layout.
- **Timeouts:** session expiry warns before losing unsaved form input; drafts preserved where feasible.
- **Language:** `lang="en"`; plain language; avoid jargon beyond trade terms.
- **Authentication:** no cognitive tests; allow password managers and paste.

### 12.2 Verification

- axe-core in Playwright on every key page (zero serious/critical).
- Manual keyboard-only pass and screen reader pass (VoiceOver iOS + macOS; TalkBack Android) at the end of each phase on: booking flow, requests inbox, approve, calendar, quote editor.
- Contrast check for any new color pair before use.

---

## 13. Components

All components are built once in `/src/ui`, documented with real-content examples, and used everywhere. Components consume semantic tokens (§15), never raw hex values.

### 13.1 Buttons

| Variant | Appearance | Use |
|---|---|---|
| **Primary** | `graphite-900` fill, white text; hover `graphite-800`; pressed `graphite-700` | The single most important action in a view |
| **Secondary** | White fill, 1px `graphite-300` border, `graphite-900` text; hover `graphite-50` fill | Other actions |
| **Tertiary / ghost** | No border, `graphite-700` text; hover `graphite-50` | Low-emphasis, toolbars, "Cancel" in dialogs |
| **Destructive** | `#A6352B` fill, white text (only in confirmation dialogs); elsewhere a secondary button with red text | Delete, decline (final confirmation) |
| **Link** | `steel-600` text, underline on hover (always underlined in body copy) | Navigation within text |

Rules:

- Max **one primary button per view** (per sticky bar on mobile).
- Sizes per §6.1; radius 4px; label weight 500; icon (16px) optional, leading.
- Loading state: label stays, spinner replaces leading icon, button disabled, width doesn't change.
- Disabled buttons are avoided where possible — prefer enabled + validation message explaining what's missing. If disabled, explain why nearby.
- Button order: on desktop, secondary left, primary right; in mobile sticky bars, primary on the right and wider.
- Destructive actions require confirmation describing the consequence ("Delete Jordan Reyes? Their 2 vehicles and notes will be deleted. Past appointments stay in your analytics without their name.").

### 13.2 Forms

- Single-column layouts; related short fields may pair on desktop (City / ZIP; Year / Make / Model on ≥ 640px).
- Label above input (`label` style), optional helper text below label, error text below input in critical color with `alert-circle` icon.
- Input: 40px desktop / 48px mobile and public forms, 1px `graphite-300` border, 4px radius, 12px horizontal padding, white background.
- Placeholder is never a label; use it only for format examples ("e.g., Gate code 4471").
- Validate on blur for format, on submit for everything; show error summary on submit for forms with > 4 fields.
- Specialised inputs:
  - **Money:** `$` prefix, right-aligned numerals in tables, accepts "180" or "180.00"; stored in cents.
  - **Duration:** hours + minutes selects in 15-minute steps, displayed as `2h 30m`.
  - **Phone:** `type="tel"`, formatted on blur as `(512) 555-0142`.
  - **Date/time:** native inputs on mobile; custom picker on desktop that also accepts typing.
  - **Vehicle:** Year (numeric), Make (combobox with common makes + free text), Model (free text), Size class (radio cards with examples — the one place card-style radios are allowed).
- Long forms (service editor, quote editor) have a **sticky save bar** that appears when there are unsaved changes ("Unsaved changes · Discard · Save service"). Leaving with unsaved changes prompts confirmation.
- Checkboxes and radios: 18px controls with 44px touch rows on mobile; toggles (switches) only for immediate on/off settings ("Accepting requests").

### 13.3 Tables (desktop) and lists (mobile)

- Row height 48px (comfortable default), header 40px with `label` style text in `graphite-600` on `graphite-50`.
- Text left-aligned; numbers, money and durations right-aligned with tabular figures; dates left-aligned.
- Horizontal dividers only (`graphite-100`), no zebra stripes, no vertical lines, outer 1px border with 6px radius container.
- Whole row clickable to open detail (with a real link in the primary cell for accessibility); hover `graphite-50`; selected `steel-50`.
- Primary cell: name in `graphite-900` 500 weight with secondary line in `body-sm` `graphite-500` (e.g., "Jordan Reyes" / "2021 Tesla Model Y · (512) 555-0142").
- Status column uses badges (§13.8).
- Sticky header on scroll; sortable columns indicate sort with an arrow and `aria-sort`.
- Filters above the table as a row: search input, status tabs or select, source/date filters, "Clear filters". Active filter count shown.
- Pagination: 50 rows with "Showing 1–50 of 212" and previous/next. No infinite scroll in data tables.
- Bulk actions out of MVP scope.
- On mobile, render as a list (§11.2), never a squeezed table.

### 13.4 Calendar

- **Views:** Day, Week (≥ 768px), Agenda (list grouped by day — default on mobile).
- **Time grid:** hours from the business's earliest availability start minus 1h to latest end plus 1h (min 7 AM–7 PM); hour lines `graphite-100`, half-hour lines dotted `graphite-100`; time labels `body-sm` `graphite-500` with tabular figures. Current-time line: 1px `#A6352B` with a small dot, only on today.
- **Outside availability:** subtle diagonal hatch of `graphite-50` on `graphite-25` to show closed hours; time off shown as a labelled neutral block ("Time off · Holiday").
- **Appointment blocks:** white background, 1px border in status color, 3px left bar in status color, radius 4px; content: time range (mono or tabular), customer name (500), vehicle, first service. Truncate gracefully; full details on click.
  - Scheduled: steel; In progress: graphite-900 outline; Completed: green bar, text slightly muted; Cancelled/no-show: hidden by default (toggle "Show cancelled"), shown struck-through when visible.
- **Tentative items** (toggle, on by default), always visually distinct from confirmed appointments and never counted as completed or scheduled jobs:
  - *Pending request (no hold):* dashed amber outline, transparent fill, label "Request". Uses no capacity; may overlap anything.
  - *Held request:* solid 1px steel border with diagonal `steel-50` hatch fill, label "Held · until 3:00 PM". **Uses one job slot** like an appointment, but is visibly not a job. Disappears from the grid at its expiry time (on next refresh/poll), matching the database rule that expired holds don't count.
  - *Time proposed (waiting on customer):* dashed steel outline, label "Proposed · held until 3:00 PM". Uses one job slot.
- **Concurrent jobs (capacity > 1):** Day and Week views lay out overlapping items in side-by-side lanes. The number of lanes equals the business's capacity; items that use capacity (appointments, holds, proposals) occupy lanes; pending requests without holds render in a narrow overflow column on the right so they never look like they take a slot.
- **Capacity usage band:** a 4px strip along the left of the day column shaded by usage — `graphite-100` (free), `steel-100` (partly used), `steel-600` (full). Hovering/tapping a band shows "2 of 3 jobs in use, 9:00–11:00 AM". Text equivalents are available to screen readers and in the Agenda view ("Full 9:00–11:00 AM").
- **Mobile businesses (capacity 1):** single lane — the calendar looks exactly like a normal one-person schedule; no capacity strip is shown unless capacity > 1.
- Multiple pending requests for the same time stack in the overflow column with a "2 requests" label.
- **Buffers** shown as a faint hatched extension after jobs so the owner understands why slots are blocked.
- **Navigation:** "Today" button, previous/next arrows, date label ("Mon, Nov 3 – Sun, Nov 9, 2026"), view switcher as a segmented control.
- **Creating:** click an empty slot (desktop) or "+" (mobile) opens "New appointment" prefilled with that time. **No drag-and-drop or inline time editing** — every scheduling change is an explicit action (Reschedule, Cancel, Hold…) that calls an authorized server-side operation (D-24) and shows the database's result.
- **Daily cap indicator** (optional daily job limit): day header shows "3 of 3 jobs today" when at the cap. This is separate from simultaneous capacity and labelled differently.

### 13.5 Modals, sheets and popovers

- Use modals only for: confirmations, short focused forms (≤ 4 fields, e.g., "Decline request", "Add time off"), and the "Let the customer know" panel. Larger creation flows are full pages.
- Desktop modal widths: 440px (confirm), 560px (form). Padding 24px. Title `h3`, body `body`, actions bottom-right. Close icon top-right (with accessible name).
- Mobile: bottom sheets (§11.2).
- Focus moves to the first meaningful element (or title for confirmations); trapped; returned on close; `Esc` and scrim click close unless there's unsaved input (then confirm).
- Never stack modals. Never open a modal on page load.
- Popovers/menus: `shadow-md`, 6px radius, 4px internal padding, 36px items, keyboard navigable.

### 13.6 Empty states

Each list/page has a designed empty state: **plain title, one sentence of context, one action**. Optional 20px Lucide icon in `graphite-400`. No illustrations, no jokes.

| Screen | Title | Body | Action |
|---|---|---|---|
| Requests (pending) | No requests waiting | New requests from your booking page will appear here. | Copy booking link |
| Calendar (agenda, empty week) | Nothing scheduled this week | Approved requests and appointments you add will show here. | New appointment |
| Customers | No customers yet | Customers are added when you approve a request, or you can add existing ones now. | Add customer |
| Leads | No leads | Quote requests from your booking page and enquiries you log will appear here. | Add lead |
| Quotes | No quotes yet | Create a quote for jobs like coatings or correction that need a custom price. | New quote |
| Tasks | You're all caught up | Follow-up reminders for quotes and past customers will appear here. | Add task |
| Analytics | Not enough data yet | Analytics are based on jobs you've recorded. Complete a few appointments to see trends. | View calendar |
| Search (no results) | No matches for "tacoma" | Try a name, phone number, email or plate. | Clear search |
| Communication log | No conversations logged | Log calls, texts and messages so you remember where things stand. | Log communication |
| Templates | — (defaults always exist) | — | — |
| Notifications | No notifications | New requests, customer responses and cancellations will appear here. | — |
| Leads in Follow-up due | No follow-ups due | Leads appear here when their follow-up date passes without a reply. | View all leads |

Filtered empty states say so: "No completed appointments in October" + "Clear filters".

### 13.7 Feedback: toasts, banners, inline messages

- **Toast** (bottom-left desktop, above tab bar on mobile): confirmation of completed actions ("Request approved · View appointment"). 5s auto-dismiss, pause on hover/focus, max one visible.
- **Inline banner** (full-width within content, 6px radius, status background + border): persistent conditions ("Your booking page is paused. Customers can't send requests." · "Turn on").
- **Inline field errors** per §13.2.
- Never use toasts for errors that need action; show those inline.

### 13.8 Badges and status

- Height 22px, 4px radius, 8px horizontal padding, `body-sm` 500 weight, status text/background/border from §3.4, optional 6px dot or 12px icon.
- Labels and tones:
  - **Booking requests:** Pending (attention) · Held (info, shown alongside Pending) · Time proposed (info) · Approved (positive) · Declined · Proposal declined · Withdrawn · Expired · Duplicate (all neutral)
  - **Appointments:** Scheduled (info) · In progress (outlined graphite) · Completed (positive) · Cancelled (neutral) · No-show (critical)
  - **Leads:** New (neutral) · Contacted (info) · Quote sent (info) · Follow-up due (attention) · Booked (positive) · Lost (neutral)
  - **Quotes:** Draft (neutral) · Sent (info) · Accepted (positive) · Declined · Expired (neutral)
  - **Tasks:** Overdue (critical) · Due today (attention)
  - **Account:** Pilot (neutral) · Trial (info) · Trial ends soon (attention) · Restricted (critical)
- Status names in badges match the product plan exactly; never invent synonyms per screen.
- One status badge per row. Don't use badges as decoration or for counts.

### 13.9 Analytics components

- **Metric:** label (`label`, `graphite-600`), value (`metric`), comparison line in `body-sm` ("vs. $3,120 in September" — plain text; arrow icon allowed; green/red only for direction where meaning is unambiguous). Info icon opens the metric's definition.
- Metrics sit in a simple row separated by vertical dividers, **not** in individual shadowed cards.
- **Money values are always labelled with their exact term** and never combined into one "revenue" figure:
  - "Quoted value" — helper: "Quotes you sent"
  - "Booked job value" — helper: "Estimated value of scheduled and completed jobs"
  - "Recorded revenue" — helper: "Amounts you entered when completing jobs"
- **Sequence, not causation:** metrics that relate follow-ups to bookings use "after" wording and carry the fixed note: "Shows timing only — it doesn't mean the follow-up caused the booking."
- **Insufficient data:** the metric slot shows "Not enough data yet" in `body-sm` with the count ("3 decided requests — percentages appear at 5"). Never a 0% or a dash that could be misread as a real result.
- Bar charts preferred; line charts for time series ≥ 8 points; no donuts with center numbers; every chart has a title, axis labels, and an accessible text summary.
- Small sample handling per PRODUCT_PLAN §11 (rates need at least 5 items).

### 13.10 Other components

- **Tabs:** text tabs with 2px `graphite-900` underline for active; counts in parentheses-free plain numerals.
- **Segmented control:** for view switches (Day/Week/Agenda); 32px, 1px border, active `graphite-0` with `shadow-sm` on `graphite-50` track.
- **Search / command:** global search overlay (⌘K / Ctrl+K on desktop) listing customers, vehicles (by plate), quotes (by number).
- **Avatar:** initials only (no generated avatars), `graphite-100` background, `graphite-700` text, circular, 28/32px.
- **Timeline:** activity list with 12px dots on a 1px `graphite-200` line; timestamp `body-sm` `graphite-500`.
- **Skeletons:** see §8.
- **Notify panel ("Let the customer know"):** template picker, editable message text area (pre-filled, includes the status link), then buttons "Copy message", "Open in Messages", "Open in Mail", "Call" (secondary, with icons). Helper text: "These open your own apps. DetailerHQ doesn't send messages." After any of them is used, the "Did you send it?" prompt appears (§13.14).

### 13.11 Customer status page (`/r/[token]`)

The most important customer-facing screen: it replaces confirmation texts in the MVP.

```
┌──────────────────────────────────────────┐
│ Northside Detail Co.                     │  business name (h3), phone · text links
│ Call · Text                              │
├──────────────────────────────────────────┤
│ [Pending]                                │  badge
│ Request received — not confirmed yet     │  headline (h2)
│ Northside Detail Co. will confirm,       │  next-step paragraph (body)
│ decline, or suggest another time.        │
│                                          │
│ Requested   Sat, Nov 8 · 9:00 AM CT      │  definition list
│ Service     Full detail                  │
│ Vehicle     2021 Tesla Model Y · White   │
│ Location    1234 Oak St, Austin          │
│ Estimate    From $310 · about 4h 30m     │
│                                          │
│ [ Withdraw request ]                     │  secondary; primary only when a choice is needed
│                                          │
│ Save this page to check for updates.     │  body-sm + Copy link
│ History                                  │  compact timeline (sent, proposed, confirmed…)
└──────────────────────────────────────────┘
```

- One state per page, using the headline and next-step text from PRODUCT_PLAN §6.4 verbatim (centralised copy).
- **Pending with a hold:** an info-tone note under the headline: "Your requested time (Sat, Nov 8, 9:00 AM CT) is being held while Northside Detail Co. reviews your request. This is not a confirmation yet." The hold expiry is not emphasized to the customer (it's an owner tool), but the page never implies confirmation.
- **Time proposed:** a highlighted block (info tone, 1px border, 6px radius) showing the proposed time, the owner's message, "Held for you until [time]", and two buttons: **Accept this time** (primary) and **Decline** (secondary). Declining asks for confirmation.
- **Contact details masked:** the customer's own details appear as "Phone ending 0142 · Email j•••@gmail.com"; the service address is shown in full only for confirmed mobile appointments.
- **Ask to reschedule** (only if REC-04 is approved; before the business's rescheduling cutoff): secondary button opening a sheet with available start times and an optional note. Submit label "Send reschedule request". Result state: "Reschedule request sent — your appointment is still [current time] until [Business] changes it." After the cutoff, the button is replaced by the rescheduling policy text and call/text links.
- **Rescheduled:** new time prominent; previous time shown struck through in `graphite-500` with "Changed on Nov 5".
- **Cancel before cutoff** (only if the business allows online cancellation): secondary button "Cancel appointment" → confirmation sheet stating the business's policy and cutoff ("Online cancellation is available until Fri, Nov 7, 9:00 AM CT"); after the cutoff the button is replaced by the policy text and call/text links.
- Dates always include the weekday, date, time and **timezone abbreviation**.
- No DetailerHQ marketing on this page beyond the "Powered by" footer link.

### 13.12 Propose a different time & conflict warnings

- **Propose dialog** (sheet on mobile): date picker + available start times computed for the requested duration (same component as the public time picker), optional message to the customer (shown on the status page), and "Customer must answer by" (default from settings, 2–72 h). Primary: "Propose this time". Helper: "This time is held for the customer until then."
- **Hold this time** (request detail, secondary action): small dialog with a duration segmented control — 2 h · 12 h · 24 h · 48 h · 72 h (values per REC-01; default from settings; options past the requested start are disabled with the reason) — and a one-line explanation: "Holding uses one job slot for this time and removes it from your booking page if no slots remain. It is not a confirmation. It ends automatically at the time shown, or when you release it." Primary: "Hold until Fri 3:00 PM". If no capacity is left for that interval, the dialog shows the capacity-full message instead of the duration choice.
- **Held state on request detail:** info banner "Held until Fri, Nov 7, 3:00 PM CT · Release hold". Approve keeps working ("Approve" converts the hold). In the last 2 hours the banner switches to attention tone: "Hold expires in 1h 40m".
- **Other requests for a held time** show a neutral line: "This time is held for R-0041 (Jordan Reyes)." Approve is replaced by "Release hold and approve…" which opens a confirmation naming the other request.
- **Conflict warnings** appear inline above the action bar on request detail, new appointment, reschedule and propose screens:
  - *Capacity full* (critical tone), worded by capacity:
    - Capacity 1: "You already have Marcus Bell's appointment 9:00 AM–1:00 PM. Choose another time."
    - Capacity > 1: "All 3 job slots are in use from 10:30 to 11:00 AM (Marcus Bell, Priya Natarajan, held for R-0041)."
    The confirm action is disabled; "Propose a different time" is offered; if a hold is part of the reason, "Release hold for R-0041…" is offered as a separate, explicit action.
  - *Result from the server:* if the database rejects an action because capacity was taken a moment earlier (another device, a customer accepting a proposal), show the same message inline with "This time was just taken" and refresh the capacity view. Never retry silently.
  - *Soft warnings* (attention tone), listed individually: "Inside the 30-minute buffer after Marcus Bell's job" · "Outside working hours" · "This would be the 4th job on Sat (limit 3)". Confirm button label changes to "Approve anyway" and requires a checkbox "I've checked these warnings".
- **Possible duplicate** flag (attention tone) on request rows and detail: "Possible duplicate — same phone as request R-0041 (pending)". Links to the other request; action "Close as duplicate".

### 13.13 Notification center

- Bell icon button in the top bar with unread count (numeric, `body-sm`, graphite pill — not red unless a pending request is older than 24h).
- Opens a popover (desktop, 380px) or full-screen sheet (mobile) listing notifications newest first: icon (16px), one-line title ("Jordan Reyes accepted Sun, Nov 9, 10:00 AM"), relative time, unread dot. Clicking marks read and opens the related record.
- "Mark all as read" text button. Empty state: "No notifications."
- Full page at `/app/notifications` with the same list and filters (Unread / All).
- No sounds, no browser push prompts in the MVP.

### 13.14 Message templates and "Did you send it?"

- **Templates list** (`/app/settings/templates`): table/list of templates by purpose with a one-line preview; "Edit" opens a form page.
- **Template editor:** name, purpose (select), body textarea (monospace off; `body` font) with an **Insert field** menu listing placeholders by human name ("Customer first name", "Status link"). Placeholders render in the editor as non-editable tokens with a `graphite-50` background and 4px radius (e.g., `Customer first name`), never raw `{curly_braces}` for the owner. A live preview below renders with sample fictional data and is labelled "Preview with sample details".
- Character count shown (`body-sm`), with a note at > 300 characters: "Long texts may be split by some phones."
- **Use in context:** the notify panel fills placeholders from the record; any missing value is shown as an amber highlighted token "Address missing" and the Copy/Open buttons are disabled until edited, with the reason stated.
- **"Did you send it?" prompt:** after Copy / Open in Messages / Open in Mail, when the owner returns, an inline bar (not a modal) asks "Did you send it to Jordan?" with **Yes, log it** and **Not yet**. Yes creates an outbound communication entry; Not yet dismisses. Never auto-logged.

### 13.15 Communication log

- Appears as a section on customer and lead detail pages (and in the right rail timeline on appointments/requests).
- Each entry: channel icon from Lucide (`phone`, `message-square`, `mail`, `message-circle` for social DMs, `user` for in person — no social-network brand logos) plus the channel name in text, direction ("You → Jordan" / "Jordan → You"), timestamp, summary text, optional "Template: Quote follow-up".
- **Log communication** form (sheet/modal ≤ 4 fields): channel (segmented or select), direction (Outbound / Inbound), when (defaults to now), summary. Inbound entries on leads show the note "Marks this lead as responded".
- Entries are editable/deletable by the owner with an "edited" marker.

### 13.16 Account banners and restricted state

- **Banner** under the top bar, full content width, 40px min height, status tone background + 1px border, text + one action:
  - Pilot: neutral — "Pilot access until Dec 15, 2026." · "View pilot terms" (shown only in the final 14 days).
  - Pending activation: info — "Verify your email to activate your account and publish your booking page." · "Resend email". (Paid-launch stage adds: "Your 7-day trial starts once you're activated.")
  - Trial (paid-launch stage): info — "Trial ends Thu, Nov 6 at 3:42 PM CT." · "Choose a plan"; attention tone from 3 days before.
  - Restricted: critical — "Your trial has ended. Your data is safe and read-only. Subscribe to keep taking requests." · "Subscribe" · secondary "Export data".
- **Restricted (read-only) state:** create/edit/approve buttons are removed, and each page header shows one plain line instead: "Read-only — subscribe to make changes" (visible text, not a hover tooltip); forms render as read-only text, not disabled inputs; export, account settings and subscription remain fully interactive. The booking page shows the business's contact details with "Not accepting online requests right now."
- Never use countdown timers, flashing, or urgency language ("Only 2 days left!!").
- **Closing state:** critical banner "Your account is scheduled for deletion on Dec 14, 2026. Your booking page is offline." · "Cancel closure" · "Export data".

### 13.17 Approve: link customer and vehicle

Shown when the owner taps **Approve** (desktop: side panel 480px; mobile: full-height sheet). Two short steps, each with a clear default:

1. **Customer** — "Matches in your customers" list (only this business; exact phone/email matches first), each row showing name, phone, email and number of vehicles. Options: select a match, or **Create new customer from this request** (default when no match). Never auto-merged.
2. **Vehicle** — if an existing customer was chosen, radio list of **that customer's** vehicles (`2021 Tesla Model Y · White · plate ABC1234`) with the request's vehicle description shown above for comparison and the closest match pre-selected only when year/make/model match exactly; plus **Add as new vehicle** (pre-filled from the request, editable). For a new customer, the vehicle form is pre-filled.

Footer: conflict summary (if any soft warnings) and primary "Approve request". The vehicle choice is required; the button stays enabled and explains what's missing if pressed early.

### 13.18 Policy settings

`/app/settings/policies` and onboarding step 4 use one form:

- **Online cancellation** — toggle "Let customers cancel from their status link".
- **Cancellation cutoff** — number input + unit (hours), helper: "Suggested: 24 hours. Choose what works for your business." The value is pre-filled with 24 but labelled as a suggestion, never as required.
- **Rescheduling cutoff** — same pattern, controls "Ask to reschedule".
- **Policy texts** — two textareas with neutral examples shown as placeholders-in-helper-text (not prefilled), 1,000-character counters.
- **Holds and proposals** — "Default hold length" (2–72 h, default 24 h) and "Time customers have to answer a proposed time" (2–72 h, default 48 h).
- Live preview of how the policy appears on the customer status page.

### 13.19 Capacity setting

Used in onboarding step 2 and on `/app/availability`.

- Question as the label: **"How many vehicles can you work on at the same time?"** Helper: "Count bays or crews that can each run a job at once. Most mobile detailers work on one vehicle at a time."
- Control: a stepper (− / number / +) with 44px targets, range 1 to the maximum (REC-19), plus direct numeric entry.
- **Mobile-only businesses:** shown as "1 vehicle at a time" with a quiet "Change" link only if REC-17 is approved; otherwise read-only text explaining how to change service mode.
- **Shops and mixed businesses:** stepper always shown; onboarding requires an explicit confirmation of the value (REC-16).
- **Decreasing capacity:** if future bookings would exceed the new value, the save fails with an inline list ("Sat, Nov 8, 9:00–11:00 AM — 3 jobs booked") and links to each appointment. No partial save.
- Never displayed on public pages.

---

## 14. Avoiding generic AI-generated aesthetics

Generic AI-made and template sites share recognisable tells. We avoid them deliberately and review every design against this list.

### 14.1 Do not

- **Purple-to-blue or multicolor gradients**, gradient text, mesh gradients, aurora backgrounds.
- **Glows**, neon edges, glassmorphism (frosted blur panels), noise-texture overlays used as decoration.
- **Decorative blobs**, abstract 3D shapes, floating orbs, grid-dot backgrounds, sparkles.
- **"Bento grid"** of rounded cards each holding an icon, a two-word title and one sentence.
- **Icon-in-a-rounded-colored-square** feature tiles; three-column feature rows with identical structure.
- **Oversized headlines** (> 56px) and centred hero text with a pill badge above ("✨ New: AI-powered…").
- **Emoji** as icons or bullet points; "🚀", "✨", "🎉".
- **Inflated rounded corners** (16–32px) on everything, pill buttons, cards nested in cards.
- **Fabricated social proof**: fake logos, stock-photo testimonials, "Join 10,000+ detailers", 4.9★ ratings, invented percentages ("Save 10 hours a week").
- **Unsupported performance claims**: "Double your bookings", "Never miss a lead again", "Grow revenue 30%". See the claims policy (§2.4).
- **Fake product UI**: dashboard mockups drawn in a design tool with impossible data, instead of real screenshots.
- **Generic SaaS copy**: "Unlock", "Supercharge", "Seamless", "Elevate", "All-in-one platform", "Take your business to the next level", "Effortlessly".
- **Dashboard templates**: KPI-card rows with sparkline + "↑ 12.5%" on fake data, donut charts for decoration, gradient area charts.
- **Excessive motion**: scroll-reveal on every section, marquee logos, hover tilt, typing effects, counting numbers.
- **AI-generated photography or illustrations**, isometric illustrations, cartoon people, 3D render mascots.
- **Default component-library looks** (unmodified shadcn/Material/Bootstrap themes) and default fonts (Inter, Poppins).
- **Dark mode with neon accents** as the "premium" signal.

### 14.2 Do

- **Asymmetry with purpose:** left-aligned type, a strong photograph balancing a text column, content-driven layouts rather than repeated identical blocks.
- **Typography as the main design element:** careful sizes, weights, tracking, tabular numbers, real hierarchy.
- **Real product, real data:** screenshots from the actual app with believable detailing content (§2.3).
- **Specificity in copy:** "Approve a Saturday interior detail from the driveway in two taps" beats "Manage bookings effortlessly".
- **Craft details** that reward attention: aligned baselines, consistent 4px rhythm, precise hairlines, perfectly aligned numerals, considered empty states, correct typographic quotes (" ") and dashes (–, —), non-breaking spaces between number and unit.
- **Restraint:** one accent per view, one primary button, flat surfaces, borders over shadows.
- **Honesty:** a visible "what's not included yet" section, a real founder's name and email.
- **Domain cues from the trade, used sparingly:** inspection-light photography, the precision of a paint-depth gauge reading, monospace plates — never clichés like checkered flags, speedometers, or tire-track graphics.

### 14.3 Litmus test

Before shipping any screen, ask:

1. Could this screen belong to *any* SaaS product if the logo were removed? If yes, it's too generic — add specificity through content and detail.
2. Is any element here only because "landing pages usually have one"? Remove it.
3. Does every number on screen come from real recorded data or clearly labelled sample content?
4. Would a working detailer understand every label without explanation?

---

## 15. Tokens and implementation notes

### 15.1 Semantic tokens

Components use semantic tokens; semantic tokens map to the palette. This allows dark mode and rebranding later.

```css
:root {
  /* Surfaces */
  --color-bg-canvas:        #FAFAF9;  /* graphite-25 */
  --color-bg-surface:       #FFFFFF;  /* graphite-0 */
  --color-bg-subtle:        #F4F4F2;  /* graphite-50 */
  --color-bg-selected:      #EEF3F8;  /* steel-50 */
  --color-bg-inverse:       #171716;  /* graphite-900 */

  /* Text */
  --color-text-primary:     #171716;
  --color-text-secondary:   #6B6B66;
  --color-text-label:       #52524E;
  --color-text-disabled:    #8E8E89;
  --color-text-inverse:     #FFFFFF;
  --color-text-link:        #2F5D8A;
  --color-text-link-hover:  #244A70;

  /* Borders */
  --color-border-subtle:    #E9E9E6;
  --color-border-default:   #DADAD6;
  --color-border-strong:    #BDBDB8;
  --color-border-input:     #BDBDB8;
  --color-focus-ring:       #3D6E9E;

  /* Actions */
  --color-action-primary-bg:        #171716;
  --color-action-primary-bg-hover:  #262624;
  --color-action-primary-text:      #FFFFFF;

  /* Status (text / bg / border) */
  --color-attention-text: #8A5A00; --color-attention-bg: #FBF3E2; --color-attention-border: #EBD6A8;
  --color-info-text:      #2F5D8A; --color-info-bg:      #EEF3F8; --color-info-border:      #C9D8E7;
  --color-positive-text:  #2E6B3F; --color-positive-bg:  #EAF3EC; --color-positive-border:  #C3DDC9;
  --color-critical-text:  #A6352B; --color-critical-bg:  #FBECEA; --color-critical-border:  #EBC3BE;
  --color-neutral-text:   #52524E; --color-neutral-bg:   #F0F0EE; --color-neutral-border:   #DADAD6;

  /* Radii */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(23,23,22,0.06);
  --shadow-md: 0 4px 12px rgba(23,23,22,0.08), 0 1px 3px rgba(23,23,22,0.06);
  --shadow-lg: 0 12px 32px rgba(23,23,22,0.12), 0 2px 6px rgba(23,23,22,0.06);

  /* Motion */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 120ms; --duration-base: 160ms; --duration-slow: 200ms;

  /* Type */
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}
```

### 15.2 Implementation rules

- If a utility CSS framework is used, its theme is **replaced** (not extended) with these tokens so default colors, radii and shadows aren't available by accident.
- Lint for raw hex values and arbitrary pixel values outside `/src/ui/tokens`.
- Each component has: default, hover, focus-visible, active, disabled, loading (if applicable), error (if applicable) states — all designed before implementation.
- A `/dev/ui` route (development only) renders every component with realistic content for review and screenshot tests.
- The product name, wordmark and "Powered by" text come from one configuration value.

---

## 16. Design review checklist

Use for every new screen or significant change.

- [ ] Designed and checked at 375px, 768px and 1280px (and 320px for reflow).
- [ ] Context rules followed (§1.1): no brass or imagery in the dashboard or public pages; detailer's brand leads on public pages.
- [ ] Uses only tokens; no new colors, radii, shadows or font sizes.
- [ ] One primary action; button labels are verb + object.
- [ ] Realistic content; long names, long vehicle models and empty values tested.
- [ ] Empty, loading, error and success states designed.
- [ ] Status conveyed by text, not color alone.
- [ ] Keyboard path and focus order verified; visible focus.
- [ ] Touch targets ≥ 44px on mobile for primary actions.
- [ ] Copy is honest about what the system does (no implied sending, charging or automation); requests are never called bookings.
- [ ] Numbers shown come from recorded data or are clearly labelled sample/estimate; quoted, booked and recorded values are labelled distinctly.
- [ ] Times on customer-facing screens include the timezone abbreviation.
- [ ] Scheduling screens show capacity usage and database results honestly; no scheduling change happens without an explicit action (D-24); capacity is never shown on public pages (D-25).
- [ ] Marketing: passes the claims policy (§2.4) — no fake testimonials, invented statistics, unsupported claims, or stage-inappropriate "free trial" wording.
- [ ] The product name comes from configuration, not hard-coded text.
- [ ] Passes the §14 litmus test.
