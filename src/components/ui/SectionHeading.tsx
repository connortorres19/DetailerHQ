import styles from './SectionHeading.module.css';

type SectionHeadingProps = {
  id?: string;
  overline: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  tone?: 'light' | 'dark';
  align?: 'start' | 'split';
};

// Overline + title + optional intro. `split` puts the intro beside the title on wide screens.
export function SectionHeading({ id, overline, title, intro, tone = 'light', align = 'start' }: SectionHeadingProps) {
  return (
    <header className={[styles.heading, styles[tone], styles[align]].join(' ')}>
      <div className={styles.titleBlock}>
        <p className={styles.overline}>{overline}</p>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
      </div>
      {intro ? <div className={styles.intro}>{intro}</div> : null}
    </header>
  );
}
