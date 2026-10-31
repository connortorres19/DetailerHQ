'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle, type FormState } from '@/domain/forms';
import { acceptQuote, declineQuote } from './actions';
import styles from './q.module.css';

// Accept is one clear step; declining asks first. The server decides whether the quote can still
// be answered (status, expiry) and records the answer once.
export function QuoteAnswer({ token, business }: { token: string; business: string }) {
  const [acceptState, accept] = useActionState(async (): Promise<FormState> => acceptQuote(token), idle);
  const [declineState, decline] = useActionState(async (): Promise<FormState> => declineQuote(token), idle);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const error = [acceptState, declineState].find((s) => s.status === 'error');
  return (
    <section className={styles.answer} aria-label="Your answer">
      {error ? <Notice tone="critical">{error.message}</Notice> : null}
      <p>Accepting tells {business} you’d like to go ahead. They’ll contact you to confirm the time. No payment is taken online.</p>
      <div className={styles.buttons}>
        <form action={accept}>
          <SubmitButton pendingLabel="Accepting…">Accept quote</SubmitButton>
        </form>
        {confirmDecline ? (
          <form action={decline} className={styles.confirm} role="group" aria-label="Decline quote">
            <p>Decline this quote?</p>
            <div className={styles.buttons}>
              <Button type="button" variant="ghost" onClick={() => setConfirmDecline(false)}>
                Keep it
              </Button>
              <SubmitButton variant="danger" pendingLabel="Declining…">
                Decline quote
              </SubmitButton>
            </div>
          </form>
        ) : (
          <Button type="button" onClick={() => setConfirmDecline(true)}>
            Decline
          </Button>
        )}
      </div>
    </section>
  );
}
