import { PublicFrame } from '@/components/booking/PublicFrame';

// Public booking pages: the detailer's page, light only, single column (DESIGN_SYSTEM §9.4).
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
