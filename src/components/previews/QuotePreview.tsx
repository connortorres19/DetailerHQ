import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppShell } from './AppShell';
import s from './preview.module.css';
import q from './QuotePreview.module.css';

const lines = [
  { name: 'Two-step paint correction', detail: 'Full exterior, swirl and haze removal', price: '$650.00' },
  { name: 'Ceramic coating — 3-year', detail: 'Paint, glass and wheel faces', price: '$900.00' },
  { name: 'Decontamination wash', detail: 'Iron and tar removal before correction', price: '$90.00' },
];

export function QuotePreview() {
  return (
    <AppShell active="quotes">
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>
            Quote <span className={s.mono}>Q-0012</span>
          </div>
          <div className={s.pageMeta}>David Chen · lead from Instagram · 2016 BMW 340i</div>
        </div>
        <span className={s.sampleTag}>Sample data</span>
      </div>

      <div className={q.layout}>
        <section className={s.panel} aria-label="Quote lines">
          <div className={s.panelHeader}>
            <span>Valid until Nov 18</span>
            <StatusBadge tone="info">Sent</StatusBadge>
          </div>
          {lines.map((line) => (
            <div key={line.name} className={s.row}>
              <div>
                <div className={s.primaryText}>{line.name}</div>
                <div className={s.secondaryText}>{line.detail}</div>
              </div>
              <span className="tabular">{line.price}</span>
            </div>
          ))}
          <div className={q.totals}>
            <span>Total</span>
            <span className="tabular">$1,640.00</span>
          </div>
        </section>

        <section className={s.panel} aria-label="Lead activity">
          <div className={s.panelHeader}>Lead activity</div>
          <ol className={q.timeline} role="list">
            <li>
              <span className={q.when}>Oct 29</span>
              Instagram DM logged — wants coating on a 2016 340i
            </li>
            <li>
              <span className={q.when}>Oct 30</span>
              Quote Q-0012 sent · link opened in Messages, marked sent
            </li>
            <li className={q.due}>
              <span className={q.when}>Nov 2</span>
              Follow-up due · no reply logged yet
            </li>
          </ol>
          <div className={q.status}>
            <StatusBadge tone="attention">Follow-up due</StatusBadge>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
