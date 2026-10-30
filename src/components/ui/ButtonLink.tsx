import styles from './ButtonLink.module.css';

type Variant = 'primary' | 'secondary' | 'inverse' | 'outlineInverse';

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  size?: 'md' | 'lg';
  /** Marks a call to action whose destination is not live yet. */
  previewLabel?: string;
  icon?: React.ReactNode;
};

// Links styled as buttons. The site has no live actions yet, so every CTA navigates
// within the page; `previewLabel` states plainly that the real feature does not exist.
export function ButtonLink({ href, children, variant = 'primary', size = 'md', previewLabel, icon }: ButtonLinkProps) {
  return (
    <a href={href} className={[styles.button, styles[variant], styles[size]].join(' ')}>
      <span>{children}</span>
      {icon}
      {previewLabel ? <span className={styles.preview}>{previewLabel}</span> : null}
    </a>
  );
}
