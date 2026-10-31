import type { CSSProperties } from 'react';
import { brandTheme, mediaUrl } from '@/domain/branding';
import type { PageBranding } from '@/domain/booking';
import styles from './booking.module.css';

// The owner's colours as CSS custom properties around the booking page (checked hex values only,
// with contrast worked out in domain/branding). Without colours the DetailerHQ defaults apply.
// Independent of the owner's dashboard theme: public pages are always rendered light.
export function BrandScope({ branding, children }: { branding: PageBranding; children: React.ReactNode }) {
  return (
    <div className={styles.brandScope} style={brandTheme(branding.colors) as CSSProperties}>
      {children}
    </div>
  );
}

// "Our work": the owner's published gallery, in a calm, even grid (4:3 crops, original on tap).
export function Gallery({ branding, name }: { branding: PageBranding; name: string }) {
  if (!branding.gallery.length) return null;
  return (
    <section className={styles.gallerySection} aria-labelledby="gallery-heading" id="our-work">
      <h2 id="gallery-heading" className={styles.sectionTitle}>
        Our work
      </h2>
      <ul className={styles.gallery} role="list">
        {branding.gallery.map((g, i) => (
          <li key={g.id}>
            <a href={mediaUrl(g.id)} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, already sized WebP */}
              <img
                src={mediaUrl(g.id)}
                alt={`Work by ${name}, photo ${i + 1} of ${branding.gallery.length}`}
                width={g.width}
                height={g.height}
                loading="lazy"
                decoding="async"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
