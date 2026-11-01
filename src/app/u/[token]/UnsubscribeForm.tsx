'use client';

import { useActionState } from 'react';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { unsubscribe } from './actions';

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useActionState(unsubscribe.bind(null, token), idle);
  if (state.status === 'success') return <Notice tone="positive">{state.message}</Notice>;
  return (
    <form action={action}>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <SubmitButton pendingLabel="Saving…">Unsubscribe</SubmitButton>
    </form>
  );
}
