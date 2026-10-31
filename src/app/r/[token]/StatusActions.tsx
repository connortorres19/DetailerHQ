'use client';

import { useActionState, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle, type FormState } from '@/domain/forms';
import { acceptProposal, cancelAppointment, declineProposal, withdrawRequest } from './actions';
import styles from './status.module.css';

type Kind = 'withdraw' | 'cancel' | 'proposal';

// Two-step customer actions: the first click explains the consequence, the second does it.
export function StatusActions({ token, kind, cutoff }: { token: string; kind: Kind; cutoff?: string }) {
  const run = (fn: (t: string) => Promise<FormState>) => async () => fn(token);
  const [withdrawState, withdraw] = useActionState(run(withdrawRequest), idle);
  const [cancelState, cancel] = useActionState(run(cancelAppointment), idle);
  const [acceptState, accept] = useActionState(run(acceptProposal), idle);
  const [declineState, decline] = useActionState(run(declineProposal), idle);
  const [confirming, setConfirming] = useState<null | 'withdraw' | 'cancel' | 'decline'>(null);
  const result = [withdrawState, cancelState, acceptState, declineState].find((s) => s.status !== 'idle');

  const confirm = (what: 'withdraw' | 'cancel' | 'decline', action: () => void, label: string, message: string) =>
    confirming === what ? (
      <form action={action} className={styles.confirm} role="group" aria-label={label}>
        <p>{message}</p>
        <div className={styles.buttons}>
          <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
            Keep it
          </Button>
          <SubmitButton variant="danger" pendingLabel="Working…">
            {label}
          </SubmitButton>
        </div>
      </form>
    ) : (
      <Button type="button" variant={what === 'decline' ? 'secondary' : 'danger'} onClick={() => setConfirming(what)}>
        {label}
      </Button>
    );

  return (
    <div className={styles.actions}>
      {result?.status === 'error' ? <Notice tone="critical">{result.message}</Notice> : null}
      {result?.status === 'success' ? <Notice tone="positive">{result.message}</Notice> : null}
      {kind === 'withdraw'
        ? confirm('withdraw', withdraw, 'Withdraw request', 'Withdraw this request? The business won’t confirm it, and you’ll need to send a new one to book.')
        : null}
      {kind === 'cancel'
        ? confirm('cancel', cancel, 'Cancel appointment', `Cancel this appointment? Online cancellation is available ${cutoff ?? 'until the cutoff'}.`)
        : null}
      {kind === 'proposal' ? (
        <div className={styles.buttons}>
          <form action={accept}>
            <SubmitButton pendingLabel="Accepting…">Accept this time</SubmitButton>
          </form>
          {confirm('decline', decline, 'Decline', 'Decline the suggested time? Your request will close and you can send a new one.')}
        </div>
      ) : null}
    </div>
  );
}

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      icon={<Copy size={16} strokeWidth={1.5} aria-hidden="true" />}
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href.replace(/\?.*$/, ''));
        setCopied(true);
      }}
    >
      {copied ? 'Link copied' : 'Copy link'}
    </Button>
  );
}
