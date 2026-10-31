import type { Metadata } from 'next';
import { requireBusiness } from '@/data/session';
import { EMPTY_LOOK, type BrandingDraft } from '@/domain/branding';
import { createClient } from '@/lib/supabase/server';
import { BrandingEditor, type EditorAsset } from './BrandingEditor';

export const metadata: Metadata = { title: 'Branding' };

// Settings → Branding: the look of the public booking page and the wording customers read.
// Changes are saved as a draft (previewed here and on the real page layout) until published.
export default async function BrandingPage() {
  const { business } = await requireBusiness('/app/settings/branding');
  const supabase = await createClient();
  const [branding, settings, assets, services] = await Promise.all([
    supabase.from('business_branding').select('*').maybeSingle(),
    supabase.from('booking_settings').select('intro_text, cancellation_policy_text, reschedule_policy_text, prep_instructions').single(),
    supabase.from('media_assets').select('id, kind, width, height').eq('status', 'ready'),
    supabase.from('services').select('id, name, is_addon').is('archived_at', null).order('is_addon').order('sort_order').order('name'),
  ]);
  for (const r of [branding, settings, assets, services]) if (r.error) throw new Error(`Could not load branding: ${r.error.message}`);
  const b = branding.data;
  const s = settings.data!;

  const published: BrandingDraft = {
    ...EMPTY_LOOK,
    ...(b
      ? {
          primary_color: b.primary_color,
          secondary_color: b.secondary_color,
          accent_color: b.accent_color,
          logo_asset_id: b.logo_asset_id,
          cover_asset_id: b.cover_asset_id,
          gallery_asset_ids: b.gallery_asset_ids,
          service_photos: (b.service_photos ?? {}) as Record<string, string>,
          website_url: b.website_url,
          social_links: (b.social_links ?? {}) as BrandingDraft['social_links'],
          show_email: b.show_email,
        }
      : {}),
    intro_text: s.intro_text,
    cancellation_policy_text: s.cancellation_policy_text,
    reschedule_policy_text: s.reschedule_policy_text,
    prep_instructions: s.prep_instructions,
  };
  const draft = (b?.draft ?? null) as Partial<BrandingDraft> | null;
  const current: BrandingDraft = draft ? { ...published, ...draft } : published;
  const assetMap: Record<string, EditorAsset> = Object.fromEntries((assets.data ?? []).map((a) => [a.id, { id: a.id, width: a.width!, height: a.height! }]));

  return (
    <BrandingEditor
      initial={current}
      published={published}
      hasDraft={Boolean(draft)}
      publishedAt={b?.published_at ?? null}
      assets={assetMap}
      services={(services.data ?? []).map((sv) => ({ id: sv.id, name: sv.name, addon: sv.is_addon }))}
      business={{
        name: business.name,
        slug: business.slug,
        phone: business.phone_e164,
        email: business.email,
        serviceMode: business.service_mode,
        serviceArea: business.service_area_text,
        shopAddress: business.shop_city
          ? { line1: business.shop_address_line1, city: business.shop_city, state: business.shop_state, postal_code: business.shop_postal_code }
          : null,
        live: Boolean(business.published_at && business.accepting_requests),
      }}
    />
  );
}
