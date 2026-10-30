'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Play } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ProductShowcase } from '@/components/sections/ProductShowcase';
import { ShowcaseStage, lastScreen } from '@/components/sections/ShowcaseStage';
import { brand } from '@/config/brand';
import { film } from '@/config/film';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import styles from './CinematicFilm.module.css';

/*
 * The homepage film (DESIGN_SYSTEM §8.1): one pinned stage whose scroll position drives the
 * video's currentTime. On large screens the phone screen at the end hands over to the real
 * interface previews, which shrink into the product showcase inside the same pin.
 *
 *   desktop  — ≥ 1024 × 640: film + phone hand-off + showcase steps, one pin.
 *   compact  — phones, tablets, short screens: lighter film, shorter pin, then the tab showcase.
 *   static   — reduced motion, Data Saver / 2G, load failure, before JS: poster + tab showcase.
 */
type Mode = 'static' | 'desktop' | 'compact';
type StaticReason = 'pending' | 'reduced' | 'low-data' | 'failed';

const DESKTOP_QUERY = '(min-width: 1024px) and (min-height: 640px)';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const HEADER = 64;

// Scroll lengths in stage heights (one unit ≈ one screen of scrolling).
const DESKTOP = { video: 5.2, hold: 0.3, shrink: 0.8, step: 0.55, tail: 0.25 } as const;
const COMPACT = { video: 2.6, tail: 0.15 } as const;

type Connection = { saveData?: boolean; effectiveType?: string };

function chooseMode(): { mode: Mode; reason: StaticReason } {
  if (window.matchMedia(REDUCE_QUERY).matches) return { mode: 'static', reason: 'reduced' };
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) {
    return { mode: 'static', reason: 'low-data' };
  }
  return { mode: window.matchMedia(DESKTOP_QUERY).matches ? 'desktop' : 'compact', reason: 'pending' };
}

function chooseSource(mode: Mode) {
  const pixels = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
  if (mode === 'desktop') return pixels >= 1500 ? film.sources[1080] : film.sources[720];
  return window.innerWidth >= 768 ? film.sources[720] : film.sources[540];
}

export function CinematicFilm() {
  const [mode, setMode] = useState<Mode>('static');
  const [reason, setReason] = useState<StaticReason>('pending');
  const [src, setSrc] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [watching, setWatching] = useState(false);
  const [active, setActive] = useState(0);

  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scrollToUnit = useRef<(unit: number) => void>(() => {});
  const stepStart = useRef(0);

  // Pick the experience on the client and follow viewport / preference changes.
  useEffect(() => {
    const update = () => {
      if (reason === 'failed') return;
      const next = chooseMode();
      setMode(next.mode);
      setReason(next.reason);
      setSrc(next.mode === 'static' ? null : chooseSource(next.mode));
    };
    update();
    const queries = [window.matchMedia(DESKTOP_QUERY), window.matchMedia(REDUCE_QUERY)];
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, [reason]);

  const fail = useCallback(() => {
    setReason('failed');
    setMode('static');
    setSrc(null);
  }, []);

  // Video lifecycle: show the poster until a frame is decoded; fall back if nothing arrives.
  useEffect(() => {
    const el = video.current;
    if (!el || !src) return;
    setVideoReady(false);
    const timer = window.setTimeout(() => {
      if (el.readyState < 2) fail();
    }, film.loadTimeoutMs);
    const onData = () => {
      setVideoReady(true);
      window.clearTimeout(timer);
    };
    // iOS Safari won't decode frames for seeking until the element has played once.
    const prime = () => {
      el.play().then(() => el.pause()).catch(() => {});
    };
    el.addEventListener('loadeddata', onData);
    el.addEventListener('loadedmetadata', prime, { once: true });
    el.addEventListener('error', fail);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('loadeddata', onData);
      el.removeEventListener('loadedmetadata', prime);
      el.removeEventListener('error', fail);
    };
  }, [src, fail]);

  useGSAP(
    () => {
      if (mode === 'static' || !stage.current || !video.current) return;
      const desktop = mode === 'desktop';
      const el = video.current;
      const stageEl = stage.current;
      const q = gsap.utils.selector(root);
      const end = film.duration - 1 / 30;
      const videoUnits = desktop ? DESKTOP.video : COMPACT.video;
      const unitAt = (seconds: number) => (seconds / end) * videoUnits;

      // ---- Scroll → currentTime. One seek at a time; the next starts when it lands. ----
      const playhead = { t: 0 };
      const seek = () => {
        if (el.readyState < 1 || el.seeking) return;
        const t = Math.min(Math.max(playhead.t, 0), (el.duration || film.duration) - 0.04);
        if (Math.abs(el.currentTime - t) > 0.5 / 30) el.currentTime = t;
      };
      gsap.ticker.add(seek);
      el.addEventListener('seeked', seek);

      const total = desktop
        ? DESKTOP.video + DESKTOP.hold + DESKTOP.shrink + DESKTOP.step * lastScreen + DESKTOP.tail
        : COMPACT.video + COMPACT.tail;
      const firstStep = DESKTOP.video + DESKTOP.hold + DESKTOP.shrink;
      stepStart.current = firstStep;

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: stageEl,
          start: `top top+=${HEADER}`,
          end: () => `+=${stageEl.clientHeight * total}`,
          pin: true,
          scrub: desktop ? 0.5 : 0.3,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          // Only the showcase snaps; the film itself scrubs freely.
          snap: desktop
            ? {
                snapTo: (p: number) => {
                  const u = p * total;
                  if (u < firstStep - DESKTOP.step / 2) return p;
                  const i = Math.min(lastScreen, Math.max(0, Math.round((u - firstStep) / DESKTOP.step)));
                  return (firstStep + i * DESKTOP.step) / total;
                },
                inertia: false,
                directional: false,
                delay: 0.1,
                duration: { min: 0.2, max: 0.5 },
                ease: 'power1.inOut',
              }
            : undefined,
          onUpdate(self) {
            if (!desktop) return;
            const i = Math.round((self.progress * total - firstStep) / DESKTOP.step);
            const next = Math.min(lastScreen, Math.max(0, i));
            setActive((a) => (a === next ? a : next));
          },
        },
      });
      const st = tl.scrollTrigger!;
      scrollToUnit.current = (unit) => {
        window.scrollTo({ top: st.start + ((st.end - st.start) * unit) / total, behavior: 'smooth' });
      };

      tl.to(playhead, { t: end, duration: videoUnits }, 0);

      // Hero copy gives way to the film as soon as scrolling starts (kept in the accessibility tree).
      tl.to(q('[data-film="copy"]'), { opacity: 0, y: -16, duration: 0.35 }, 0.1);
      tl.set(q('[data-film="copy"]'), { pointerEvents: 'none' }, 0.3);

      // Captions wait for the copy to clear. On phones the last one stays up to the end of the film.
      film.chapters.forEach((chapter, i) => {
        const node = q(`[data-film="chapter-${i}"]`);
        const last = i === film.chapters.length - 1;
        tl.fromTo(node, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.15 }, Math.max(unitAt(chapter.from), 0.5));
        if (desktop || !last) tl.to(node, { autoAlpha: 0, y: -8, duration: 0.15 }, unitAt(chapter.to) - 0.15);
      });

      // Black phone screen → graphite, so the hand-off never shows a black pause.
      const curtainAt = unitAt(film.handoff + 0.6);
      tl.fromTo(q('[data-film="curtain"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: videoUnits - curtainAt }, curtainAt);

      if (desktop) {
        const frame = q('[data-showcase="frame"]')[0] as HTMLElement;
        const screen = q('[data-showcase="screen"]')[0] as HTMLElement;
        const panels = q('[data-showcase="panel"]');
        const notes = q('[data-showcase="note"]');
        const chrome = q('[data-showcase="chrome"]');
        const progress = q('[data-showcase="progress"]');

        // Geometry, re-measured on every refresh: `rest` fits the frame in the stage, `full`
        // scales it so the interface's screen covers the whole stage like the phone did.
        const g = { rest: 1, full: 1, x: 0, y: 0 };
        const measure = () => {
          gsap.set(frame, { clearProps: 'transform' });
          // Give the interface the stage's proportions so the full-screen state crops nothing.
          screen.style.minHeight = '';
          screen.style.minHeight = `${Math.round((screen.offsetWidth * stageEl.clientHeight) / stageEl.clientWidth)}px`;
          const stageBox = stageEl.getBoundingClientRect();
          const frameBox = frame.getBoundingClientRect();
          const screenBox = screen.getBoundingClientRect();
          const top = frameBox.top - stageBox.top;
          const left = frameBox.left - stageBox.left;
          const room = stageEl.clientHeight - top - 16;
          g.rest = Math.min(1, Math.max(0.55, room / frame.offsetHeight));
          g.full = Math.max(stageBox.width / screenBox.width, stageBox.height / screenBox.height);
          // Transform origin is the frame's top centre.
          const cx = screenBox.left - frameBox.left + screenBox.width / 2;
          const cy = screenBox.top - frameBox.top + screenBox.height / 2;
          g.x = stageBox.width / 2 - left - frameBox.width / 2 - (cx - frameBox.width / 2) * g.full;
          g.y = stageBox.height / 2 - top - cy * g.full;
        };
        measure();
        ScrollTrigger.addEventListener('refreshInit', measure);

        gsap.set(frame, { transformOrigin: '50% 0%' });
        gsap.set([...panels.slice(1), ...notes.slice(1)], { autoAlpha: 0, y: 12 });

        // The interface lights up where the phone screen was, already filling the stage.
        const uiIn = unitAt(film.handoff) + 0.02;
        tl.fromTo(
          frame,
          { autoAlpha: 0, scale: () => g.full * 1.03, x: () => g.x, y: () => g.y },
          { autoAlpha: 1, scale: () => g.full, x: () => g.x, y: () => g.y, duration: videoUnits - uiIn, ease: 'power1.out' },
          uiIn,
        );
        // …holds, then settles into the showcase.
        const shrinkAt = DESKTOP.video + DESKTOP.hold;
        tl.to(frame, { scale: () => g.rest, x: 0, y: 0, duration: DESKTOP.shrink, ease: 'power2.inOut' }, shrinkAt);
        tl.fromTo(chrome, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: DESKTOP.shrink * 0.45 }, shrinkAt + DESKTOP.shrink * 0.55);

        // Showcase steps: out, then in, midway between snap points.
        for (let i = 1; i <= lastScreen; i++) {
          const at = firstStep + (i - 0.7) * DESKTOP.step;
          tl.to([panels[i - 1]!, notes[i - 1]!], { autoAlpha: 0, duration: DESKTOP.step * 0.18 }, at);
          tl.fromTo(
            [panels[i]!, notes[i]!],
            { autoAlpha: 0, y: 12 },
            { autoAlpha: 1, y: 0, duration: DESKTOP.step * 0.22 },
            at + DESKTOP.step * 0.18,
          );
        }
        tl.fromTo(progress, { scaleX: 0 }, { scaleX: 1, duration: DESKTOP.step * lastScreen }, firstStep);
        tl.to({}, { duration: DESKTOP.tail }, firstStep + DESKTOP.step * lastScreen);

        // Links to #product go to the showcase's first screen inside the pin.
        const onClick = (event: MouseEvent) => {
          const link = (event.target as Element | null)?.closest?.('a[href="#product"]');
          if (!link) return;
          event.preventDefault();
          scrollToUnit.current(firstStep);
        };
        document.addEventListener('click', onClick, true);
        if (window.location.hash === '#product') {
          requestAnimationFrame(() => window.scrollTo({ top: st.start + ((st.end - st.start) * firstStep) / total }));
        }

        return () => {
          document.removeEventListener('click', onClick, true);
          ScrollTrigger.removeEventListener('refreshInit', measure);
          gsap.ticker.remove(seek);
          el.removeEventListener('seeked', seek);
          setActive(0);
        };
      }

      tl.to({}, { duration: COMPACT.tail }, COMPACT.video);
      return () => {
        gsap.ticker.remove(seek);
        el.removeEventListener('seeked', seek);
      };
    },
    { scope: root, dependencies: [mode, src], revertOnUpdate: true },
  );

  const selectStep = (index: number) => {
    setActive(index);
    scrollToUnit.current(stepStart.current + index * DESKTOP.step);
  };

  const filmOn = mode !== 'static';
  const showWatch = mode === 'static' && (reason === 'reduced' || reason === 'low-data');

  return (
    <>
      <section ref={root} className={styles.film} data-mode={mode} aria-labelledby="hero-title">
        <div ref={stage} className={styles.stage} data-film="stage">
          <div className={styles.media}>
            <picture className={styles.poster} data-hidden={(filmOn && videoReady) || watching}>
              <source media={REDUCE_QUERY} srcSet={`${film.posters.reveal[960]} 960w, ${film.posters.reveal[1600]} 1600w`} sizes="100vw" />
              <img
                src={film.posters.start[1600]}
                srcSet={`${film.posters.start[960]} 960w, ${film.posters.start[1600]} 1600w`}
                sizes="100vw"
                alt=""
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            {filmOn && src ? (
              <video
                ref={video}
                className={styles.video}
                src={src}
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                disableRemotePlayback
                aria-hidden="true"
                tabIndex={-1}
              />
            ) : null}
            {watching ? (
              <video
                className={styles.video}
                src={window.innerWidth >= 768 ? film.sources[720] : film.sources[540]}
                controls
                autoPlay
                muted
                playsInline
                aria-label="DetailerHQ film: a black car is washed and detailed; the detailer then takes out his phone."
              />
            ) : null}
            <div className={styles.curtain} data-film="curtain" aria-hidden="true" />
          </div>
          <div className={styles.shade} aria-hidden="true" />

          <div className={styles.overlay} data-film="copy">
            <Container>
              <div className={styles.copy}>
                <p className={styles.overline}>Software for independent detailers · {brand.stage}</p>
                <h1 id="hero-title" className={styles.title}>
                  Run your detailing business from one tidy place.
                </h1>
                <p className={styles.lede}>
                  Take booking requests, approve jobs, keep every customer and vehicle on record, and follow up on
                  quotes — from your phone or your desk.
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
            </Container>
          </div>

          {filmOn ? (
            <div className={styles.captions} aria-hidden="true">
              <Container className={styles.captionsInner}>
                {film.chapters.map((chapter, i) => (
                  <div key={chapter.id} className={styles.chapter} data-film={`chapter-${i}`}>
                    <p className={styles.chapterLabel}>
                      <span className="tabular">{chapter.id}</span> {chapter.label}
                    </p>
                    {'message' in chapter ? <p className={styles.message}>{chapter.message}</p> : null}
                  </div>
                ))}
              </Container>
            </div>
          ) : null}

          <div className={styles.meta}>
            <Container className={styles.metaInner}>
              <span>{film.credit}</span>
              {showWatch && !watching ? (
                <button type="button" className={styles.watch} onClick={() => setWatching(true)}>
                  <Play size={14} strokeWidth={1.5} aria-hidden="true" /> Watch the film
                </button>
              ) : null}
              <a href="#overview" className={styles.skip}>
                {filmOn ? 'Skip film' : 'Continue'} <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
              </a>
            </Container>
          </div>

          {mode === 'desktop' ? (
            <div id="product" className={styles.showcase} aria-label="Inside the product">
              <Container>
                <ShowcaseStage active={active} onSelect={selectStep} mode="film" tone="dark" />
              </Container>
            </div>
          ) : null}
        </div>
      </section>
      {mode === 'desktop' ? null : <ProductShowcase />}
    </>
  );
}
