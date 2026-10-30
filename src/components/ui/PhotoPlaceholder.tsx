import styles from './PhotoPlaceholder.module.css';

type PhotoPlaceholderProps = {
  /** Shot number in the photography brief, e.g. "01". */
  shot: string;
  /** What the licensed photograph should show. */
  subject: string;
  ratio?: '4/5' | '3/2' | '16/9' | '1/1' | '3/4';
  className?: string;
};

// Clearly marked stand-in for licensed photography (no unlicensed or generated images).
// Styled as a photo-direction slate so the layout can be judged before images exist.
export function PhotoPlaceholder({ shot, subject, ratio = '3/2', className }: PhotoPlaceholderProps) {
  return (
    <figure
      className={[styles.placeholder, className].filter(Boolean).join(' ')}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={`Photography placeholder: ${subject}. Licensed image to be added.`}
    >
      <span className={styles.corner} data-pos="tl" aria-hidden="true" />
      <span className={styles.corner} data-pos="tr" aria-hidden="true" />
      <span className={styles.corner} data-pos="bl" aria-hidden="true" />
      <span className={styles.corner} data-pos="br" aria-hidden="true" />
      <figcaption className={styles.caption} aria-hidden="true">
        <span className={styles.label}>Photography placeholder · Shot {shot}</span>
        <span className={styles.subject}>{subject}</span>
        <span className={styles.meta}>Licensed image required · {ratio.replace('/', ':')}</span>
      </figcaption>
    </figure>
  );
}
