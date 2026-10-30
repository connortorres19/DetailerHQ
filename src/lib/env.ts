import { z } from 'zod';

// Public configuration only. The app never reads a Supabase secret/service-role key
// (PRODUCT_PLAN §9.5); `npm run test:bundle` checks the build for one.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  AUTH_SIGNUP_MODE: z.enum(['invite', 'open']).default('invite'),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  AUTH_SIGNUP_MODE: process.env.AUTH_SIGNUP_MODE,
});
