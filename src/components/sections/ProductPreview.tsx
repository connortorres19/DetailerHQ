'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { InterfaceFrame } from '@/components/ui/InterfaceFrame';
import { RequestsPreview } from '@/components/previews/RequestsPreview';
import { CalendarPreview } from '@/components/previews/CalendarPreview';
import { CustomerPreview } from '@/components/previews/CustomerPreview';
import { QuotePreview } from '@/components/previews/QuotePreview';
import { FollowUpPreview } from '@/components/previews/FollowUpPreview';
import { AnalyticsPreview } from '@/components/previews/AnalyticsPreview';
import s from './section.module.css';
import styles from './ProductPreview.module.css';

const tabs = [
  { key: 'requests', label: 'Requests', path: 'requests', note: 'Every request waits for your decision. Approve it, hold the time while you confirm details, suggest another time or decline — and see whether the slot is really free.', Preview: RequestsPreview },
  { key: 'calendar', label: 'Calendar', path: 'calendar', note: 'A two-bay shop running jobs side by side. The strip on the left shows how much capacity is in use; a held time counts, a pending request doesn’t.', Preview: CalendarPreview },
  { key: 'customers', label: 'Customers', path: 'customers/jordan-reyes', note: 'One customer, two vehicles, the notes you need on the next visit and the full history — by vehicle.', Preview: CustomerPreview },
  { key: 'quotes', label: 'Quotes', path: 'quotes/Q-0012', note: 'A lead from Instagram turned into a quote with line items, an expiry date and a follow-up already scheduled.', Preview: QuotePreview },
  { key: 'followups', label: 'Follow-ups', path: 'follow-ups', note: 'Due and overdue reminders with message templates that open in your own apps. You send it; the app asks whether to log it.', Preview: FollowUpPreview },
  { key: 'analytics', label: 'Analytics', path: 'analytics', note: 'Quoted value, booked job value and recorded revenue as separate, defined figures — from jobs you’ve actually recorded.', Preview: AnalyticsPreview },
] as const;

export function ProductPreview() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  // Roving tabindex with automatic activation (WAI-ARIA tabs pattern).
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="product" className={`${s.section} ${s.canvas}`} aria-labelledby="product-title">
      <Container>
        <SectionHeading
          id="product-title"
          overline="Inside the product"
          title="What a working day looks like in it."
          align="split"
          intro={<p>These are interface previews built with sample data for fictional businesses. The product is still in development and details will change.</p>}
        />

        <div className={styles.tablist} role="tablist" aria-label="Product areas">
          {tabs.map((tab, i) => (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${baseId}-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={`${baseId}-panel-${tab.key}`}
              tabIndex={i === active ? 0 : -1}
              className={styles.tab}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className={`${styles.tabIndex} tabular`}>{String(i + 1).padStart(2, '0')}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {tabs.map(({ key, path, note, Preview }, i) => (
          <div
            key={key}
            id={`${baseId}-panel-${key}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${key}`}
            hidden={i !== active}
            className={styles.panel}
          >
            <p className={styles.note}>{note}</p>
            <InterfaceFrame title={`app.detailerhq.example/${path}`}>
              <Preview />
            </InterfaceFrame>
          </div>
        ))}
      </Container>
    </section>
  );
}
