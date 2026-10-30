import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import s from './section.module.css';
import styles from './Pricing.module.css';

// The early-access offer is a proposal (PRODUCT_PLAN §12): shown, never purchasable.
// The price after the first month is undecided (Q-1), so it is stated as such.
const terms = [
  { term: 'Who it’s for', detail: 'A small group of 3–5 independent US detailing businesses.' },
  { term: 'First month', detail: '$25, collected manually. No card is taken on this site.' },
  { term: 'After the first month', detail: 'To be confirmed. The price will be stated in writing before anyone joins.' },
  { term: 'Your data', detail: 'Yours. Export it as CSV at any time. It isn’t deleted when early access ends.' },
];

export function Pricing() {
  return (
    <section id="early-access" className={`${s.section} ${s.surface}`} aria-labelledby="pricing-title">
      <Container>
        <SectionHeading
          id="pricing-title"
          overline="Early access"
          title="A proposed pilot, priced to be fair while the product is young."
          align="split"
          intro={<p>Early access hasn’t opened. This is the offer we’re proposing, shown so you can see where it’s heading.</p>}
        />

        <div className={styles.card}>
          <div className={styles.offer}>
            <p className={styles.flag}>Proposal · not available to purchase</p>
            <p className={styles.price}>
              <span className={`${styles.amount} tabular`}>$25</span>
              <span className={styles.period}>for your first month</span>
            </p>
            <p className={styles.small}>Early-access proposal. Terms will be published in writing before early access opens.</p>
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
