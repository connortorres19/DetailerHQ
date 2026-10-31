import { z } from 'zod';

// Dashboard appearance, per signed-in user (public.user_preferences). Public booking pages are
// never themed: they always show the business's own branding on a light page.
export const THEMES = [
  { value: 'system', label: 'Match my device', hint: 'Light or dark, following your phone or computer setting.' },
  { value: 'light', label: 'Light', hint: 'Best in bright light and outdoors.' },
  { value: 'dark', label: 'Dark', hint: 'Easier on the eyes in the shop or at night.' },
] as const;
export type Theme = (typeof THEMES)[number]['value'];

export const themeSchema = z.object({ theme: z.enum(['system', 'light', 'dark'], { message: 'Choose an appearance.' }) });

export const asTheme = (v: unknown): Theme => (v === 'light' || v === 'dark' || v === 'system' ? v : 'system');
