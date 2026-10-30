'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { requestPasswordReset, setPassword, signIn, signUp } from './actions';
import styles from './auth.module.css';

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, idle);
  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <TextField name="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <SubmitButton pendingLabel="Signing in…" className={styles.submit}>
        Sign in
      </SubmitButton>
      <p className={styles.aside}>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, idle);
  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <TextField name="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <TextField name="password" label="Password" hint="At least 10 characters." type="password" autoComplete="new-password" required error={state.fieldErrors?.password} />
      <SubmitButton pendingLabel="Creating account…" className={styles.submit}>
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, idle);
  if (state.status === 'success') return <Notice tone="positive">{state.message}</Notice>;
  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <TextField name="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <SubmitButton pendingLabel="Sending…" className={styles.submit}>
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm({ next, submitLabel }: { next: string; submitLabel: string }) {
  const [state, action] = useActionState(setPassword, idle);
  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <TextField name="password" label="New password" hint="At least 10 characters." type="password" autoComplete="new-password" required error={state.fieldErrors?.password} />
      <TextField name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirmPassword} />
      <SubmitButton pendingLabel="Saving…" className={styles.submit}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
