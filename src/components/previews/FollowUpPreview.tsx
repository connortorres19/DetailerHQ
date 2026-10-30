import { Copy, Mail, MessageSquare } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppShell } from './AppShell';
import s from './preview.module.css';
import f from './FollowUpPreview.module.css';

const tasks = [
  { title: 'Follow up on quote Q-0012', who: 'David Chen · ceramic coating', badge: <StatusBadge tone="critical">Overdue · 3 days</StatusBadge> },
  { title: 'Maintenance wash reminder', who: 'Jordan Reyes · Model Y · 6 weeks since last visit', badge: <StatusBadge tone="attention">Due today</StatusBadge> },
  { title: 'Ask how the interior is holding up', who: 'Priya Natarajan · Odyssey', badge: <StatusBadge tone="neutral">Nov 12</StatusBadge> },
];

export function FollowUpPreview() {
  return (
    <AppShell active="tasks">
      <div className={s.pageHeader}>
        <div className={s.pageTitle}>Follow-ups</div>
        <span className={s.sampleTag}>Sample data</span>
      </div>
      <div className={f.layout}>
        <section className={s.panel} aria-label="Follow-up tasks">
          <div className={s.panelHeader}>Overdue and today</div>
          {tasks.map((task, i) => (
            <div key={task.title} className={`${s.row} ${i === 1 ? s.rowSelected : ''}`}>
              <div>
                <div className={s.primaryText}>{task.title}</div>
                <div className={s.secondaryText}>{task.who}</div>
              </div>
              {task.badge}
            </div>
          ))}
        </section>

        <section className={s.panel} aria-label="Message template">
          <div className={s.panelHeader}>Template · Maintenance reminder</div>
          <div className={s.panelBody}>
            <p className={f.message}>
              Hi Jordan, it’s been about six weeks since the Model Y’s last wash. Want me to hold a spot for you next
              week? Book or reply here: <span className={f.token}>Booking link</span> — Northside Detail Co.
            </p>
            <div className={f.buttons}>
              <span className={s.btn}>
                <Copy size={12} strokeWidth={1.5} aria-hidden="true" /> Copy
              </span>
              <span className={s.btn}>
                <MessageSquare size={12} strokeWidth={1.5} aria-hidden="true" /> Open in Messages
              </span>
              <span className={s.btn}>
                <Mail size={12} strokeWidth={1.5} aria-hidden="true" /> Open in Mail
              </span>
            </div>
            <p className={f.hint}>These open your own apps. Nothing is sent automatically.</p>
            <div className={`${s.note} ${s.noteAttention} ${f.prompt}`}>
              <span>Did you send it to Jordan?</span>
              <span className={f.promptActions}>
                <span className={`${s.btn} ${s.btnPrimary}`}>Yes, log it</span>
                <span className={`${s.btn} ${s.btnGhost}`}>Not yet</span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
