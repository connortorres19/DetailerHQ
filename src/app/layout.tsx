import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { brand } from '@/config/brand';
import './globals.css';

// Fonts are downloaded at build time and served from this site (no runtime requests to Google).
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${brand.name} — Software for independent auto detailers (in development)`,
  description:
    'Booking requests, approvals, customers, vehicles, quotes and follow-ups for independent detailers. In development; not yet available.',
  robots: { index: false, follow: false }, // pre-launch preview with a provisional name
};

export const viewport: Viewport = {
  themeColor: '#171716',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
