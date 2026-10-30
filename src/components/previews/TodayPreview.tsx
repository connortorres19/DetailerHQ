import { Clock, MapPin, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppShell } from './AppShell';
import s from './preview.module.css';
import t from './TodayPreview.module.css';

const schedule = [
  { time: '8:00 – 10:30 AM', who: 'Priya Natarajan', vehicle: '2023 Honda Odyssey · Silver', service: 'Interior reset', place: '4410 Shoal Creek Blvd', status: 'Completed', tone: 'positive' as const },
  { time: '11:30 AM – 3:30 PM', who: 'Jordan Reyes', vehicle: '2021 Tesla Model Y · White', service: 'Full detail', place: '1234 Oak St · gate code on file', status: 'Next', tone: 'info' as const },
  { time: '4:30 – 5:30 PM', who: 'Marcus Bell', vehicle: '2019 Toyota Tacoma TRD · Gray', service: 'Maintenance wash', place: '902 Kinney Ave', status: 'Scheduled', tone: 'info' as const },
];

export function TodayPreview() {
  return (
    <AppShell active="today">
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Today</div>
          <div className={s.pageMeta}>Thu, Nov 5 · 3 jobs · times in Central Time</div>
        </div>
        <span className={s.sampleTag}>Sample data</span>
      </div>

      <div className={t.grid}>
        <section className={s.panel} aria-label="Today's schedule">
          <div className={s.panelHeader}>Schedule</div>
          {schedule.map((job) => (
            <div key={job.who} className={`${s.row} ${job.status === 'Next' ? t.next : ''}`}>
              <div className={t.job}>
                <div className={`${s.mono} ${t.time}`}>{job.time}</div>
                <div className={s.primaryText}>
                  {job.who} · {job.service}
                </div>
                <div className={s.secondaryText}>{job.vehicle}</div>
                {job.status === 'Next' ? (
                  <div className={t.actions}>
                    <span className={s.btn}>
                      <MapPin size={12} strokeWidth={1.5} aria-hidden="true" /> {job.place}
                    </span>
                    <span className={s.btn}>
                      <Phone size={12} strokeWidth={1.5} aria-hidden="true" /> Call or text
                    </span>
                  </div>
                ) : null}
              </div>
              <StatusBadge tone={job.tone}>{job.status === 'Next' ? 'Up next' : job.status}</StatusBadge>
            </div>
          ))}
        </section>

        <div className={t.side}>
          <section className={s.panel} aria-label="Needs your action">
            <div className={s.panelHeader}>
              Needs your action <span className={t.count}>3</span>
            </div>
            <div className={s.row}>
              <div>
                <div className={s.primaryText}>Elena Kowalski</div>
                <div className={s.secondaryText}>Full detail · Sat, Nov 7, 9:00 AM</div>
              </div>
              <span className={t.age}>
                <Clock size={12} strokeWidth={1.5} aria-hidden="true" /> 26h
              </span>
            </div>
            <div className={s.row}>
              <div>
                <div className={s.primaryText}>Sam Whitaker</div>
                <div className={s.secondaryText}>Accepted your suggested time</div>
              </div>
              <StatusBadge tone="positive">Accepted</StatusBadge>
            </div>
          </section>

          <section className={s.panel} aria-label="Follow-ups due">
            <div className={s.panelHeader}>Follow-ups due</div>
            <div className={s.row}>
              <div>
                <div className={s.primaryText}>Follow up on quote Q-0012</div>
                <div className={s.secondaryText}>David Chen · ceramic coating</div>
              </div>
              <StatusBadge tone="critical">Overdue</StatusBadge>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
