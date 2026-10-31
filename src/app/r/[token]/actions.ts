'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/domain/forms';
import { callPublic, clientIpHash, isWellFormedToken, sha256 } from '@/lib/booking/server';

// Customer actions on their own status link. The token is the only credential; the database
// finds the request by its hash and applies the business's rules (cutoffs, states).
type Action = 'withdraw_request' | 'cancel_appointment' | 'accept_proposal' | 'decline_proposal';

const MESSAGES: Record<Action, string> = {
  withdraw_request: 'Request withdrawn.',
  cancel_appointment: 'Appointment cancelled.',
  accept_proposal: 'Time accepted.',
  decline_proposal: 'Suggested time declined.',
};

async function act(action: Action, token: string): Promise<FormState> {
  if (!isWellFormedToken(token)) return { status: 'error', message: 'This link isn’t valid.' };
  const result = await callPublic<{ status: string }>(action, [sha256(token), await clientIpHash()]);
  revalidatePath(`/r/${token}`);
  if (!result.ok) {
    return {
      status: 'error',
      message:
        result.error.code === 'DH005'
          ? 'Too many attempts from this connection. Please wait a few minutes.'
          : result.error.code === 'DH002'
            ? `That can’t be done online any more (${result.error.message}). Please call or text the business.`
            : 'This link isn’t valid.',
    };
  }
  if (action === 'accept_proposal' && result.data.status !== 'approved')
    return { status: 'error', message: 'That time is no longer available. The business will follow up with you.' };
  return { status: 'success', message: MESSAGES[action] };
}

export async function withdrawRequest(token: string) {
  return act('withdraw_request', token);
}
export async function cancelAppointment(token: string) {
  return act('cancel_appointment', token);
}
export async function acceptProposal(token: string) {
  return act('accept_proposal', token);
}
export async function declineProposal(token: string) {
  return act('decline_proposal', token);
}
