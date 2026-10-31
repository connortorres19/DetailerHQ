import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { EmptyState, Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getCalendar, listCalendarHolds, type CalendarEntry } from '@/data/bookings';
import { parseRange } from '@/data/availability';
import { requireBusiness } from '@/data/session';
import { isIsoDate, STATUS_LABEL } from '@/domain/bookings';
import { US_TIMEZONES } from '@/domain/business';
import { formatDate, localMidnight, wallClock } from '@/domain/time';
import { createClient } from '@/lib/supabase/server';
import { HoldForm, ReleaseHold } from './HoldForm';
import styles from './calendar.module.css';

export const metadata: Metadata = { title: 'Calendar' };

type View = 'day' | 'week' | 'agenda';
const PX_PER_MIN = 0.8;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];

// Side-by-side lanes for overlapping entries within one day.
function lanes(entries: { start: number; end: number }[]) {
  const order = entries.map((e, i) => ({ ...e, i })).sort((a, b) => a.start - b.start || b.end - a.end);
  const lane: number[] = [];
  const width: number[] = [];
  let cluster: number[] = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];
  const close = () => {
    const n = Math.max(1, ...cluster.map((i) => lane[i]! + 1));
    for (const i of cluster) width[i] = n;
    cluster = [];
    laneEnds.length = 0;
  };
  for (const e of order) {
    if (e.start >= clusterEnd) close();
    let l = laneEnds.findIndex((end) => end <= e.start);
    if (l === -1) l = laneEnds.length;
    laneEnds[l] = e.end;
    lane[e.i] = l;
    cluster.push(e.i);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  close();
  return { lane, width };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { business } = await requireBusiness('/app/calendar');
  const sp = await searchParams;
  const tz = business.timezone;
  const view: View = sp.view === 'day' || sp.view === 'agenda' ? sp.view : 'week';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const date = sp.date && isIsoDate(sp.date) ? sp.date : today;

  // Local days shown (business time zone; DST-aware via localMidnight).
  const firstDay = view === 'week' ? addDays(date, -new Date(`${date}T12:00:00Z`).getUTCDay()) : date;
  const dayCount = view === 'day' ? 1 : view === 'week' ? 7 : 14;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(firstDay, i));
  const from = localMidnight(tz, ...parts(days[0]!));
  const to = localMidnight(tz, ...parts(addDays(days.at(-1)!, 1)));

  const supabase = await createClient();
  const [entries, holds, rules] = await Promise.all([
    getCalendar(from, to),
    listCalendarHolds(),
    supabase.from('availability_rules').select('start_time, end_time'),
  ]);

  const step = view === 'day' ? 1 : view === 'week' ? 7 : 14;
  const href = (v: View, d: string) => `/app/calendar?view=${v}&date=${d}`;
  const zone = US_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;
  const dayLabel = (d: string) => formatDate('UTC', `${d}T12:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = (iso: string) => formatDate(tz, iso, { hour: 'numeric', minute: '2-digit' });
  const title =
    view === 'day'
      ? formatDate('UTC', `${date}T12:00:00Z`, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : `${dayLabel(days[0]!)} – ${dayLabel(days.at(-1)!)}`;

  // Visible hours: working hours and every entry, at least 7 AM–7 PM.
  const minuteOf = (iso: string) => {
    const w = wallClock(tz, new Date(iso));
    return w.hour * 60 + w.minute;
  };
  const ruleMins = (rules.data ?? []).flatMap((r) => [Number(r.start_time.slice(0, 2)) * 60, Number(r.end_time.slice(0, 2)) * 60 + Number(r.end_time.slice(3, 5))]);
  const entryMins = entries.flatMap((e) => [minuteOf(e.start), minuteOf(e.end) || 1440]);
  const startHour = Math.floor(Math.min(7 * 60, ...ruleMins, ...entryMins) / 60);
  const endHour = Math.ceil(Math.max(19 * 60, ...ruleMins, ...entryMins) / 60);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const entryClass = (e: CalendarEntry) =>
    [styles.entry, styles[e.kind], e.status === 'completed' || e.status === 'no_show' ? styles.closed : ''].filter(Boolean).join(' ');
  const kindLabel = (e: CalendarEntry) =>
    e.kind === 'appointment' ? STATUS_LABEL[e.status ?? 'confirmed'][0] : e.kind === 'pending' ? 'Pending request' : e.kind === 'proposal' ? 'Proposed time' : 'Hold';

  const dayEntries = (d: string) => {
    const s = localMidnight(tz, ...parts(d)).getTime();
    const e = localMidnight(tz, ...parts(addDays(d, 1))).getTime();
    return entries.filter((x) => new Date(x.start).getTime() < e && new Date(x.end).getTime() > s);
  };

  return (
    <>
      <PageHeader title="Calendar" description={`Confirmed jobs, holds and pending requests. Times in ${zone}.`} />
      <div className={styles.toolbar}>
        <div className={styles.nav}>
          <Link href={href(view, addDays(date, -step))} aria-label={`Previous ${view === 'agenda' ? 'two weeks' : view}`} className={styles.iconLink}>
            <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <Link href={href(view, today)} className={styles.todayLink}>
            Today
          </Link>
          <Link href={href(view, addDays(date, step))} aria-label={`Next ${view === 'agenda' ? 'two weeks' : view}`} className={styles.iconLink}>
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <nav className={styles.views} aria-label="Calendar view">
          {(['day', 'week', 'agenda'] as const).map((v) => (
            <Link key={v} href={href(v, date)} aria-current={view === v ? 'page' : undefined}>
              {v[0]!.toUpperCase() + v.slice(1)}
            </Link>
          ))}
        </nav>
      </div>

      <ul className={styles.legend} aria-label="Legend" role="list">
        <li><span className={`${styles.swatch} ${styles.appointment}`} /> Confirmed</li>
        <li><span className={`${styles.swatch} ${styles.pending}`} /> Pending request</li>
        <li><span className={`${styles.swatch} ${styles.proposal}`} /> Proposed time</li>
        <li><span className={`${styles.swatch} ${styles.hold}`} /> Hold</li>
      </ul>

      {view === 'agenda' ? (
        entries.length === 0 ? (
          <EmptyState title="Nothing in these two weeks" body="Confirmed jobs, holds and pending requests will appear here." />
        ) : (
          <div className={styles.agenda}>
            {days.map((d) => {
              const list = dayEntries(d);
              if (!list.length) return null;
              return (
                <section key={d} aria-label={dayLabel(d)}>
                  <h3 className={styles.agendaDay}>
                    {dayLabel(d)}
                    {d === today ? <span className={styles.todayTag}>Today</span> : null}
                  </h3>
                  <ul role="list" className={styles.agendaList}>
                    {list.map((e) => {
                      const content = (
                        <>
                          <span className={styles.agendaTime}>
                            {time(e.start)} – {time(e.end)}
                          </span>
                          <span className={styles.agendaText}>
                            <span className={styles.entryTitle}>{e.title}</span>
                            {e.detail ? <span className={styles.entryDetail}>{e.detail}</span> : null}
                          </span>
                          <StatusBadge tone={e.kind === 'appointment' ? STATUS_LABEL[e.status ?? 'confirmed'][1] : e.kind === 'pending' ? 'attention' : e.kind === 'proposal' ? 'info' : 'neutral'}>
                            {kindLabel(e)}
                          </StatusBadge>
                        </>
                      );
                      return (
                        <li key={e.id} className={`${styles.agendaItem} ${styles[e.kind]}`}>
                          {e.href ? <Link href={e.href}>{content}</Link> : <div>{content}</div>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className={styles.gridScroll}>
          <div className={styles.grid} style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(${view === 'week' ? 96 : 200}px, 1fr))` }} role="grid" aria-label={`Calendar, ${title}`}>
            <div className={styles.corner} />
            {days.map((d) => (
              <div key={d} className={`${styles.dayHead} ${d === today ? styles.isToday : ''}`} role="columnheader">
                {dayLabel(d)}
              </div>
            ))}
            <div className={styles.hours} style={{ height: hours.length * 60 * PX_PER_MIN }}>
              {hours.map((h) => (
                <span key={h} style={{ top: (h - startHour) * 60 * PX_PER_MIN }}>
                  {formatDate('UTC', `2026-01-01T${String(h).padStart(2, '0')}:00:00Z`, { hour: 'numeric' })}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const list = dayEntries(d);
              const dayStart = localMidnight(tz, ...parts(d)).getTime();
              const pos = list.map((e) => {
                const s = Math.max(new Date(e.start).getTime(), dayStart);
                const en = Math.min(new Date(e.end).getTime(), localMidnight(tz, ...parts(addDays(d, 1))).getTime());
                const sm = s === dayStart ? 0 : minuteOf(new Date(s).toISOString());
                const em = en >= localMidnight(tz, ...parts(addDays(d, 1))).getTime() ? 1440 : minuteOf(new Date(en).toISOString());
                return { start: sm, end: Math.max(em, sm + 15) };
              });
              const { lane, width } = lanes(pos);
              return (
                <div key={d} className={`${styles.dayCol} ${d === today ? styles.isToday : ''}`} style={{ height: hours.length * 60 * PX_PER_MIN }} role="gridcell" aria-label={dayLabel(d)}>
                  {hours.map((h) => (
                    <span key={h} className={styles.hourLine} style={{ top: (h - startHour) * 60 * PX_PER_MIN }} />
                  ))}
                  {list.map((e, i) => {
                    const p = pos[i]!;
                    const style = {
                      top: (p.start - startHour * 60) * PX_PER_MIN,
                      height: Math.max((p.end - p.start) * PX_PER_MIN - 2, 18),
                      left: `calc(${(lane[i]! / width[i]!) * 100}% + 2px)`,
                      width: `calc(${100 / width[i]!}% - 4px)`,
                    };
                    const label = `${kindLabel(e)}: ${e.title}, ${time(e.start)} to ${time(e.end)}`;
                    const body = (
                      <>
                        <span className={styles.entryTime}>{time(e.start)}</span>
                        <span className={styles.entryTitle}>{e.title}</span>
                        {e.detail ? <span className={styles.entryDetail}>{e.detail}</span> : null}
                      </>
                    );
                    return e.href ? (
                      <Link key={e.id} href={e.href} className={entryClass(e)} style={style} aria-label={label} title={label}>
                        {body}
                      </Link>
                    ) : (
                      <div key={e.id} className={entryClass(e)} style={style} aria-label={label} title={label}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.holdGrid}>
        <Panel title="Hold time" id="hold">
          <HoldForm today={today} defaultDate={date < today ? today : date} zone={zone} />
        </Panel>
        <Panel title="Active holds" id="holds">
          {holds.length === 0 ? (
            <p className={styles.muted}>No holds. A hold keeps a time free for a while without booking it — useful while a customer decides by phone.</p>
          ) : (
            <ul className={styles.holdList} role="list">
              {holds.map((h) => {
                const { start, end } = parseRange(String(h.during));
                return (
                  <li key={h.id}>
                    <div>
                      <p className={styles.entryTitle}>
                        {formatDate(tz, start, { weekday: 'short', month: 'short', day: 'numeric' })} · {time(start.toISOString())} – {time(end.toISOString())}
                      </p>
                      <p className={styles.muted}>
                        {h.note ? `${h.note} · ` : ''}held until {formatDate(tz, h.expires_at!, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <ReleaseHold holdId={h.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
