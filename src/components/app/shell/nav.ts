import { LayoutDashboard, Settings2, Users } from 'lucide-react';

// Only screens that exist. Requests, Calendar, Services, Availability and the booking page
// join this list in Phase 4 — no placeholders or dead links until then.
export const NAV = [
  { href: '/app', label: 'Today', icon: LayoutDashboard, exact: true },
  { href: '/app/customers', label: 'Customers', icon: Users },
  { href: '/app/settings', label: 'Settings', icon: Settings2 },
] as const;
