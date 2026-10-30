import { Car, Mail, MessageSquare, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppShell } from './AppShell';
import s from './preview.module.css';
import c from './CustomerPreview.module.css';

const vehicles = [
  { name: '2021 Tesla Model Y', meta: 'White · Small SUV', plate: 'LKT 4821', note: 'Coated Apr 2025 — check water beading' },
  { name: '2016 BMW 340i', meta: 'Black · Car', plate: 'HXR 0917', note: 'Swirls on hood; quote correction' },
];

const history = [
  { date: 'Oct 3', vehicle: 'Model Y', service: 'Maintenance wash', amount: '$65', status: <StatusBadge tone="positive">Completed</StatusBadge> },
  { date: 'Aug 21', vehicle: '340i', service: 'Interior reset', amount: '$180', status: <StatusBadge tone="positive">Completed</StatusBadge> },
  { date: 'Nov 5', vehicle: 'Model Y', service: 'Full detail', amount: '$310', status: <StatusBadge tone="info">Scheduled</StatusBadge> },
];

export function CustomerPreview() {
  return (
    <AppShell active="customers">
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Jordan Reyes</div>
          <div className={s.pageMeta}>Customer since Aug 2025 · prefers text</div>
        </div>
        <div className={c.contact}>
          <span className={s.btn}>
            <Phone size={12} strokeWidth={1.5} aria-hidden="true" /> Call
          </span>
          <span className={s.btn}>
            <MessageSquare size={12} strokeWidth={1.5} aria-hidden="true" /> Text
          </span>
          <span className={s.btn}>
            <Mail size={12} strokeWidth={1.5} aria-hidden="true" /> Email
          </span>
          <span className={s.sampleTag}>Sample data</span>
        </div>
      </div>

      <div className={c.layout}>
        <section className={s.panel} aria-label="Vehicles">
          <div className={s.panelHeader}>Vehicles · 2</div>
          {vehicles.map((v) => (
            <div key={v.plate} className={c.vehicle}>
              <Car size={16} strokeWidth={1.5} aria-hidden="true" className={c.vehicleIcon} />
              <div>
                <div className={s.primaryText}>{v.name}</div>
                <div className={s.secondaryText}>
                  {v.meta} · <span className={s.mono}>{v.plate}</span>
                </div>
                <div className={c.vehicleNote}>{v.note}</div>
              </div>
            </div>
          ))}
        </section>

        <section className={s.panel} aria-label="Service history">
          <div className={s.panelHeader}>Service history</div>
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Service</th>
                <th scope="col" className={c.num}>
                  Recorded
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.date}-${h.service}`}>
                  <td className="tabular">{h.date}</td>
                  <td>{h.vehicle}</td>
                  <td>{h.service}</td>
                  <td className={`${c.num} tabular`}>{h.amount}</td>
                  <td>{h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
