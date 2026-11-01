# Phase 6 — Branding, images and appearance

Migration: `supabase/migrations/20261102120000_branding_media.sql`. Storage is enabled in
`supabase/config.toml` (one private bucket, `business-media`, WebP only, 4 MiB).

## Branding (Settings → Branding)

- Logo, cover photo, primary / secondary / accent colours, gallery (up to 12), one photo per
  service, website, social profiles (Instagram, Facebook, TikTok, YouTube, Google Business Profile,
  Yelp), "show business email", and the customer-facing wording (about, cancellation, rescheduling,
  before-the-appointment). The wording moved here from the Booking page, which now links to it and
  keeps only the online-cancellation switch. Phone and email stay in Settings → Business.
- **Draft → publish.** Edits are saved as a draft (`business_branding.draft`); the live look is
  the published columns plus `booking_settings` wording. The editor shows a live preview as you
  type; "Preview saved draft" opens `/book/<slug>/preview?draft=1` (owner only). Save draft,
  Publish, Cancel changes (back to the last save), Reset to defaults (asks first), Discard
  unpublished changes (asks first). Removing a logo or cover asks first.
- **Colours are free; text stays readable.** `src/domain/branding.ts` turns the owner's colours into
  CSS custom properties with WCAG contrast guaranteed: buttons get white or graphite text (≥ 4.5:1,
  nudging mid-tones darker if neither passes), links a deeper shade where needed (≥ 4.5:1 on white),
  highlights ≥ 3:1, the header band's text and muted text ≥ 4.5:1. The editor says when a shade was
  adjusted. Without colours the page keeps the DetailerHQ defaults.

## Images

1. `POST /app/media/upload` (route handler, same-origin only, owner session): the file is checked
   (≤ 10 MB, JPEG/PNG/WebP by its bytes, not its name), decoded with `sharp` (≤ 40 MP, still images
   only, minimum size per kind), rotated, stripped of EXIF (GPS), resized (logo 512, cover 2400,
   gallery 1600, service 1200 px max) and re-encoded to WebP.
2. `public.begin_media_upload(kind)` reserves `<id>.webp` (limits: 10 uploads in flight, 80 images,
   12 gallery photos).
3. The owner's own session stores the file; Storage RLS only accepts a reserved, pending name of
   the caller's business.
4. `public.finish_media_upload` checks the stored object (WebP, size) and puts the image in the draft.
   Any failure cancels the slot (`cancel_media_upload`) and deletes what was stored.

Images are served at `/media/<id>.webp` (`src/app/media/[file]/route.ts`). The app holds no Storage
key: owners read with their session (their business's images, drafts included); everyone else reads
with the publishable key, and Storage RLS only allows images in the **published** look of a **public**
booking page (offline, suspended or closing pages, archived services and drafts are private).

**No orphans.** Images no longer used by the draft or the published look (replaced, removed,
discarded) and uploads abandoned for an hour are marked `deleting` (`media_garbage`); the owner's
session deletes those files (Storage RLS allows deleting only marked files of their business); rows
are removed only once their file is gone (`purge_media`). Runs after every upload, save, publish and
discard. A business's data deletion (`app.delete_business_data`) can't delete Storage files: run
`node scripts/storage-sweep.mjs` (operator tool, uses the Storage admin key from a trusted machine;
`--dry-run` lists) to remove files that no longer have a row. Such files are already unreadable.

## Appearance (Settings → Appearance)

Light, Dark or Match my device, saved per user in `public.user_preferences` (own row only). The
app layout renders `<div class="app-theme" data-theme="…">` from the saved value, and `globals.css`
applies the dark tokens while it's on the page (`:root:has(...)`), so the right theme is in the first
HTML — no flash, no script. Dark mode reverses the graphite scale (same token names) and adjusts
steel, status colours and shadows; `tests/unit/branding.test.ts` checks the dark tokens' contrast and
that the "dark" and "match my device" blocks are identical. Public pages (booking, status, quote)
never carry the wrapper: they stay light in the business's own look; the branding preview is forced
light inside a dark dashboard.

## Tests

- `supabase/tests/database/16_branding_media.test.sql` — writes only through functions, validation
  (colours, links, look-alike domains, foreign images/services), draft privacy, publish, Storage
  read/insert/delete rules, replace/remove/discard garbage, limits, theme preferences.
- `tests/node/media.test.js` — the real Storage API with owner sessions and the publishable key.
- `tests/unit/branding.test.ts` — contrast across the colour spectrum, link and form validation,
  dark-token contrast and sync.
- `tests/e2e/branding.spec.ts` — uploads (valid and refused), draft preview, publish, replace and
  remove with file deletion, booking on a branded page, cancel/reset/discard, isolation between
  businesses, cross-site upload refusal, theme persistence across sign-in, no-flash SSR, an automated
  contrast audit of every dashboard screen in light and dark, 390 px and 1280 px layouts.

## Troubleshooting: `relation "storage.buckets" does not exist`

The `storage` schema is created by the Supabase Storage service the first time it starts against a
database (hosted projects always have it). A local stack that was running before Storage was
enabled in `supabase/config.toml` doesn't have it: `supabase start` on an already-running stack keeps
the old settings. Restart the stack (keeps your data — never `db reset`), then apply the migration:

    npx supabase stop
    npx supabase start
    npm run storage:check
    npx supabase migration up --local

`npm run storage:check` (read-only) reports what's missing and the command that fixes it. The Phase 6
migration checks this first and stops with these instructions before changing anything.
