// Calendar math in the business's time zone (PRODUCT_PLAN §6.10). Instants are UTC Dates;
// "days" and "weeks" are the business's local ones, DST-aware.

function wallClock(tz: string, instant: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}

// Offset of `tz` from UTC at `instant`, in ms (e.g. Chicago in summer → −5h).
function offsetAt(tz: string, instant: Date): number {
  const w = wallClock(tz, instant);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

// The UTC instant of local midnight at the start of the given local date.
export function localMidnight(tz: string, year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  let instant = guess - offsetAt(tz, new Date(guess));
  instant = guess - offsetAt(tz, new Date(instant)); // correct across a DST change
  return new Date(instant);
}

export function dayRange(tz: string, now = new Date()) {
  const w = wallClock(tz, now);
  return { start: localMidnight(tz, w.year, w.month, w.day), end: localMidnight(tz, w.year, w.month, w.day + 1) };
}

// Sunday-to-Sunday, as US calendars show weeks.
export function weekRange(tz: string, now = new Date()) {
  const w = wallClock(tz, now);
  return {
    start: localMidnight(tz, w.year, w.month, w.day - w.weekday),
    end: localMidnight(tz, w.year, w.month, w.day - w.weekday + 7),
  };
}

export function formatDate(tz: string, instant: Date | string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options }).format(new Date(instant));
}

export function formatTimeRange(tz: string, start: string, end: string) {
  const f = (d: string) => formatDate(tz, d, { hour: 'numeric', minute: '2-digit' });
  return `${f(start)} – ${f(end)}`;
}

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
