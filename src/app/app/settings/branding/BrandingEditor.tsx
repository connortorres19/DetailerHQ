'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Trash2 } from 'lucide-react';
import { ImageField, precheck, uploadImage, type UploadedImage } from '@/components/app/media/ImageField';
import { Button, ButtonLink } from '@/components/app/ui/Button';
import { TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { Panel } from '@/components/app/ui/Panel';
import { colorNotes, EMPTY_LOOK, isHex, mediaUrl, SOCIAL_NETWORKS, type BrandingDraft } from '@/domain/branding';
import { formatPhone } from '@/domain/business';
import { idle, type FormState } from '@/domain/forms';
import { discardBranding, publishBranding, saveBranding } from './actions';
import { BrandPreview, type PreviewBusiness } from './BrandPreview';
import styles from './branding.module.css';

export type EditorAsset = UploadedImage;
type Service = { id: string; name: string; addon: boolean };

const COLOR_FIELDS = [
  { key: 'primary_color', name: 'primaryColor', label: 'Primary', hint: 'Buttons, selected times and links.' },
  { key: 'secondary_color', name: 'secondaryColor', label: 'Secondary', hint: 'Frames your header when there’s no cover photo.' },
  { key: 'accent_color', name: 'accentColor', label: 'Accent', hint: 'Small highlights: progress, checked options. Defaults to primary.' },
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function toFormData(d: BrandingDraft) {
  const fd = new FormData();
  fd.set('primaryColor', d.primary_color ?? '');
  fd.set('secondaryColor', d.secondary_color ?? '');
  fd.set('accentColor', d.accent_color ?? '');
  fd.set('website', d.website_url ?? '');
  if (d.show_email) fd.set('showEmail', 'on');
  fd.set('intro', d.intro_text ?? '');
  fd.set('cancellation', d.cancellation_policy_text ?? '');
  fd.set('rescheduling', d.reschedule_policy_text ?? '');
  fd.set('prep', d.prep_instructions ?? '');
  for (const n of SOCIAL_NETWORKS) fd.set(`social_${n.key}`, d.social_links[n.key] ?? '');
  fd.set('images', JSON.stringify({ logo: d.logo_asset_id, cover: d.cover_asset_id, gallery: d.gallery_asset_ids, services: d.service_photos }));
  return fd;
}

export function BrandingEditor({
  initial,
  published,
  hasDraft,
  publishedAt,
  assets,
  services,
  business,
}: {
  initial: BrandingDraft;
  published: BrandingDraft;
  hasDraft: boolean;
  publishedAt: string | null;
  assets: Record<string, EditorAsset>;
  services: Service[];
  business: PreviewBusiness & { slug: string; live: boolean };
}) {
  const [state, setState] = useState<BrandingDraft>(initial);
  const [baseline, setBaseline] = useState<BrandingDraft>(initial); // what the server holds (draft or published)
  const [known, setKnown] = useState(assets);
  const submitted = useRef<BrandingDraft | null>(null);
  // Whether the server holds unpublished changes (uploads and saves create them; publishing or
  // discarding clears them). Starts from the page's data.
  const [draftSaved, setDraftSaved] = useState(hasDraft);
  // After a save or publish, what was sent is what the server holds; after discarding, the
  // published look is.
  const [saveState, save, saving] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await saveBranding(prev, fd);
    if (r.status === 'success' && submitted.current) {
      setBaseline(submitted.current);
      setDraftSaved(true);
    }
    return r;
  }, idle);
  const [pubState, publish, publishing] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await publishBranding(prev, fd);
    if (r.status === 'success' && submitted.current) {
      setBaseline(submitted.current);
      setDraftSaved(false);
    }
    return r;
  }, idle);
  const [discardState, discard, discarding] = useActionState(async () => {
    const r = await discardBranding();
    if (r.status === 'success') {
      setState(published);
      setBaseline(published);
      setDraftSaved(false);
    }
    return r;
  }, idle);
  const [confirm, setConfirm] = useState<null | 'reset' | 'discard'>(null);
  const [gallery, setGallery] = useState<{ name: string; progress: number; error?: string }[]>([]);
  const galleryInput = useRef<HTMLInputElement>(null);

  const dirty = !same(state, baseline);
  const busy = saving || publishing || discarding;
  const last = [saveState, pubState, discardState].filter((s) => s.status !== 'idle').sort((a, b) => Number(b.values?.at ?? 0) - Number(a.values?.at ?? 0))[0];
  const errors = (last?.status === 'error' ? last.fieldErrors : undefined) ?? {};

  // Unsaved edits: ask before leaving the page.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) => setState((s) => ({ ...s, [key]: value }));
  // Uploads are already in the server's draft: record them on both sides.
  const uploaded = (img: UploadedImage, apply: (d: BrandingDraft) => BrandingDraft) => {
    setKnown((k) => ({ ...k, [img.id]: img }));
    setState(apply);
    setBaseline(apply);
    setDraftSaved(true);
  };
  const imageOf = (id: string | null) => (id ? (known[id] ?? null) : null);
  const run = (action: (fd: FormData) => void) => {
    submitted.current = state;
    startTransition(() => action(toFormData(state)));
  };

  async function addGalleryPhotos(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, 12 - state.gallery_asset_ids.length));
    setGallery(list.map((f) => ({ name: f.name, progress: 0 })));
    for (const [i, file] of list.entries()) {
      const problem = precheck(file);
      if (problem) {
        setGallery((g) => g.map((x, j) => (j === i ? { ...x, error: problem } : x)));
        continue;
      }
      const r = await uploadImage(file, 'gallery', undefined, (p) => setGallery((g) => g.map((x, j) => (j === i ? { ...x, progress: p } : x))));
      if (!r.ok) setGallery((g) => g.map((x, j) => (j === i ? { ...x, error: r.message } : x)));
      else {
        uploaded(r, (d) => ({ ...d, gallery_asset_ids: [...d.gallery_asset_ids, r.id] }));
        setGallery((g) => g.map((x, j) => (j === i ? { ...x, progress: 100 } : x)));
      }
    }
    if (galleryInput.current) galleryInput.current.value = '';
    setGallery((g) => g.filter((x) => x.error));
  }

  const moveGallery = (from: number, to: number) =>
    setState((s) => {
      const ids = [...s.gallery_asset_ids];
      const [id] = ids.splice(from, 1);
      ids.splice(to, 0, id!);
      return { ...s, gallery_asset_ids: ids };
    });

  const notes = colorNotes({ primary: state.primary_color, secondary: state.secondary_color, accent: state.accent_color });
  const mains = services.filter((s) => !s.addon);

  return (
    <div className={styles.layout}>
      <div className={styles.editor}>
        <Panel title="Your booking page" id="branding-status">
          <div className={styles.status}>
            <p>
              {draftSaved || dirty ? (
                <span className={styles.badge} data-tone="attention">
                  Unpublished changes
                </span>
              ) : (
                <span className={styles.badge} data-tone="positive">
                  Up to date
                </span>
              )}{' '}
              {draftSaved || dirty
                ? 'Customers still see your published look until you publish.'
                : publishedAt
                  ? 'Customers see exactly what’s below.'
                  : 'Customers see DetailerHQ’s clean default look until you publish your own.'}
              {!business.live ? ' Your page is offline right now.' : ''}
            </p>
            <div className={styles.buttons}>
              <ButtonLink href={`/book/${business.slug}/preview?draft=1`} target="_blank" icon={<ExternalLink size={14} aria-hidden="true" />}>
                Preview saved draft
              </ButtonLink>
              {draftSaved && confirm !== 'discard' ? (
                <Button type="button" variant="ghost" onClick={() => setConfirm('discard')}>
                  Discard unpublished changes
                </Button>
              ) : null}
            </div>
            {confirm === 'discard' ? (
              <div className={styles.confirm} role="group" aria-label="Discard unpublished changes">
                <p>Discard every saved change that isn’t published, including new images? Your live page isn’t affected.</p>
                <div className={styles.buttons}>
                  <Button type="button" variant="danger" disabled={busy} onClick={() => (setConfirm(null), startTransition(() => discard()))}>
                    Discard changes
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
                    Keep them
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Logo and cover photo" id="branding-images">
          <div className={styles.stack}>
            <ImageField kind="logo" label="Logo" confirmRemove value={imageOf(state.logo_asset_id)} onChange={(img) => (img ? uploaded(img, (d) => ({ ...d, logo_asset_id: img.id })) : set('logo_asset_id', null))} />
            <ImageField kind="cover" label="Cover photo" confirmRemove value={imageOf(state.cover_asset_id)} onChange={(img) => (img ? uploaded(img, (d) => ({ ...d, cover_asset_id: img.id })) : set('cover_asset_id', null))} />
          </div>
        </Panel>

        <Panel title="Colours" id="branding-colours">
          <div className={styles.stack}>
            <p className={styles.muted}>Pick any colours. DetailerHQ adjusts shades where needed so text on your page always stays readable. Leave a colour empty to use the default.</p>
            {COLOR_FIELDS.map((c) => {
              const value = state[c.key];
              return (
                <div key={c.key} className={styles.colorRow}>
                  <input
                    type="color"
                    className={styles.swatch}
                    aria-label={`${c.label} colour picker`}
                    value={value && isHex(value) ? value : '#171716'}
                    onChange={(e) => set(c.key, e.target.value.toLowerCase())}
                  />
                  <TextField
                    name={c.name}
                    id={`color-${c.key}`}
                    label={`${c.label} colour`}
                    hint={c.hint}
                    placeholder="Default"
                    maxLength={7}
                    spellCheck={false}
                    autoCapitalize="none"
                    value={value ?? ''}
                    error={errors[c.name]}
                    onChange={(e) => set(c.key, e.target.value.trim() ? e.target.value.trim().toLowerCase() : null)}
                  />
                  {value ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => set(c.key, null)}>
                      Use default<span className="visually-hidden"> {c.label.toLowerCase()} colour</span>
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {notes.length ? (
              <ul className={styles.notes} aria-label="Readability adjustments">
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>

        <Panel title="About and policies" id="branding-text">
          <div className={styles.stack}>
            <TextAreaField
              name="intro"
              id="branding-intro"
              label="About your business"
              hint="A sentence or two at the top of your page."
              rows={3}
              maxLength={300}
              value={state.intro_text ?? ''}
              error={errors.intro}
              onChange={(e) => set('intro_text', e.target.value)}
            />
            <TextAreaField name="cancellation" id="branding-cancellation" label="Cancellation policy (optional)" rows={3} maxLength={1000} value={state.cancellation_policy_text ?? ''} error={errors.cancellation} onChange={(e) => set('cancellation_policy_text', e.target.value)} />
            <TextAreaField name="rescheduling" id="branding-rescheduling" label="Rescheduling policy (optional)" rows={3} maxLength={1000} value={state.reschedule_policy_text ?? ''} error={errors.rescheduling} onChange={(e) => set('reschedule_policy_text', e.target.value)} />
            <TextAreaField
              name="prep"
              id="branding-prep"
              label="Before the appointment (optional)"
              hint="Instructions for customers, e.g. remove valuables, water access."
              rows={3}
              maxLength={1000}
              value={state.prep_instructions ?? ''}
              error={errors.prep}
              onChange={(e) => set('prep_instructions', e.target.value)}
            />
          </div>
        </Panel>

        <Panel title="Contact and links" id="branding-links">
          <div className={styles.stack}>
            <dl className={styles.dl}>
              <dt>Phone</dt>
              <dd>{business.phone ? formatPhone(business.phone) : 'Not set'}</dd>
              <dt>Email</dt>
              <dd>{business.email ?? 'Not set'}</dd>
            </dl>
            <p className={styles.muted}>
              Phone and email are edited in <Link href="/app/settings">Business settings</Link>. Your phone is always shown so customers can call or text.
            </p>
            <label className={styles.check}>
              <input type="checkbox" checked={state.show_email} disabled={!business.email} onChange={(e) => set('show_email', e.target.checked)} />
              Show my business email on the booking page
            </label>
            <TextField
              name="website"
              id="branding-website"
              label="Website (optional)"
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={200}
              value={state.website_url ?? ''}
              error={errors.website}
              onChange={(e) => set('website_url', e.target.value || null)}
            />
            <fieldset className={styles.fieldset}>
              <legend>Social profiles (optional)</legend>
              <div className={styles.grid2}>
                {SOCIAL_NETWORKS.map((n) => (
                  <TextField
                    key={n.key}
                    name={`social_${n.key}`}
                    id={`social-${n.key}`}
                    label={n.label}
                    type="url"
                    inputMode="url"
                    placeholder={n.example}
                    maxLength={200}
                    value={state.social_links[n.key] ?? ''}
                    error={errors[`social_${n.key}`]}
                    onChange={(e) => setState((s) => ({ ...s, social_links: { ...s.social_links, [n.key]: e.target.value } }))}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </Panel>

        <Panel title={`Gallery · ${state.gallery_asset_ids.length} of 12`} id="branding-gallery">
          <div className={styles.stack}>
            <p className={styles.muted}>Photos of your work, shown as “Our work” below the booking steps. Wide photos at least 600 × 400 px work best.</p>
            {state.gallery_asset_ids.length ? (
              <ol className={styles.gallery} aria-label="Gallery photos">
                {state.gallery_asset_ids.map((id, i) => (
                  <li key={id}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- same-origin WebP */}
                    <img src={mediaUrl(id)} alt={`Gallery photo ${i + 1}`} />
                    <div className={styles.galleryButtons}>
                      <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => moveGallery(i, i - 1)} icon={<ArrowUp size={14} aria-hidden="true" />}>
                        <span className="visually-hidden">Move photo {i + 1} earlier</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={i === state.gallery_asset_ids.length - 1}
                        onClick={() => moveGallery(i, i + 1)}
                        icon={<ArrowDown size={14} aria-hidden="true" />}
                      >
                        <span className="visually-hidden">Move photo {i + 1} later</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => set('gallery_asset_ids', state.gallery_asset_ids.filter((x) => x !== id))}
                        icon={<Trash2 size={14} aria-hidden="true" />}
                      >
                        <span className="visually-hidden">Remove photo {i + 1}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            <input
              ref={galleryInput}
              id="gallery-files"
              className="visually-hidden"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              aria-label="Add gallery photos"
              onChange={(e) => addGalleryPhotos(e.target.files)}
            />
            <div className={styles.buttons}>
              <Button
                type="button"
                icon={<ImagePlus size={16} aria-hidden="true" />}
                disabled={state.gallery_asset_ids.length >= 12 || gallery.some((g) => !g.error && g.progress < 100)}
                onClick={() => galleryInput.current?.click()}
              >
                Add photos
              </Button>
            </div>
            {gallery.length ? (
              <ul className={styles.uploads} aria-label="Gallery uploads">
                {gallery.map((g, i) => (
                  <li key={`${g.name}-${i}`}>
                    <span className={styles.uploadName}>{g.name}</span>
                    {g.error ? (
                      <span className={styles.error} role="alert">
                        {g.error}
                      </span>
                    ) : (
                      <span role="progressbar" aria-label={`Uploading ${g.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.progress} className={styles.bar}>
                        <span style={{ width: `${g.progress}%` }} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>

        {mains.length ? (
          <Panel title="Service photos" id="branding-services">
            <div className={styles.stack}>
              <p className={styles.muted}>One photo per service, shown next to it when customers choose. Optional.</p>
              {mains.map((s) => (
                <ImageField
                  key={s.id}
                  kind="service"
                  compact
                  label={s.name}
                  serviceId={s.id}
                  value={imageOf(state.service_photos[s.id] ?? null)}
                  onChange={(img) =>
                    img
                      ? uploaded(img, (d) => ({ ...d, service_photos: { ...d.service_photos, [s.id]: img.id } }))
                      : setState((d) => {
                          const next = { ...d.service_photos };
                          delete next[s.id];
                          return { ...d, service_photos: next };
                        })
                  }
                />
              ))}
            </div>
          </Panel>
        ) : null}

        <div className={styles.actionBar} aria-label="Save or publish">
          <div aria-live="polite">
            {last?.status === 'error' ? <Notice tone="critical">{last.message}</Notice> : null}
            {last?.status === 'success' && !dirty ? <Notice tone="positive">{last.message}</Notice> : null}
          </div>
          {confirm === 'reset' ? (
            <div className={styles.confirm} role="group" aria-label="Reset to defaults">
              <p>Reset colours, logo, cover, gallery, service photos and links to DetailerHQ’s default look? Your wording is kept. Nothing changes for customers until you publish.</p>
              <div className={styles.buttons}>
                <Button type="button" variant="danger" onClick={() => (setConfirm(null), setState((s) => ({ ...s, ...EMPTY_LOOK })))}>
                  Reset to defaults
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
                  Keep my branding
                </Button>
              </div>
            </div>
          ) : null}
          <div className={styles.actionButtons}>
            <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={() => setState(baseline)}>
              Cancel changes
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm('reset')}>
              Reset to defaults
            </Button>
            <span className={styles.spacer} />
            <Button type="button" disabled={busy || !dirty} onClick={() => run(save)}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type="button" variant="primary" disabled={busy || (!dirty && !draftSaved)} onClick={() => run(publish)}>
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>
      </div>

      <aside className={styles.previewColumn} aria-label="Live preview">
        <details className={styles.previewDetails} open>
          <summary>Live preview</summary>
          <p className={styles.muted}>Updates as you edit. Booking steps are simplified here — open the full preview to try them.</p>
          <BrandPreview draft={state} assets={known} services={mains} business={business} />
        </details>
      </aside>
    </div>
  );
}
