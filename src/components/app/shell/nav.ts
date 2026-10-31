import { ClipboardList, LayoutDashboard, Settings2, Users } from 'lucide-react';

// Only screens that exist — no placeholders or dead links. Requests, Calendar, Availability and
// the booking page join as their Phase 4 milestones ship.
export const NAV = [
  { href: '/app', label: 'Today', icon: LayoutDashboard, exact: true },
  { href: '/app/customers', label: 'Customers', icon: Users },
  { href: '/app/services', label: 'Services', icon: ClipboardList },
  { href: '/app/settings', label: 'Settings', icon: Settings2 },
] as const;
