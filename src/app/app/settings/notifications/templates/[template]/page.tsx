import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel } from '@/components/app/ui/Panel';
import { requireBusiness } from '@/data/session';
import { CUSTOMER_TEMPLATES, DEFAULTS, type CustomerTemplate } from '@/domain/email';
import { createClient } from '@/lib/supabase/server';
import { TemplateEditor } from './TemplateEditor';
import styles from '../../notifications.module.css';

export const metadata: Metadata = { title: 'Edit email' };

export default async function TemplatePage({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params;
  const meta = CUSTOMER_TEMPLATES.find((t) => t.key === template);
  if (!meta) notFound();
  const { business } = await requireBusiness(`/app/settings/notifications/templates/${template}`);
  const supabase = await createClient();
  const [custom, branding] = await Promise.all([
    supabase.from('email_template_settings').select('subject, intro, signoff').eq('template', template as CustomerTemplate).maybeSingle(),
    supabase.from('business_branding').select('primary_color, logo_asset_id, show_email, website_url').maybeSingle(),
  ]);
  return (
    <div className={styles.stack}>
      <p>
        <Link href="/app/settings/notifications#customer-emails">← Notifications</Link>
      </p>
      <Panel title={meta.label} id="template">
        <p className={styles.muted}>Sent when: {meta.when}</p>
        <TemplateEditor
          template={meta.key}
          defaults={DEFAULTS[meta.key]}
          initial={{ subject: custom.data?.subject ?? '', intro: custom.data?.intro ?? '', signoff: custom.data?.signoff ?? '' }}
          business={{
            name: business.name,
            timezone: business.timezone,
            phone: business.phone_e164,
            email: branding.data?.show_email ? business.email : null,
            logo: branding.data?.logo_asset_id ?? null,
            primary_color: branding.data?.primary_color ?? null,
            website: branding.data?.website_url ?? null,
          }}
        />
      </Panel>
    </div>
  );
}
