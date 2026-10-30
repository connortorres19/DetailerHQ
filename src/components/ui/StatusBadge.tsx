import styles from './StatusBadge.module.css';

export type StatusTone = 'attention' | 'info' | 'positive' | 'critical' | 'neutral';

// Status is always conveyed by text; colour only reinforces it (DESIGN_SYSTEM §13.8).
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={[styles.badge, styles[tone]].join(' ')}>{children}</span>;
}
