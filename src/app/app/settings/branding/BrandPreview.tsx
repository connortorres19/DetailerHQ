'use client';

import { BrandScope, Gallery } from '@/components/booking/Branding';
import { BusinessHeader } from '@/components/booking/BusinessHeader';
import bookingStyles from '@/components/booking/booking.module.css';
import type { PageBranding } from '@/domain/booking';
import { mediaUrl, type BrandingDraft } from '@/domain/branding';
import type { UploadedImage } from '@/components/app/media/ImageField';
import styles from './branding.module.css';

export type PreviewBusiness = {
  name: string;
  phone: string | null;
  email: string | null;
  serviceMode: 'mobile' | 'shop' | 'both';
  serviceArea: string | null;
  shopAddress: { line1: string | null; city: string | null; state: string | null; postal_code: string | null } | null;
};

// The top of the booking page as customers will see it, from the editor's current values — the same
// header, colours and gallery components as the real page, always in the light public style.
export function BrandPreview({
  draft,
  assets,
  services,
  business,
}: {
  draft: BrandingDraft;
  assets: Record<string, UploadedImage>;
  services: { id: string; name: string }[];
  business: PreviewBusiness;
}) {
  const img = (id: string | null) => (id && assets[id] ? assets[id] : null);
  const branding: PageBranding = {
    colors: { primary: draft.primary_color, secondary: draft.secondary_color, accent: draft.accent_color },
    logo: img(draft.logo_asset_id),
    cover: img(draft.cover_asset_id),
    gallery: draft.gallery_asset_ids.map(img).filter((x): x is UploadedImage => Boolean(x)),
    service_photos: Object.fromEntries(
      Object.entries(draft.service_photos)
        .map(([sid, aid]) => [sid, img(aid)] as const)
        .filter((e): e is readonly [string, UploadedImage] => Boolean(e[1])),
    ),
    website_url: draft.website_url,
    social: Object.fromEntries(Object.entries(draft.social_links).filter(([, v]) => Boolean(v))) as Record<string, string>,
    email: draft.show_email ? business.email : null,
  };
  const policies = [
    ['Cancellation', draft.cancellation_policy_text],
    ['Rescheduling', draft.reschedule_policy_text],
    ['Before your appointment', draft.prep_instructions],
  ].filter((p): p is [string, string] => Boolean(p[1]?.trim()));

  return (
    <div className={styles.previewFrame} data-theme="light" data-testid="brand-preview">
      <BrandScope branding={branding}>
        <BusinessHeader
          nameAs="p"
          page={{
            name: business.name,
            service_mode: business.serviceMode,
            service_area: business.serviceArea,
            shop_address: business.shopAddress,
            phone: business.phone,
            intro: draft.intro_text?.trim() || null,
            branding,
          }}
        />
        <div className={styles.previewSection}>
          <h2 className={bookingStyles.sectionTitle}>Choose a service</h2>
          {services.length ? (
            <ul className={bookingStyles.rows} role="list">
              {services.slice(0, 4).map((s) => {
                const photo = branding.service_photos[s.id];
                return (
                  <li key={s.id}>
                    <div className={bookingStyles.row}>
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- same-origin WebP
                        <img className={bookingStyles.rowPhoto} src={mediaUrl(photo.id)} alt="" />
                      ) : null}
                      <span className={bookingStyles.rowText}>
                        <span className={bookingStyles.rowName}>{s.name}</span>
                      </span>
                      <span />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={bookingStyles.empty}>Add services to see them here.</p>
          )}
          <button type="button" className={bookingStyles.primary} tabIndex={-1} aria-hidden="true">
            Continue
          </button>
        </div>
        <Gallery branding={branding} name={business.name} />
        {policies.length ? (
          <section className={bookingStyles.policies} aria-label="Policies preview">
            {policies.map(([title, body]) => (
              <div key={title} className={bookingStyles.policyText}>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </section>
        ) : null}
      </BrandScope>
    </div>
  );
}
