# Phase 2 — Marketing website (visual milestone)

Status: built and running locally. Not deployed. No database, auth, forms or payments.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck  # next typegen && tsc --noEmit
npm run build
```

## Stack

Next.js 16 (App Router, `src/app`), React 19, TypeScript 5.9 (strict), ESLint 9 with `eslint-config-next`, CSS Modules + global design tokens in `src/app/globals.css` (from DESIGN_SYSTEM.md), `lucide-react` icons, IBM Plex Sans/Mono via `next/font/google` (downloaded at build time and self-hosted). The page is statically prerendered.

## Structure

| Path | Contents |
|---|---|
| `src/config/brand.ts` | Provisional name, stage and contact placeholder — change the name in one place |
| `src/components/ui/` | Container, SectionHeading, ButtonLink (with "preview" tag), StatusBadge, PhotoPlaceholder, InterfaceFrame |
| `src/components/layout/` | Wordmark, SiteHeader (sticky, accessible mobile menu), SiteFooter, section links |
| `src/components/previews/` | HTML interface previews with DESIGN_SYSTEM §2.3 sample data: Today, Requests, Calendar (two-bay capacity), Customer, Quote, Follow-ups, Analytics, phone booking page |
| `src/components/sections/` | Hero (scroll sequence 1), Overview, Features, ProductShowcase (scroll sequence 2 / ARIA tabs), HowItWorks, PhotoBand, Scope, Pricing, Faq, Closing |
| `src/config/heroFrames.ts` | Shot list for the hero sequence (shots 01–04); add licensed images here |
| `src/lib/gsap.ts` | Single GSAP + ScrollTrigger registration |

## Scroll-driven sequences (DESIGN_SYSTEM §8.1, revision 4.1)

GSAP 3.15.0 + ScrollTrigger with `@gsap/react` 2.1.2 (`useGSAP`), set up with `gsap.matchMedia()`. About 46 KB gzipped. No smooth-scroll library; native scrolling, anchors and keyboard scrolling are unchanged.

| | Large screens (≥ 1024 × 720) | Phones, tablets, short screens | Reduced motion |
|---|---|---|---|
| **Hero** | Hero pins for 1.6 viewport heights. The crop widens (0.84 → 1) with a push-in (1.08 → 1), then four frames cross-fade. A counter shows the shot number and label. Copy never moves. | Not pinned. A gentler crop (0.92 → 1) and the same cross-fades, scrubbed while the image scrolls past. | Final frame, static and uncropped. |
| **Product showcase** | The stage pins for 0.55 viewport heights per step. Seven screens fade out, then in, snapping to the nearest screen. Tabs act as step links and jump to their position. A brass progress rule shows position. The frame scales down to fit shorter windows. | The same screens as accessible tabs. | Tabs. |

Only `transform` and `opacity` are animated. The first paint matches each sequence's start state, so nothing jumps on hydration, and all content is server-rendered HTML.

To add the licensed hero photographs: put the files in `src/assets/hero/`, import them in `src/config/heroFrames.ts` and set `image: { src, alt }` on each frame. `next/image` then serves responsive AVIF/WebP. Frames 01 and 04 load with priority.

## Honesty constraints applied

- Every CTA navigates within the page. "Join early access" carries a visible "Not open yet" tag; there is no form, sign-up, login or booking.
- Photography is marked placeholders only. Shots 01–04 (hero sequence, one car) and 05–07 (photo band) describe the licensed image needed. No stock, unlicensed, AI-generated or 3D imagery.
- No founder biography; a short mission statement instead.
- No testimonials, user counts, ratings or performance claims. Analytics figures are labelled sample data.
- Pricing shows "$25 for your first month" as a **proposal, not available to purchase**; the price after the first month is "to be confirmed" (Q-1 open). $49 is not shown. "Free trial" is not used.
- The brand name is flagged as a working name in the header/footer copy and FAQ. The page is `noindex`.

## Not done / follow-ups

- Licensed photography: shots 01–04 (one car, one shoot, consistent light) and 05–07. Needs sourcing and licensing.
- Contact details, legal pages and early-access terms — placeholders only.
- Interface previews are hand-built HTML; DESIGN_SYSTEM §2.3 asks for real product screenshots once the dashboard exists.
- Brand name clearance.
