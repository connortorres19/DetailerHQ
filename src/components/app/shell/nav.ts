import { CalendarClock, CalendarDays, ClipboardList, Globe, Inbox, LayoutDashboard, Settings2, Users } from 'lucide-react';

// Only screens that exist — no placeholders or dead links. Daily work first, then records, then setup.
// `phone`: shown in the phone tab bar; the rest sit under "More" there (DESIGN_SYSTEM §11.3).
export const NAV = [
  { href: '/app', label: 'Today', icon: LayoutDashboard, exact: true, phone: true },
  { href: '/app/bookings', label: 'Bookings', icon: Inbox, phone: true },
  { href: '/app/calendar', label: 'Calendar', icon: CalendarDays, phone: true },
  { href: '/app/customers', label: 'Customers', icon: Users, phone: true },
  { href: '/app/services', label: 'Services', icon: ClipboardList },
  { href: '/app/availability', label: 'Availability', icon: CalendarClock },
  { href: '/app/booking-page', label: 'Booking page', icon: Globe },
  { href: '/app/settings', label: 'Settings', icon: Settings2 },
] as const;
