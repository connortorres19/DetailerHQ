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
| `src/components/film/CinematicFilm.tsx` | The scroll-controlled opening film, the phone hand-off and (on large screens) the showcase inside the same pin |
| `src/components/sections/` | Overview, Features, ShowcaseStage (shared tabs/frame), ProductShowcase (tab section fallback), HowItWorks, PhotoBand, Scope, Pricing, Faq, Closing |
| `src/config/film.ts` | Film sources, posters, duration, hand-off time, chapter captions |
| `src/lib/gsap.ts` | Single GSAP + ScrollTrigger registration |
| `media/source/` | Untouched film master (**not committed**), README and SHA-256 checksum |
| `public/media/film/` | Web encodes and posters (committed, ~21 MB) |
| `scripts/encode-film.sh` | Rebuilds `public/media/film/` from the master with ffmpeg |

## Opening film (DESIGN_SYSTEM §8.1, revision 4.2)

Source: owner-supplied Runway commercial (23.5 s, 1920×1080, 60 fps). The master stays untouched in `media/source/` and is git-ignored; web versions are 30 fps H.264 MP4s with short keyframe intervals so seeking works in both directions, no audio, `+faststart`.

| File | Used for | Size |
|---|---|---|
| `film-1080.mp4` (GOP 8) | Large screens where width × DPR ≥ 1500 | 10.9 MB |
| `film-720.mp4` (GOP 6) | Other desktops; tablets | 7.6 MB |
| `film-540.mp4` (GOP 10) | Phones | 3.0 MB |
| `poster-start-*`, `poster-reveal-*` | First paint; static fallback | 54–116 KB each |

How it works:
- **Modes** (chosen on the client, re-chosen when the viewport or motion preference changes):
  - Desktop, ≥ 1024 × 640: one pin, 9.85 stage heights.
  - Compact (phones, tablets, short screens): film band, 2.75 stage heights, then the tab showcase.
  - Static: reduced motion, Data Saver or 2G, a load failure, or before JavaScript runs.
- **Scrubbing:** a GSAP timeline tweens a playhead with the scroll position. A ticker sets `video.currentTime` only when the previous seek has finished, so seeks never queue up. The video streams natively (`preload="auto"`, byte-range requests) and isn't copied into memory by script.
- **Safety:** the start poster stays visible until the video has decoded a frame. If no frame arrives within 15 s, or the video errors, the page switches to static mode. On iOS, a muted play-then-pause primes the element so seeks render.
- **Phone hand-off (desktop):**
  1. From 22.45 s the phone screen covers the frame. A graphite curtain fades over the black screen.
  2. The real Today preview fades in, already scaled so its screen covers the stage. The screen's height is set to the stage's aspect ratio, so nothing is cropped.
  3. It holds for 0.3 stage heights, then shrinks into the showcase frame while the tabs fade in.
  4. The seven screens step and snap as before.
- **Links:** `#product` links (header, "Explore the platform", "Back to the product tour") scroll to the showcase inside the pin. "Skip film" goes to `#overview`.
- **Credit:** "Film: AI-generated" is shown in the film. No Mercedes branding is used on the site.

To rebuild the assets after replacing the master: `scripts/encode-film.sh`. Update `film.duration`/`film.handoff` in `src/config/film.ts` if the timing changes.

## Honesty constraints applied

- Every CTA navigates within the page. "Join early access" carries a visible "Not open yet" tag; there is no form, sign-up, login or booking.
- Photography elsewhere is marked placeholders only (photo band shots 05–07). The only AI imagery is the owner-supplied opening film, credited on the page.
- No founder biography; a short mission statement instead.
- No testimonials, user counts, ratings or performance claims. Analytics figures are labelled sample data.
- Pricing shows "$25 for your first month" as a **proposal, not available to purchase**; the price after the first month is "to be confirmed" (Q-1 open). $49 is not shown. "Free trial" is not used.
- The brand name is flagged as a working name in the header/footer copy and FAQ. The page is `noindex`.

## Not done / follow-ups

- Licensed photography for photo band shots 05–07.
- Trademark review of the Mercedes-AMG GT footage before public launch.
- Manual Safari (macOS) and iOS Safari testing of the film; automated tests ran in Chromium only.
- Contact details, legal pages and early-access terms — placeholders only.
- Interface previews are hand-built HTML; DESIGN_SYSTEM §2.3 asks for real product screenshots once the dashboard exists.
- Brand name clearance.
