import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't write an AGENTS.md into the repository on `next dev`.
  agentRules: false,
  // Earlier links (Phase 3 Settings/onboarding text, the product plan) used /b/<slug>. Send them to
  // the public booking route; /book/<slug> still decides whether the page is available.
  async redirects() {
    return [{ source: '/b/:slug', destination: '/book/:slug', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      // Status and quote links are secrets: never leak them in a Referer header or to search engines.
      ...['/r/:path*', '/q/:path*', '/u/:path*'].map((source) => ({
        source,
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      })),
    ];
  },
};

export default nextConfig;
