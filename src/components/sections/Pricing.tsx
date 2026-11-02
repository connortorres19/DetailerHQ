import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { TRIAL_DAYS } from '@/domain/billing';
import s from './section.module.css';
import styles from './Pricing.module.css';

// Phase 8 plans. The live number of founding spots is on /pricing (rendered per request), so this
// static page never shows a count that could be out of date.
const terms = [
  { term: 'Founding 5', detail: '$30 once for lifetime access — the first five businesses only. Never billed again.' },
  { term: 'Standard', detail: `$30/month after a ${TRIAL_DAYS}-day free trial. A card is required to start; nothing is charged during the trial.` },
  { term: 'Cancel anytime', detail: 'Cancel before the trial ends and you’re never charged. After that, access continues to the end of the paid month.' },
  { term: 'Your data', detail: 'Yours. It’s never deleted when a plan ends — the account becomes read-only until you choose a plan again.' },
];

export function Pricing() {
  return (
    <section id="early-access" className={`${s.section} ${s.surface}`} aria-labelledby="pricing-title">
      <Container>
        <SectionHeading
          id="pricing-title"
          overline="Pricing"
          title="$30. Once for our first five businesses, or monthly after that."
          align="split"
          intro={<p>Every feature is included in both. No add-ons and no per-booking fees.</p>}
        />

        <div className={styles.card}>
          <div className={styles.offer}>
            <p className={styles.flag}>Founding 5 · limited to five businesses</p>
            <p className={styles.price}>
              <span className={`${styles.amount} tabular`}>$30</span>
              <span className={styles.period}>once, or per month on Standard</span>
            </p>
            <p className={styles.small}>
              <Link href="/pricing">See plans, billing terms and how many founding spots are left</Link>
            </p>
          </div>
          <dl className={styles.terms}>
            {terms.map((t) => (
              <div key={t.term} className={styles.term}>
                <dt>{t.term}</dt>
                <dd>{t.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
