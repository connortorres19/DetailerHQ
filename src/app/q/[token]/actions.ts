'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/domain/forms';
import { callPublic, clientIpHash, isWellFormedToken, sha256 } from '@/lib/booking/server';

// The customer's answer on their quote link. The token is the only credential; the database finds
// the quote by its hash, checks it's still open and not past its date, and records the decision once.
async function answer(action: 'accept_quote' | 'decline_quote', token: string): Promise<FormState> {
  if (!isWellFormedToken(token)) return { status: 'error', message: 'This link isn’t valid.' };
  const result = await callPublic<{ status: string; already?: boolean }>(action, [sha256(token), await clientIpHash()]);
  revalidatePath(`/q/${token}`);
  if (!result.ok)
    return {
      status: 'error',
      message:
        result.error.code === 'DH005'
          ? 'Too many attempts from this connection. Please wait a few minutes.'
          : result.error.code === 'DH002'
            ? 'This quote has already been answered or is no longer open.'
            : 'This link isn’t valid.',
    };
  if (result.data.status === 'expired') return { status: 'error', message: 'This quote has expired. Please contact the business for a new one.' };
  return { status: 'success', message: action === 'accept_quote' ? 'accepted' : 'declined' };
}

export async function acceptQuote(token: string) {
  return answer('accept_quote', token);
}
export async function declineQuote(token: string) {
  return answer('decline_quote', token);
}
