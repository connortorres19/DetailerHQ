import { Info } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppShell } from './AppShell';
import s from './preview.module.css';
import r from './RequestsPreview.module.css';

const inbox = [
  { who: 'Elena Kowalski', what: 'Full detail · Large SUV', when: 'Sat, Nov 7 · 9:00 AM', badge: <StatusBadge tone="attention">Pending</StatusBadge>, selected: true },
  { who: 'David Chen', what: 'Interior reset · Car', when: 'Sat, Nov 7 · 9:30 AM', badge: <StatusBadge tone="neutral">Duplicate?</StatusBadge> },
  { who: 'Sam Whitaker', what: 'Maintenance wash · Truck', when: 'Mon, Nov 9 · 1:00 PM', badge: <StatusBadge tone="info">Time proposed</StatusBadge> },
];

export function RequestsPreview() {
  return (
    <AppShell active="requests">
      <div className={s.pageHeader}>
        <div className={s.pageTitle}>Requests</div>
        <span className={s.sampleTag}>Sample data</span>
      </div>
      <div className={r.layout}>
        <section className={s.panel} aria-label="Requests inbox">
          <div className={s.panelHeader}>Needs action · oldest first</div>
          {inbox.map((item) => (
            <div key={item.who} className={`${s.row} ${item.selected ? s.rowSelected : ''}`}>
              <div>
                <div className={s.primaryText}>{item.who}</div>
                <div className={s.secondaryText}>
                  {item.what} · {item.when}
                </div>
              </div>
              {item.badge}
            </div>
          ))}
        </section>

        <section className={s.panel} aria-label="Request R-0041">
          <div className={s.panelHeader}>
            <span>
              <span className={s.mono}>R-0041</span> · received 26 hours ago
            </span>
            <StatusBadge tone="attention">Pending</StatusBadge>
          </div>
          <div className={s.panelBody}>
            <dl className={s.dl}>
              <dt>Customer</dt>
              <dd>Elena Kowalski · phone ending 0142</dd>
              <dt>Vehicle</dt>
              <dd>2022 Ford F-150 Lariat · Blue</dd>
              <dt>Services</dt>
              <dd>Full detail + pet hair removal</dd>
              <dt>Requested</dt>
              <dd>Sat, Nov 7 · 9:00 AM – 1:30 PM CT</dd>
              <dt>Location</dt>
              <dd>Mobile · 2715 Exposition Blvd</dd>
              <dt>Estimate</dt>
              <dd className="tabular">From $350 · 4h 30m</dd>
            </dl>
            <div className={s.divider} />
            <div className={s.note}>
              <Info size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>This time is open: 0 of 1 job slots in use. David Chen also asked for Saturday morning.</span>
            </div>
            <div className={r.actions}>
              <span className={`${s.btn} ${s.btnPrimary}`}>Approve request</span>
              <span className={s.btn}>Hold time</span>
              <span className={s.btn}>Suggest another time</span>
              <span className={`${s.btn} ${s.btnGhost}`}>Decline</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
