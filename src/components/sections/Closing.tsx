import { ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { brand } from '@/config/brand';
import s from './section.module.css';
import styles from './Closing.module.css';

// Mission statement (no founder biography, by decision) and the early-access status band.
export function Closing() {
  return (
    <section className={`${s.section} ${s.dark}`} aria-labelledby="mission-title">
      <Container>
        <div className={styles.mission}>
          <p className={styles.overline}>Why this exists</p>
          <h2 id="mission-title" className={styles.statement}>
            Independent detailers do skilled, careful work. The software around that work should be just as careful —
            simple to run from a phone, honest about what it does, and fairly priced.
          </h2>
        </div>

        <div className={s.hairline} />

        <div className={styles.band}>
          <div>
            <h2 className={styles.bandTitle}>Early access isn’t open yet.</h2>
            <p className={styles.bandText}>
              There’s no application form on this site yet. {brand.contactPlaceholder}
            </p>
          </div>
          <div className={styles.actions}>
            <ButtonLink
              href="#product"
              variant="outlineInverse"
              icon={<ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" />}
            >
              Back to the product tour
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
