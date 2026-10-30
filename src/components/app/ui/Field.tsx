import { CircleAlert } from 'lucide-react';
import styles from './Field.module.css';

type Base = { name: string; label: string; hint?: React.ReactNode; error?: string; className?: string };

// DESIGN_SYSTEM §13.2: label above, helper text under the label, error under the input.
function Frame({ id, label, hint, error, className, children }: Base & { id: string; children: React.ReactNode }) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: React.ReactNode, error?: string) =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

export function TextField({
  name,
  label,
  hint,
  error,
  className,
  ...input
}: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'>) {
  const id = input.id ?? `field-${name}`;
  return (
    <Frame id={id} name={name} label={label} hint={hint} error={error} className={className}>
      <input
        {...input}
        id={id}
        name={name}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Frame>
  );
}

export function SelectField({
  name,
  label,
  hint,
  error,
  className,
  options,
  ...select
}: Base & { options: { value: string; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name'>) {
  const id = select.id ?? `field-${name}`;
  return (
    <Frame id={id} name={name} label={label} hint={hint} error={error} className={className}>
      <select
        {...select}
        id={id}
        name={name}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Frame>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  error,
  className,
  ...textarea
}: Base & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>) {
  const id = textarea.id ?? `field-${name}`;
  return (
    <Frame id={id} name={name} label={label} hint={hint} error={error} className={className}>
      <textarea
        rows={4}
        {...textarea}
        id={id}
        name={name}
        className={`${styles.input} ${styles.textarea}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      />
    </Frame>
  );
}
