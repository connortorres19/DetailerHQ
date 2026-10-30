'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { brand } from '@/config/brand';
import { heroFrames } from '@/config/heroFrames';
import { gsap, useGSAP } from '@/lib/gsap';
import styles from './Hero.module.css';

// Approved scroll sequence 1 (DESIGN_SYSTEM §8.1): the photograph opens from a crop
// to full frame with a slow push-in, then steps through the shoot. The copy never moves.
// Start values must match the no-preference states in Hero.module.css.
const START_SCALE = { pinned: 0.84, compact: 0.92 };
const PUSH_IN = 1.08;
const last = heroFrames.length - 1;

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState(0);
  const current = heroFrames[frame] ?? heroFrames[0]!;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        // gsap.matchMedia only calls back when a condition matches, so `motion` covers phones.
        { motion: '(prefers-reduced-motion: no-preference)', pinned: '(min-width: 1024px) and (min-height: 720px)' },
        (context) => {
          const { motion, pinned } = context.conditions as { motion: boolean; pinned: boolean };
          if (!motion) return;

          const q = gsap.utils.selector(root);
          const windowEl = q(`.${styles.window}`)[0] as HTMLElement;
          const inner = q(`.${styles.inner}`)[0] as HTMLElement;
          const frames = q(`.${styles.frame}`);
          const stage = q(`.${styles.stage}`)[0] as HTMLElement;

          // The crop widens while the image settles: outer scale grows, inner counter-scales.
          const reveal = { p: 0 };
          const start = pinned ? START_SCALE.pinned : START_SCALE.compact;
          const applyReveal = () => {
            const outer = start + (1 - start) * reveal.p;
            const push = PUSH_IN + (1 - PUSH_IN) * reveal.p;
            gsap.set(windowEl, { scale: outer });
            gsap.set(inner, { scale: push / outer });
          };

          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: pinned
              ? {
                  trigger: root.current,
                  start: 'top top+=64',
                  end: () => `+=${window.innerHeight * 1.6}`,
                  pin: true,
                  scrub: 0.6,
                  anticipatePin: 1,
                  invalidateOnRefresh: true,
                }
              : {
                  // Phones and tablets: no pin. The sequence plays while the image scrolls past.
                  trigger: stage,
                  start: 0,
                  end: () => stage.getBoundingClientRect().bottom + window.scrollY - 64,
                  scrub: 0.4,
                  invalidateOnRefresh: true,
                },
            onUpdate() {
              const t = tl.time();
              const next = Math.min(last, Math.max(0, Math.floor((t - 0.2) / 0.8)));
              setFrame((f) => (f === next ? f : next));
            },
          });

          gsap.set(frames, { opacity: (i: number) => (i === 0 ? 1 : 0) });
          tl.to(reveal, { p: 1, duration: 1.2, ease: 'power1.out', onUpdate: applyReveal }, 0);
          frames.forEach((el, i) => {
            if (i === 0) return;
            // Cross-fade into frame i, centred on t = 0.2 + 0.8 * i.
            tl.to(frames[i - 1]!, { opacity: 0, duration: 0.4 }, 0.8 * i);
            tl.to(el, { opacity: 1, duration: 0.4 }, 0.8 * i);
          });
          tl.to({}, { duration: 0.4 });
          applyReveal();

          return () => setFrame(0);
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className={styles.hero} aria-labelledby="hero-title">
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

          <div className={styles.stage}>
            <div className={styles.window}>
              <div className={styles.inner}>
                {heroFrames.map((f, i) => (
                  <div key={f.shot} className={styles.frame}>
                    {f.image ? (
                      <Image
                        src={f.image.src}
                        alt={f.image.alt}
                        fill
                        sizes="(min-width: 1024px) 42vw, 100vw"
                        priority={i === 0 || i === last}
                        className={styles.photo}
                      />
                    ) : (
                      <PhotoPlaceholder shot={f.shot} subject={f.subject} fill />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className={styles.counter} aria-hidden="true">
              <span className="tabular">
                {current.shot} / {heroFrames[last]!.shot}
              </span>
              <span className={styles.counterLabel}>{current.label}</span>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
