import { BarChart3, CalendarDays, ClipboardList, FileText, Inbox, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import s from './preview.module.css';

export type PreviewSection = 'today' | 'requests' | 'calendar' | 'customers' | 'quotes' | 'tasks' | 'analytics';

const items: { key: PreviewSection; label: string; icon: React.ElementType; count?: string; attention?: boolean }[] = [
  { key: 'today', label: 'Today', icon: LayoutDashboard },
  { key: 'requests', label: 'Requests', icon: Inbox, count: '3', attention: true },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'tasks', label: 'Follow-ups', icon: ListChecks, count: '2' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

// Reduced-scale dashboard chrome shared by the interface previews.
export function AppShell({
  active,
  business = 'Northside Detail Co.',
  children,
}: {
  active: PreviewSection;
  business?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${s.app} ${s.withSidebar}`}>
      <div className={s.sidebar} aria-hidden="true">
        <div className={s.sidebarBrand}>{business}</div>
        {items.map(({ key, label, icon: Icon, count, attention }) => (
          <div key={key} className={`${s.navItem} ${key === active ? s.navActive : ''}`}>
            <span className={s.navLabel}>
              <Icon size={14} strokeWidth={1.5} />
              {label}
            </span>
            {count ? <span className={`${s.navCount} ${attention ? s.navCountAttention : ''}`}>{count}</span> : null}
          </div>
        ))}
        <div className={s.navItem} style={{ marginTop: 'auto' }}>
          <span className={s.navLabel}>
            <ClipboardList size={14} strokeWidth={1.5} />
            Services
          </span>
        </div>
      </div>
      <div className={s.main}>{children}</div>
    </div>
  );
}
