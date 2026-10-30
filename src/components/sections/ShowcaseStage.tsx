'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import { InterfaceFrame } from '@/components/ui/InterfaceFrame';
import { TodayPreview } from '@/components/previews/TodayPreview';
import { RequestsPreview } from '@/components/previews/RequestsPreview';
import { CalendarPreview } from '@/components/previews/CalendarPreview';
import { CustomerPreview } from '@/components/previews/CustomerPreview';
import { QuotePreview } from '@/components/previews/QuotePreview';
import { FollowUpPreview } from '@/components/previews/FollowUpPreview';
import { AnalyticsPreview } from '@/components/previews/AnalyticsPreview';
import styles from './ShowcaseStage.module.css';

export const screens = [
  { key: 'today', label: 'Today', path: 'today', note: 'Start the day with what needs you: requests waiting for a decision, the next job with its gate code, and follow-ups that are due.', Preview: TodayPreview },
  { key: 'requests', label: 'Requests', path: 'requests', note: 'Every request waits for your decision. Approve it, hold the time while you confirm details, suggest another time or decline — and see whether the slot is really free.', Preview: RequestsPreview },
  { key: 'calendar', label: 'Calendar', path: 'calendar', note: 'A two-bay shop running jobs side by side. The strip on the left shows how much capacity is in use; a held time counts, a pending request doesn’t.', Preview: CalendarPreview },
  { key: 'customers', label: 'Customers', path: 'customers/jordan-reyes', note: 'One customer, two vehicles, the notes you need on the next visit and the full history — by vehicle.', Preview: CustomerPreview },
  { key: 'quotes', label: 'Quotes', path: 'quotes/Q-0012', note: 'A lead from Instagram turned into a quote with line items, an expiry date and a follow-up already scheduled.', Preview: QuotePreview },
  { key: 'followups', label: 'Follow-ups', path: 'follow-ups', note: 'Due and overdue reminders with message templates that open in your own apps. You send it; the app asks whether to log it.', Preview: FollowUpPreview },
  { key: 'analytics', label: 'Analytics', path: 'analytics', note: 'Quoted value, booked job value and recorded revenue as separate, defined figures — from jobs you’ve actually recorded.', Preview: AnalyticsPreview },
] as const;

export const lastScreen = screens.length - 1;

type ShowcaseStageProps = {
  active: number;
  onSelect: (index: number) => void;
  /** `tabs`: one screen at a time. `film`: all screens stacked for the film timeline to cross-fade. */
  mode: 'tabs' | 'film';
  tone?: 'light' | 'dark';
};

// Tabs, notes and the device frame showing the existing interface previews (sample data).
// The film timeline finds its targets through the data-showcase attributes.
export function ShowcaseStage({ active, onSelect, mode, tone = 'light' }: ShowcaseStageProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const film = mode === 'film';
  const current = screens[active] ?? screens[0];

  // Roving tabindex with automatic activation (WAI-ARIA tabs pattern).
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight' ? (index === lastScreen ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? lastScreen : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? lastScreen
      : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className={styles.stage} data-mode={mode} data-tone={tone}>
      <div className={styles.tablist} role="tablist" aria-label="Product screens" data-showcase="chrome">
        {screens.map((screen, i) => (
          <button
            key={screen.key}
            ref={(node) => {
              tabRefs.current[i] = node;
            }}
            id={`${baseId}-tab-${screen.key}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${screen.key}`}
            tabIndex={i === active ? 0 : -1}
            className={styles.tab}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className={`${styles.tabIndex} tabular`}>{String(i + 1).padStart(2, '0')}</span>
            {screen.label}
          </button>
        ))}
      </div>
      <div className={styles.progress} aria-hidden="true" data-showcase="chrome">
        <span className={styles.progressBar} data-showcase="progress" />
      </div>

      <div className={styles.notes} data-showcase="chrome">
        {screens.map((screen, i) => (
          <p key={screen.key} className={styles.note} data-active={i === active} data-showcase="note" aria-hidden={i !== active}>
            {screen.note}
          </p>
        ))}
      </div>

      <div className={styles.frameWrap} data-showcase="frame">
        <InterfaceFrame title={`app.detailerhq.example/${current.path}`}>
          <div className={styles.panels} data-showcase="screen">
            {screens.map(({ key, Preview }, i) => (
              <div
                key={key}
                id={`${baseId}-panel-${key}`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-${key}`}
                data-active={i === active}
                data-showcase="panel"
                inert={film && i !== active}
                className={styles.panel}
              >
                <Preview />
              </div>
            ))}
          </div>
        </InterfaceFrame>
      </div>
    </div>
  );
}
