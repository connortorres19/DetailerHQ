import { z } from 'zod';

// Matches supabase/config.toml (minimum_password_length = 10). 72 is bcrypt's input limit.
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(72, 'Use 72 characters or fewer.');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z.object({ email: emailSchema, password: passwordSchema });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords don’t match.' });

// Only same-site, absolute paths are followed after sign-in (no open redirects).
export function safeNext(next: unknown, fallback = '/app'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

// Supabase Auth error codes → owner-facing messages. Unknown errors get a generic message;
// details stay in server logs.
export function authMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password don’t match an account.';
    case 'email_not_confirmed':
      return 'Confirm your email first — use the link we sent you.';
    case 'weak_password':
      return 'Choose a stronger password.';
    case 'same_password':
      return 'Your new password must be different from the current one.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a minute and try again.';
    case 'signup_disabled':
      return 'Early access is invite-only right now.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export const changeEmailSchema = z.object({ email: emailSchema });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password.'), password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords don’t match.' });
