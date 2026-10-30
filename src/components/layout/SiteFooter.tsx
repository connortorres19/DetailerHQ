import { brand } from '@/config/brand';
import { Container } from '@/components/ui/Container';
import { Wordmark } from './Wordmark';
import { sectionLinks } from './navigation';
import styles from './SiteFooter.module.css';

const pendingDocuments = ['Terms of Service', 'Privacy Policy', 'Early-access terms'];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.grid}>
          <div className={styles.brand}>
            <Wordmark />
            <p className={styles.tagline}>Software for independent auto detailers. {brand.stage}.</p>
          </div>

          <nav aria-label="Footer" className={styles.column}>
            <h2 className={styles.heading}>On this page</h2>
            <ul role="list">
              {sectionLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.column}>
            <h2 className={styles.heading}>Legal</h2>
            <ul role="list">
              {pendingDocuments.map((name) => (
                <li key={name} className={styles.pending}>
                  {name} <span>— to be published before launch</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.column}>
            <h2 className={styles.heading}>Contact</h2>
            <p className={styles.pending}>{brand.contactPlaceholder}</p>
          </div>
        </div>

        <div className={styles.base}>
          <p>{brand.provisionalNotice}</p>
          <p>Interface previews show sample data. Photography placeholders mark where licensed images will go.</p>
        </div>
      </Container>
    </footer>
  );
}
