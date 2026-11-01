'use server';

import type { FormState } from '@/domain/forms';
import { suppressFromToken } from '@/lib/email/unsubscribe';

export async function unsubscribe(token: string): Promise<FormState> {
  return (await suppressFromToken(token))
    ? { status: 'success', message: 'You’re unsubscribed from quote follow-up emails. You’ll still get emails about your bookings and quotes.' }
    : { status: 'error', message: 'This link isn’t valid.' };
}
