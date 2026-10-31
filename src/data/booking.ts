import 'server-only';
import { cache } from 'react';
import { bookingPageSchema, requestStatusSchema, type BookingPage, type RequestStatus } from '@/domain/booking';
import { callPublic, clientIpHash, isWellFormedToken, sha256, type PublicError } from '@/lib/booking/server';
import { createClient } from '@/lib/supabase/server';

// Public booking page by slug, through the restricted booking_api role. Null when the business
// doesn't exist, isn't published or is suspended/closing (app.public_business).
export const getPublicBookingPage = cache(async (slug: string): Promise<BookingPage | null> => {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const result = await callPublic<unknown>('get_booking_page', [slug]);
  if (!result.ok || !result.data) return null;
  return bookingPageSchema.parse(result.data);
});

// The owner's own page in any state (signed in, RLS + membership checked in the database).
export async function getPreviewBookingPage(): Promise<BookingPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_booking_page');
  if (error) throw new Error(`Could not load the booking page preview: ${error.message}`);
  return bookingPageSchema.parse(data);
}

export type StatusLookup = { ok: true; status: RequestStatus } | { ok: false; error: PublicError | null };

// A status link. Malformed tokens never reach the database; wrong ones get a generic answer.
export const getRequestStatus = cache(async (token: string): Promise<StatusLookup> => {
  if (!isWellFormedToken(token)) return { ok: false, error: null };
  const result = await callPublic<unknown>('get_request_status', [sha256(token), await clientIpHash()]);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, status: requestStatusSchema.parse(result.data) };
});
