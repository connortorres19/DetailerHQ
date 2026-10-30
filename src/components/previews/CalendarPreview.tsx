import { AppShell } from './AppShell';
import s from './preview.module.css';
import c from './CalendarPreview.module.css';

// Day view for a two-bay shop: concurrent jobs sit in lanes; the strip on the left shows
// how much capacity is in use (DESIGN_SYSTEM §13.4).
const START_HOUR = 8;
const END_HOUR = 17;
const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

type Item = {
  lane: 0 | 1;
  start: number; // hours, decimal
  end: number;
  title: string;
  detail: string;
  kind: 'scheduled' | 'progress' | 'held' | 'request';
};

const items: Item[] = [
  { lane: 0, start: 8, end: 12, title: '8:00 · Priya Natarajan', detail: 'Paint enhancement · Odyssey', kind: 'progress' },
  { lane: 1, start: 9, end: 11, title: '9:00 · Marcus Bell', detail: 'Interior reset · Tacoma', kind: 'scheduled' },
  { lane: 1, start: 11.5, end: 14, title: 'Held until 6:00 PM', detail: 'R-0043 · Full detail', kind: 'held' },
  { lane: 0, start: 13, end: 16.5, title: '1:00 · Jordan Reyes', detail: 'Full detail · Model Y', kind: 'scheduled' },
];

const usage = [
  { start: 8, end: 9, level: 'partial' },
  { start: 9, end: 11, level: 'full' },
  { start: 11, end: 11.5, level: 'partial' },
  { start: 11.5, end: 12, level: 'full' },
  { start: 12, end: 13, level: 'partial' },
  { start: 13, end: 14, level: 'full' },
  { start: 14, end: 16.5, level: 'partial' },
] as const;

const pct = (h: number) => `${((h - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%`;
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

export function CalendarPreview() {
  return (
    <AppShell active="calendar" business="Clearcoat Studio">
      <div className={s.pageHeader}>
        <div>
          <div className={s.pageTitle}>Fri, Nov 6</div>
          <div className={s.pageMeta}>Day view · 2 jobs at the same time</div>
        </div>
        <div className={c.toolbar}>
          <span className={s.sampleTag}>Sample data</span>
          <span className={c.segment} aria-hidden="true">
            <span className={c.segmentActive}>Day</span>
            <span>Week</span>
            <span>Agenda</span>
          </span>
        </div>
      </div>

      <div className={`${s.panel} ${c.calendar}`}>
        <div className={c.hours} aria-hidden="true">
          {hours.map((h) => (
            <span key={h} style={{ top: pct(h) }} className={`${c.hourLabel} tabular`}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
        <div className={c.usage} aria-hidden="true">
          {usage.map((u) => (
            <span
              key={u.start}
              className={u.level === 'full' ? c.usageFull : c.usagePartial}
              style={{ top: pct(u.start), height: `calc(${pct(u.end)} - ${pct(u.start)})` }}
            />
          ))}
        </div>
        <div className={c.grid}>
          {hours.slice(0, -1).map((h) => (
            <span key={h} className={c.line} style={{ top: pct(h) }} aria-hidden="true" />
          ))}
          {items.map((item) => (
            <div
              key={item.title}
              className={`${c.block} ${c[item.kind]}`}
              style={{
                top: pct(item.start),
                height: `calc(${pct(item.end)} - ${pct(item.start)} - 4px)`,
                left: item.lane === 0 ? '0%' : '50%',
              }}
            >
              <span className={c.blockTitle}>{item.title}</span>
              <span className={c.blockDetail}>{item.detail}</span>
            </div>
          ))}
          <span className={c.requestChip} style={{ top: pct(12.5) }}>
            Request · 12:30 · not yet counted
          </span>
        </div>
      </div>
      <p className={c.legend}>
        <span className={c.legendFull} /> Both slots in use <span className={c.legendPartial} /> One slot in use · Requests don’t use capacity until held or approved
      </p>
    </AppShell>
  );
}
