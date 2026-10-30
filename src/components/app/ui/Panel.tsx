import styles from './Panel.module.css';

// Bordered content section with an optional heading row (DESIGN_SYSTEM §10.4 sections).
export function Panel({
  title,
  action,
  children,
  flush = false,
  id,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section className={styles.panel} aria-labelledby={title && id ? id : undefined}>
      {title ? (
        <header className={styles.header}>
          <h2 id={id} className={styles.title}>
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className={flush ? undefined : styles.body}>{children}</div>
    </section>
  );
}

// DESIGN_SYSTEM §13.6: plain title, one sentence, one action.
export function EmptyState({ title, body, action, icon }: { title: string; body: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      {icon ? <span className={styles.emptyIcon}>{icon}</span> : null}
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyBody}>{body}</p>
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}
