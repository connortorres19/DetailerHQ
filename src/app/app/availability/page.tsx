import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ConfirmAction } from '@/components/app/ui/ConfirmAction';
import { Notice } from '@/components/app/ui/Notice';
import { EmptyState, Panel } from '@/components/app/ui/Panel';
import { CapacityForm } from '@/app/app/settings/forms';
import { getAvailability } from '@/data/availability';
import { requireBusiness } from '@/data/session';
import { US_TIMEZONES } from '@/domain/business';
import { formatDate } from '@/domain/time';
import { deleteTimeOff } from './actions';
import { HoursForm } from './HoursForm';
import { RulesForm } from './RulesForm';
import { TimeOffForm } from './TimeOffForm';
import styles from './availability.module.css';

export const metadata: Metadata = { title: 'Availability' };

const SAVED: Record<string, ['positive' | 'critical', string]> = {
  unblocked: ['positive', 'Blocked time removed.'],
  missing: ['critical', 'We couldn’t find that blocked time.'],
};

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { business } = await requireBusiness('/app/availability');
  const { saved } = await searchParams;
  const flash = saved ? SAVED[saved] : undefined;
  const a = await getAvailability();
  const tz = business.timezone;
  // Zone name, not an abbreviation: CDT/CST changes with the date being shown.
  const zoneLabel = US_TIMEZONES.find((t) => t.value === tz)?.label ?? tz;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD, local

  const day = (d: Date) => formatDate(tz, d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = (d: Date) => formatDate(tz, d, { hour: 'numeric', minute: '2-digit' });
  const describe = (t: (typeof a.timeOff)[number]) => {
    if (t.all_day) {
      const lastDay = new Date(t.end.getTime() - 1);
      return day(t.start) === day(lastDay) ? `${day(t.start)} · all day` : `${day(t.start)} – ${day(lastDay)} · all day`;
    }
    return day(t.start) === day(t.end) ? `${day(t.start)} · ${time(t.start)} – ${time(t.end)}` : `${day(t.start)} ${time(t.start)} – ${day(t.end)} ${time(t.end)}`;
  };

  return (
    <>
      <PageHeader title="Availability" description={`When you work and how customers can book. All times are in ${zoneLabel}.`} />
      {flash ? (
        <div className={styles.flash}>
          <Notice tone={flash[0]}>{flash[1]}</Notice>
        </div>
      ) : null}
      <div className={styles.stack}>
        <Panel title="Weekly hours" id="hours">
          <HoursForm initial={a.rules.map((r) => ({ weekday: r.weekday, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) === '24:00' ? '24:00' : r.end_time.slice(0, 5) }))} />
        </Panel>

        <Panel title="Blocked dates and times" id="blocked">
          <p className={styles.hint}>Vacations, appointments of your own, a closed day — customers can’t book these times.</p>
          {a.timeOff.length === 0 ? (
            <EmptyState title="Nothing blocked" body="Time you block appears here until it has passed." />
          ) : (
            <ul className={styles.blocks} role="list">
              {a.timeOff.map((t) => (
                <li key={t.id} className={styles.block}>
                  <div>
                    <p className={styles.blockWhen}>{describe(t)}</p>
                    {t.label ? <p className={styles.hint}>{t.label}</p> : null}
                  </div>
                  <ConfirmAction action={deleteTimeOff.bind(null, t.id)} label="Remove" confirmLabel="Remove blocked time" message={`Make ${describe(t)} bookable again?`} />
                </li>
              ))}
            </ul>
          )}
          <h3 className={styles.subhead}>Block time</h3>
          <TimeOffForm today={today} zoneLabel={zoneLabel} />
        </Panel>

        <Panel title="Booking rules" id="rules">
          <RulesForm
            initial={{
              minNoticeMin: String(a.settings.min_notice_min),
              horizonDays: String(a.settings.horizon_days),
              bufferMin: String(a.settings.buffer_min),
              slotIntervalMin: String(a.settings.slot_interval_min),
              maxJobsPerDay: a.settings.max_jobs_per_day ? String(a.settings.max_jobs_per_day) : '',
              cancelCutoffHours: String(a.settings.cancel_cutoff_hours),
            }}
          />
        </Panel>

        <Panel title="Jobs at the same time" id="capacity">
          {business.service_mode === 'mobile' ? (
            <p>
              <span className="tabular">1</span> job at a time. Mobile businesses take one job at a time.
            </p>
          ) : (
            <CapacityForm current={a.capacity} />
          )}
        </Panel>
      </div>
    </>
  );
}
