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
| `src/components/sections/` | Hero, Overview, Features, ProductPreview (ARIA tabs), HowItWorks, PhotoBand, Scope, Pricing, Faq, Closing |

## Honesty constraints applied

- Every CTA navigates within the page. "Join early access" carries a visible "Not open yet" tag; there is no form, sign-up, login or booking.
- Photography is marked placeholders only (shots 01–04 describe the licensed image needed). No stock, unlicensed or generated images.
- No founder biography; a short mission statement instead.
- No testimonials, user counts, ratings or performance claims. Analytics figures are labelled sample data.
- Pricing shows "$25 for your first month" as a **proposal, not available to purchase**; the price after the first month is "to be confirmed" (Q-1 open). $49 is not shown. "Free trial" is not used.
- The brand name is flagged as a working name in the header/footer copy and FAQ. The page is `noindex`.

## Not done / follow-ups

- Licensed photography (shots 01–04) — needs sourcing and licensing.
- Contact details, legal pages and early-access terms — placeholders only.
- Interface previews are hand-built HTML; DESIGN_SYSTEM §2.3 asks for real product screenshots once the dashboard exists.
- Brand name clearance.
