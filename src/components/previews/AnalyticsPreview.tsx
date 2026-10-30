import { AppShell } from './AppShell';
import s from './preview.module.css';
import a from './AnalyticsPreview.module.css';

// Every figure is sample data and each metric carries its definition, as the real
// analytics page will (PRODUCT_PLAN §11).
const metrics = [
  { label: 'Quoted value', value: '$4,820', help: 'Quotes you sent in October' },
  { label: 'Booked job value', value: '$6,135', help: 'Estimated value of scheduled and completed jobs' },
  { label: 'Recorded revenue', value: '$5,410', help: 'Amounts you entered when completing jobs' },
];

const services = [
  { name: 'Full detail', jobs: 9, amount: '$2,790' },
  { name: 'Maintenance wash', jobs: 14, amount: '$910' },
  { name: 'Interior reset', jobs: 6, amount: '$1,080' },
  { name: 'Paint enhancement', jobs: 1, amount: '$630' },
];
const maxJobs = Math.max(...services.map((x) => x.jobs));

export function AnalyticsPreview() {
  return (
    <AppShell active="analytics">
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Analytics</div>
          <div className={s.pageMeta}>October · times and dates in Central Time</div>
        </div>
        <span className={s.sampleTag}>Sample data — not real results</span>
      </div>

      <section className={`${s.panel} ${a.metrics}`} aria-label="Money">
        {metrics.map((m) => (
          <div key={m.label} className={a.metric}>
            <div className={a.metricLabel}>{m.label}</div>
            <div className={`${a.metricValue} tabular`}>{m.value}</div>
            <div className={s.secondaryText}>{m.help}</div>
          </div>
        ))}
      </section>

      <div className={a.layout}>
        <section className={s.panel} aria-label="Completed jobs by service">
          <div className={s.panelHeader}>Completed jobs by service</div>
          <div className={s.panelBody}>
            <ul className={a.bars} role="list">
              {services.map((x) => (
                <li key={x.name}>
                  <span className={a.barLabel}>{x.name}</span>
                  <span className={a.barTrack}>
                    <span className={a.bar} style={{ width: `${(x.jobs / maxJobs) * 100}%` }} />
                  </span>
                  <span className={`${a.barValue} tabular`}>
                    {x.jobs} · {x.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={s.panel} aria-label="Quote acceptance">
          <div className={s.panelHeader}>Quote acceptance</div>
          <div className={s.panelBody}>
            <div className={a.insufficient}>Not enough data yet</div>
            <p className={s.secondaryText}>3 decided quotes in October — percentages appear at 5.</p>
            <div className={s.divider} />
            <p className={s.secondaryText}>
              2 leads booked after a logged follow-up. This shows timing only — it doesn’t mean the follow-up caused the
              booking.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
