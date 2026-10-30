import type { z } from 'zod';

// Result shape every form action returns to `useActionState`. Values are echoed back so a
// failed submit never clears what the owner typed (passwords are never echoed).
export type FormState = {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export const idle: FormState = { status: 'idle' };

const SECRET_FIELDS = new Set(['password', 'confirmPassword', 'currentPassword']);

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string' && !key.startsWith('$') && !SECRET_FIELDS.has(key)) values[key] = value;
  });
  return values;
}

export function invalid(error: z.ZodError, formData: FormData, message = 'Check the highlighted fields.'): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    fieldErrors[key] ??= issue.message;
  }
  return { status: 'error', message, fieldErrors, values: formValues(formData) };
}

export function failed(message: string, formData?: FormData, fieldErrors?: Record<string, string>): FormState {
  return { status: 'error', message, fieldErrors, values: formData ? formValues(formData) : undefined };
}
