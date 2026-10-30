import styles from './InterfaceFrame.module.css';

type InterfaceFrameProps = {
  title: string;
  children: React.ReactNode;
  device?: 'browser' | 'phone';
  className?: string;
};

// Minimal device frame around an HTML interface preview. Always labelled as a preview
// with sample data, because the product is not built yet.
export function InterfaceFrame({ title, children, device = 'browser', className }: InterfaceFrameProps) {
  return (
    <figure className={[styles.frame, styles[device], className].filter(Boolean).join(' ')}>
      <div className={styles.body}>
        {device === 'browser' ? (
          <div className={styles.chrome} aria-hidden="true">
            <span className={styles.dots}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.address}>{title}</span>
          </div>
        ) : (
          <div className={styles.notch} aria-hidden="true" />
        )}
        <div className={styles.screen}>{children}</div>
      </div>
      <figcaption className={styles.caption}>Interface preview · sample data · product in development</figcaption>
    </figure>
  );
}
