import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { InterfaceFrame } from '@/components/ui/InterfaceFrame';
import { TodayPreview } from '@/components/previews/TodayPreview';
import { brand } from '@/config/brand';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <Container>
        <div className={styles.grid}>
          <div className={styles.copy}>
            <p className={styles.overline}>Software for independent detailers · {brand.stage}</p>
            <h1 id="hero-title" className={styles.title}>
              Run your detailing business from one tidy place.
            </h1>
            <p className={styles.lede}>
              Take booking requests, approve jobs, keep every customer and vehicle on record, and follow up on quotes —
              from your phone or your desk.
            </p>
            <div className={styles.actions}>
              <ButtonLink href="#early-access" variant="inverse" size="lg" previewLabel="Not open yet">
                Join early access
              </ButtonLink>
              <ButtonLink
                href="#product"
                variant="outlineInverse"
                size="lg"
                icon={<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />}
              >
                Explore the platform
              </ButtonLink>
            </div>
            <p className={styles.status}>
              {brand.name} is being built now. Nothing here can be bought or signed up for yet.
            </p>
          </div>
          <PhotoPlaceholder
            shot="01"
            ratio="4/5"
            subject="Detailer inspecting a hood under a swirl-finder light, workshop setting, hands and paint in focus"
            className={styles.photo}
          />
        </div>
      </Container>

      <div className={styles.previewBand}>
        <Container>
          <InterfaceFrame title="app.detailerhq.example/today" className={styles.frame}>
            <TodayPreview />
          </InterfaceFrame>
        </Container>
      </div>
    </section>
  );
}
