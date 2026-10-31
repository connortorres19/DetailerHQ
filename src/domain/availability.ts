import { z } from 'zod';

// Weekly hours, blocked time and booking rules (Phase 4B). Mirrors migration 10 and the
// booking_settings checks; the database stays the final authority.

// Monday-first for display; stored weekday is 0 = Sunday … 6 = Saturday (availability_rules).
export const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
] as const;

// "HH:MM" in 15-minute steps, 00:00 … 24:00.
export const TIME_OPTIONS = Array.from({ length: 97 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { value, label: formatClock(value) };
});

export function formatClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.slice(0, 5).split(':').map(Number);
  if (h === 24 || (h === 0 && m === 0 && hhmm.startsWith('24'))) return 'Midnight';
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export type Window = { weekday: number; start: string; end: string };

const clock = /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/;

// Validates the week sent by the hours editor: valid weekdays and clock times, each window
// ending after it starts, and no overlaps on a day. Touching windows (09–12, 12–17) are merged
// into one so a job can run across the join. Errors are keyed by weekday.
export function parseWeek(json: string): { ok: true; windows: Window[] } | { ok: false; errors: Record<string, string> } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: { form: 'The hours couldn’t be read. Refresh and try again.' } };
  }
  const parsed = z
    .array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(clock), end: z.string().regex(clock) }))
    .max(42)
    .safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { form: 'The hours couldn’t be read. Refresh and try again.' } };

  const errors: Record<string, string> = {};
  const windows: Window[] = [];
  for (const day of WEEKDAYS) {
    const list = parsed.data
      .filter((w) => w.weekday === day.value)
      .sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    for (const w of list) {
      if (w.start === '24:00' || toMinutes(w.end) <= toMinutes(w.start)) {
        errors[`day.${day.value}`] = `${day.label}: each window must end after it starts.`;
      }
    }
    const merged: Window[] = [];
    for (const w of list) {
      const last = merged[merged.length - 1];
      if (last && toMinutes(w.start) < toMinutes(last.end)) {
        errors[`day.${day.value}`] ??= `${day.label}: windows overlap. Adjust them, or combine them into one.`;
      } else if (last && w.start === last.end) {
        last.end = w.end; // touching → one continuous window
      } else {
        merged.push({ ...w });
      }
    }
    windows.push(...merged);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, windows };
}

// --- Blocked time ------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');

export const timeOffSchema = z
  .object({
    startDate: isoDate,
    endDate: z.string().transform((v) => v || ''),
    allDay: z.string().optional().transform((v) => v === 'on'),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    label: z.string().trim().max(80, 'Use 80 characters or fewer.').optional(),
  })
  .transform((v, ctx) => {
    const endDate = v.endDate || v.startDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Choose a date.' });
      return z.NEVER;
    }
    if (endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date must be on or after the start date.' });
      return z.NEVER;
    }
    if (v.allDay) return { startDate: v.startDate, endDate, startTime: null, endTime: null, label: v.label || null };
    const startOk = !!v.startTime && clock.test(v.startTime) && v.startTime !== '24:00';
    const endOk = !!v.endTime && clock.test(v.endTime);
    if (!startOk || !endOk) {
      ctx.addIssue({ code: 'custom', path: [!startOk ? 'startTime' : 'endTime'], message: 'Choose a time.' });
      return z.NEVER;
    }
    if (endDate === v.startDate && toMinutes(v.endTime!) <= toMinutes(v.startTime!)) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The end time must be after the start time.' });
      return z.NEVER;
    }
    return { startDate: v.startDate, endDate, startTime: v.startTime!, endTime: v.endTime!, label: v.label || null };
  });

// --- Booking rules (booking_settings checks, migration 20261030120100) ----------------------

const intIn = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, message)
    .transform(Number);

export const NOTICE_OPTIONS = [
  { value: '0', label: 'No minimum' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '1 day' },
  { value: '2880', label: '2 days' },
  { value: '4320', label: '3 days' },
  { value: '10080', label: '1 week' },
  { value: '20160', label: '2 weeks' },
];

export const INTERVAL_OPTIONS = [
  { value: '15', label: 'Every 15 min' },
  { value: '30', label: 'Every 30 min' },
  { value: '45', label: 'Every 45 min' },
  { value: '60', label: 'Every hour' },
  { value: '90', label: 'Every 1 h 30 min' },
  { value: '120', label: 'Every 2 hours' },
];

export const bookingRulesSchema = z.object({
  minNoticeMin: intIn(0, 20160, 'Choose a minimum notice.'),
  horizonDays: intIn(1, 365, 'Enter a number of days from 1 to 365.'),
  bufferMin: intIn(0, 240, 'Enter minutes from 0 to 240.'),
  slotIntervalMin: intIn(15, 240, 'Choose how often start times are offered.'),
  maxJobsPerDay: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 50), 'Enter a number from 1 to 50, or leave blank for no limit.')
    .transform((v) => (v ? Number(v) : null)),
  cancelCutoffHours: intIn(0, 168, 'Enter hours from 0 to 168.'),
});

export const BOOKING_MODES = [
  {
    value: 'approval',
    label: 'Approval required',
    description: 'Customers send a request. Nothing is booked until you approve it, hold the time or suggest another.',
  },
  {
    value: 'instant',
    label: 'Instant booking',
    description: 'Customers pick an open time and the job is booked straight away. Only for services with a set price.',
  },
] as const;
