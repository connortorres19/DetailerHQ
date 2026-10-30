import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import styles from './Notice.module.css';

type Tone = 'info' | 'positive' | 'attention' | 'critical';
const icons = { info: Info, positive: CircleCheck, attention: TriangleAlert, critical: CircleAlert };

// Inline banner / message (DESIGN_SYSTEM §13.7). Errors that need action are shown here, never in toasts.
export function Notice({ tone = 'info', children, action }: { tone?: Tone; children: React.ReactNode; action?: React.ReactNode }) {
  const Icon = icons[tone];
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={tone === 'critical' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
