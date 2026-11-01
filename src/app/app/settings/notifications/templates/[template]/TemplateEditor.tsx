'use client';

import { startTransition, useActionState, useMemo, useState } from 'react';
import { Button } from '@/components/app/ui/Button';
import { TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { checkCustomText, renderEmail, type CustomerTemplate, type EmailContext } from '@/domain/email';
import { idle } from '@/domain/forms';
import { saveTemplate } from '../../actions';
import styles from '../../notifications.module.css';

// Owners edit the subject, opening and sign-off; the details (time, services, price, links) are
// always added by DetailerHQ. Preview uses sample data, at desktop and phone widths.
const inHours = (h: number) => new Date(Math.ceil((Date.now() + h * 3600_000) / 3600_000) * 3600_000).toISOString(); // on the hour

function sample(template: CustomerTemplate, business: EmailContext['business'], custom: EmailContext['custom']): EmailContext {
  const request = {
    number: 1042, first_name: 'Jordan', requested_start: inHours(50), proposed_start: template === 'time_proposed' ? inHours(74) : null,
    proposal_message: template === 'time_proposed' ? 'We’re booked that morning — the afternoon is open.' : null,
    decline_message: template === 'booking_declined' ? 'We’re fully booked that week.' : null,
    estimated_total_cents: 18000, estimate_is_minimum: false, services: ['Full detail', 'Pet hair removal'], vehicle: '2021 Tesla Model Y', location: '1234 Oak St, Austin',
  };
  const appointment = {
    number: 318, starts_at: inHours(50), ends_at: inHours(53), previous_start: template === 'booking_rescheduled' ? inHours(26) : null, first_name: 'Jordan',
    services: ['Full detail', 'Pet hair removal'], estimated_total_cents: 22000, customer_message: template === 'booking_cancelled' ? 'Sorry — our van broke down. We’ll call you to rebook.' : null,
    cancelled_by: 'business', location: '1234 Oak St, Austin',
  };
  const quote = { number: 27, total_cents: 120000, valid_until: inHours(24 * 13).slice(0, 10), first_name: 'Jordan', vehicle: '2021 Tesla Model Y', items: ['Full detail', 'Ceramic coating (3-year)'] };
  return { template, category: template.startsWith('quote_exp') ? 'follow_up' : 'transactional', hours: '24', business, custom, request, appointment: template.startsWith('booking_') || template === 'appointment_reminder' || template === 'proposal_accepted' ? appointment : undefined, quote };
}

export function TemplateEditor({
  template,
  defaults,
  initial,
  business,
}: {
  template: CustomerTemplate;
  defaults: { subject: string; intro: string; signoff: string };
  initial: { subject: string; intro: string; signoff: string };
  business: EmailContext['business'];
}) {
  const [v, setV] = useState(initial);
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [state, action, pending] = useActionState(saveTemplate.bind(null, template), idle);
  const errors: Record<string, string> = { ...(state.fieldErrors ?? {}) };
  for (const k of ['subject', 'intro', 'signoff'] as const) {
    const p = v[k] ? checkCustomText(k, v[k]) : null;
    if (p) errors[k] = p;
  }
  const rendered = useMemo(
    () =>
      renderEmail(sample(template, business, { subject: v.subject || null, intro: v.intro || null, signoff: v.signoff || null }), {
        logo: business.logo ? `/media/${business.logo}.webp` : null,
        action: template.startsWith('quote_') ? { label: 'Review your quote', url: '#' } : { label: template === 'time_proposed' ? 'Accept or decline the new time' : 'View your booking', url: '#' },
        unsubscribe: template.startsWith('quote_exp') ? '#' : null,
      }),
    [template, business, v],
  );
  const submit = (values: typeof v) => {
    const fd = new FormData();
    for (const [k, val] of Object.entries(values)) fd.set(k, val);
    startTransition(() => action(fd));
  };

  return (
    <div className={styles.editor}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit(v);
        }}
      >
        {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
        {state.status === 'error' && !state.fieldErrors ? <Notice tone="critical">{state.message}</Notice> : null}
        <p className={styles.muted}>
          Leave a field empty to use the default. You can use <code className={styles.code}>{'{{customer_first_name}}'}</code> and <code className={styles.code}>{'{{business_name}}'}</code>.
        </p>
        <TextField name="subject" label="Subject" placeholder={defaults.subject} maxLength={150} value={v.subject} error={errors.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
        <TextAreaField name="intro" label="Opening message" placeholder={defaults.intro} rows={4} maxLength={1000} value={v.intro} error={errors.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} />
        <TextAreaField name="signoff" label="Sign-off" placeholder={defaults.signoff} rows={2} maxLength={300} value={v.signoff} error={errors.signoff} onChange={(e) => setV({ ...v, signoff: e.target.value })} />
        <div className={styles.required}>
          <strong>Always included:</strong> the appointment or quote details, the button to the customer’s secure booking or quote page, and your contact details. These can’t be removed.
        </div>
        <div className={styles.buttons}>
          <Button type="submit" variant="primary" disabled={pending || Object.keys(errors).length > 0}>
            {pending ? 'Saving…' : 'Save email'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || (!initial.subject && !initial.intro && !initial.signoff && !v.subject && !v.intro && !v.signoff)}
            onClick={() => {
              const empty = { subject: '', intro: '', signoff: '' };
              setV(empty);
              submit(empty);
            }}
          >
            Reset to default
          </Button>
        </div>
      </form>
      <div>
        <div className={styles.previewTabs} role="group" aria-label="Preview width">
          <Button type="button" size="sm" variant={width === 'desktop' ? 'primary' : 'secondary'} aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>
            Desktop
          </Button>
          <Button type="button" size="sm" variant={width === 'mobile' ? 'primary' : 'secondary'} aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')}>
            Phone
          </Button>
        </div>
        <p className={styles.muted} data-testid="preview-subject">
          Subject: <strong>{rendered.subject}</strong>
        </p>
        <iframe title="Email preview" className={styles.previewFrame} data-width={width} sandbox="" srcDoc={rendered.html} />
      </div>
    </div>
  );
}
