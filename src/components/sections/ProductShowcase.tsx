'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { InterfaceFrame } from '@/components/ui/InterfaceFrame';
import { TodayPreview } from '@/components/previews/TodayPreview';
import { RequestsPreview } from '@/components/previews/RequestsPreview';
import { CalendarPreview } from '@/components/previews/CalendarPreview';
import { CustomerPreview } from '@/components/previews/CustomerPreview';
import { QuotePreview } from '@/components/previews/QuotePreview';
import { FollowUpPreview } from '@/components/previews/FollowUpPreview';
import { AnalyticsPreview } from '@/components/previews/AnalyticsPreview';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import s from './section.module.css';
import styles from './ProductShowcase.module.css';

const screens = [
  { key: 'today', label: 'Today', path: 'today', note: 'Start the day with what needs you: requests waiting for a decision, the next job with its gate code, and follow-ups that are due.', Preview: TodayPreview },
  { key: 'requests', label: 'Requests', path: 'requests', note: 'Every request waits for your decision. Approve it, hold the time while you confirm details, suggest another time or decline — and see whether the slot is really free.', Preview: RequestsPreview },
  { key: 'calendar', label: 'Calendar', path: 'calendar', note: 'A two-bay shop running jobs side by side. The strip on the left shows how much capacity is in use; a held time counts, a pending request doesn’t.', Preview: CalendarPreview },
  { key: 'customers', label: 'Customers', path: 'customers/jordan-reyes', note: 'One customer, two vehicles, the notes you need on the next visit and the full history — by vehicle.', Preview: CustomerPreview },
  { key: 'quotes', label: 'Quotes', path: 'quotes/Q-0012', note: 'A lead from Instagram turned into a quote with line items, an expiry date and a follow-up already scheduled.', Preview: QuotePreview },
  { key: 'followups', label: 'Follow-ups', path: 'follow-ups', note: 'Due and overdue reminders with message templates that open in your own apps. You send it; the app asks whether to log it.', Preview: FollowUpPreview },
  { key: 'analytics', label: 'Analytics', path: 'analytics', note: 'Quoted value, booked job value and recorded revenue as separate, defined figures — from jobs you’ve actually recorded.', Preview: AnalyticsPreview },
] as const;

const steps = screens.length - 1;
const HEADER_OFFSET = 80; // sticky header + breathing room

// Approved scroll sequence 2 (DESIGN_SYSTEM §8.1). On large screens with motion allowed the
// stage pins and scroll steps through the screens; everywhere else it is a plain tab set.
export function ProductShowcase() {
  const [active, setActive] = useState(0);
  const [scrollMode, setScrollMode] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px) and (min-height: 720px) and (prefers-reduced-motion: no-preference)', () => {
        const el = root.current!;
        el.dataset.scroll = 'on';
        setScrollMode(true);

        const q = gsap.utils.selector(el);
        const panels = q(`.${styles.panel}`);
        const notes = q(`.${styles.note}`);
        const frame = q(`.${styles.frameWrap}`)[0] as HTMLElement;
        const progress = q(`.${styles.progressBar}`)[0] as HTMLElement;

        // Scale the device frame down on shorter screens so the whole stage fits while pinned.
        const fit = () => {
          gsap.set(frame, { scale: 1 });
          const available = window.innerHeight - HEADER_OFFSET - 24;
          const overflow = el.offsetHeight - available;
          const scale = overflow > 0 ? Math.max(0.72, 1 - overflow / frame.offsetHeight) : 1;
          gsap.set(frame, { scale, transformOrigin: '50% 0%' });
        };
        fit();
        ScrollTrigger.addEventListener('refreshInit', fit);

        gsap.set([...panels.slice(1), ...notes.slice(1)], { autoAlpha: 0, y: 12 });

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: `top top+=${HEADER_OFFSET}`,
            end: () => `+=${window.innerHeight * 0.55 * steps}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            snap: { snapTo: 1 / steps, inertia: false, directional: false, duration: { min: 0.2, max: 0.5 }, delay: 0.1, ease: 'power1.inOut' },
            onUpdate(self) {
              const next = Math.round(self.progress * steps);
              setActive((a) => (a === next ? a : next));
            },
          },
        });
        trigger.current = tl.scrollTrigger ?? null;

        // Each change sits midway between two snap points, so every screen rests fully visible.
        // Out, then in — never both at once, so text is never double-exposed.
        for (let i = 1; i <= steps; i++) {
          const at = i - 0.7;
          tl.to([panels[i - 1]!, notes[i - 1]!], { autoAlpha: 0, duration: 0.18 }, at);
          tl.fromTo([panels[i]!, notes[i]!], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.22 }, at + 0.18);
        }
        tl.fromTo(progress, { scaleX: 0 }, { scaleX: 1, duration: steps }, 0);

        return () => {
          ScrollTrigger.removeEventListener('refreshInit', fit);
          trigger.current = null;
          delete el.dataset.scroll;
          setScrollMode(false);
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  function select(index: number) {
    const st = trigger.current;
    if (st) {
      // In scroll mode a step is a position on the page; go there and let the timeline follow.
      window.scrollTo({ top: st.start + ((st.end - st.start) * index) / steps, behavior: 'smooth' });
    }
    setActive(index);
  }

  // Roving tabindex with automatic activation (WAI-ARIA tabs pattern).
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight' ? (index === steps ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? steps : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? steps
      : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  }

  const current = screens[active] ?? screens[0];

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

        <div ref={root} className={styles.stage}>
          <div className={styles.tablist} role="tablist" aria-label="Product screens">
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
                onClick={() => select(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <span className={`${styles.tabIndex} tabular`}>{String(i + 1).padStart(2, '0')}</span>
                {screen.label}
              </button>
            ))}
          </div>
          <div className={styles.progress} aria-hidden="true">
            <span className={styles.progressBar} />
          </div>

          <div className={styles.notes}>
            {screens.map((screen, i) => (
              <p key={screen.key} className={styles.note} data-active={i === active} aria-hidden={i !== active}>
                {screen.note}
              </p>
            ))}
          </div>

          <div className={styles.frameWrap}>
            <InterfaceFrame title={`app.detailerhq.example/${current.path}`}>
              <div className={styles.panels}>
                {screens.map(({ key, Preview }, i) => (
                  <div
                    key={key}
                    id={`${baseId}-panel-${key}`}
                    role="tabpanel"
                    aria-labelledby={`${baseId}-tab-${key}`}
                    data-active={i === active}
                    inert={scrollMode && i !== active}
                    className={styles.panel}
                  >
                    <Preview />
                  </div>
                ))}
              </div>
            </InterfaceFrame>
          </div>
        </div>
      </Container>
    </section>
  );
}
