import { Container } from '@/components/ui/Container';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import s from './section.module.css';
import styles from './PhotoBand.module.css';

// Shot list for licensed photography (DESIGN_SYSTEM §7.2). Placeholders until images are licensed.
export function PhotoBand() {
  return (
    <section className={`${s.section} ${s.canvas} ${styles.band}`} aria-label="Photography placeholders">
      <Container>
        <div className={styles.grid}>
          <PhotoPlaceholder
            shot="05"
            ratio="3/2"
            subject="Foam cannon mid-wash on a pickup in a residential driveway, overcast light"
            className={styles.wide}
          />
          <PhotoPlaceholder shot="06" ratio="3/4" subject="Interior steam cleaning of a minivan’s second-row seats" />
          <PhotoPlaceholder shot="07" ratio="3/4" subject="Detailer kneeling at a wheel, microfiber in hand, no visible logos or plates" />
        </div>
        <p className={styles.caption}>
          Photography will show real, licensed detailing work. These marked frames hold its place until then.
        </p>
      </Container>
    </section>
  );
}
