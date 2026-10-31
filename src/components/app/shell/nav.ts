import { CalendarClock, ClipboardList, Globe, LayoutDashboard, Settings2, Users } from 'lucide-react';

// Only screens that exist — no placeholders or dead links. Requests and Calendar join as their
// Phase 4 milestones ship.
export const NAV = [
  { href: '/app', label: 'Today', icon: LayoutDashboard, exact: true },
  { href: '/app/customers', label: 'Customers', icon: Users },
  { href: '/app/services', label: 'Services', icon: ClipboardList },
  { href: '/app/availability', label: 'Availability', icon: CalendarClock },
  { href: '/app/booking-page', label: 'Booking page', icon: Globe },
  { href: '/app/settings', label: 'Settings', icon: Settings2 },
] as const;
