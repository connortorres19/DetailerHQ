import type { StatusTone } from '../components/ui/StatusBadge.tsx';

// Owner booking management (Phase 4D). A "booking" is a booking request (from the public page)
// and/or its appointment. Once an appointment exists, its status is what the owner works with.

export type DisplayStatus =
  | 'pending'
  | 'proposed'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'proposal_declined'
  | 'duplicate';

type RequestStatus = 'pending' | 'time_proposed' | 'approved' | 'declined' | 'withdrawn' | 'expired' | 'proposal_declined' | 'closed_duplicate';
type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

// Mirrors app.effective_request_status: a pending request whose time has passed, or a proposal
// past its answer-by time, reads as expired before the clean-up job runs.
export function displayStatus(
  request: { status: RequestStatus; requested_start: string; proposal_expires_at: string | null } | null,
  appointment: { status: AppointmentStatus } | null,
  now = new Date(),
): DisplayStatus {
  if (appointment) {
    return ({ scheduled: 'confirmed', in_progress: 'in_progress', completed: 'completed', cancelled: 'cancelled', no_show: 'no_show' } as const)[appointment.status];
  }
  if (!request) return 'expired';
  switch (request.status) {
    case 'pending':
      return new Date(request.requested_start) <= now ? 'expired' : 'pending';
    case 'time_proposed':
      return request.proposal_expires_at && new Date(request.proposal_expires_at) <= now ? 'expired' : 'proposed';
    case 'declined':
      return 'declined';
    case 'withdrawn':
      return 'withdrawn';
    case 'proposal_declined':
      return 'proposal_declined';
    case 'closed_duplicate':
      return 'duplicate';
    default:
      return 'expired';
  }
}

export const STATUS_LABEL: Record<DisplayStatus, [string, StatusTone]> = {
  pending: ['Pending', 'attention'],
  proposed: ['New time proposed', 'info'],
  confirmed: ['Confirmed', 'positive'],
  in_progress: ['In progress', 'positive'],
  completed: ['Completed', 'neutral'],
  cancelled: ['Cancelled', 'neutral'],
  no_show: ['No-show', 'critical'],
  declined: ['Declined', 'neutral'],
  withdrawn: ['Withdrawn by customer', 'neutral'],
  expired: ['Expired', 'neutral'],
  proposal_declined: ['Proposal declined', 'neutral'],
  duplicate: ['Closed as duplicate', 'neutral'],
};

export const FILTERS = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'pending', label: 'Pending', statuses: ['pending', 'proposed'] },
  { value: 'confirmed', label: 'Confirmed', statuses: ['confirmed', 'in_progress'] },
  { value: 'completed', label: 'Completed', statuses: ['completed'] },
  { value: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'no_show'] },
  { value: 'declined', label: 'Declined', statuses: ['declined', 'withdrawn', 'expired', 'proposal_declined', 'duplicate'] },
] as const satisfies readonly { value: string; label: string; statuses: readonly DisplayStatus[] | null }[];

export type Filter = (typeof FILTERS)[number]['value'];
export const parseFilter = (v: string | undefined): Filter => (FILTERS.some((f) => f.value === v) ? (v as Filter) : 'all');

// Needs action first (soonest first), then upcoming confirmed (soonest first), then the rest
// (most recent first).
export function sortRank(status: DisplayStatus, start: Date, now = new Date()): [number, number] {
  if (status === 'pending' || status === 'proposed') return [0, start.getTime()];
  if ((status === 'confirmed' || status === 'in_progress') && start >= new Date(now.getTime() - 12 * 3600_000)) return [1, start.getTime()];
  return [2, -start.getTime()];
}

// History lines from activity_events.
export function historyLine(e: { kind: string; to_status: string | null; actor_type: string; metadata: Record<string, unknown> }): string {
  const who = e.actor_type === 'customer' ? 'Customer' : e.actor_type === 'owner' ? 'You' : 'System';
  switch (e.kind) {
    case 'request_submitted':
      return 'Request received from the booking page';
    case 'appointment_created':
      return e.metadata.from_hold ? 'You booked it from a calendar hold' : 'You created the appointment';
    case 'hold_placed':
      return `${who} held the requested time`;
    case 'hold_released':
      return `${who} released the hold`;
    case 'appointment_rescheduled':
      return `${who} rescheduled the appointment`;
    case 'request_status_changed':
    case 'appointment_status_changed': {
      const to = e.to_status ?? '';
      const words: Record<string, string> = {
        approved: 'confirmed the booking',
        time_proposed: 'proposed another time',
        pending: e.actor_type === 'customer' ? 'tried to accept, but the time was no longer free' : 'withdrew the proposed time',
        declined: 'declined the request',
        withdrawn: 'withdrew the request',
        expired: 'request expired',
        proposal_declined: 'declined the proposed time',
        closed_duplicate: 'closed it as a duplicate',
        in_progress: 'started the job',
        completed: 'marked it completed',
        cancelled: 'cancelled the appointment',
        no_show: 'marked it a no-show',
        scheduled: 'reopened the appointment',
      };
      return to === 'expired' ? 'Request expired' : `${who} ${words[to] ?? `changed the status to ${to}`}`;
    }
    default:
      return e.kind.replaceAll('_', ' ');
  }
}

export const HOLD_HOURS = [
  { value: '2', label: '2 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '72', label: '72 hours' },
];

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const isClock = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// A local wall-clock time for PostgreSQL to read in the business zone (DST-correct there):
// "2026-11-09 13:00 America/Chicago".
export const localTimestamp = (date: string, time: string, tz: string) => `${date} ${time} ${tz}`;
