'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/app/ui/Button';
import { ACCEPTED_TYPES, IMAGE_SPECS, MAX_UPLOAD_BYTES, mediaUrl, type MediaKind } from '@/domain/branding';
import styles from './ImageField.module.css';

export type UploadedImage = { id: string; width: number; height: number };
type UploadResult = { ok: true; id: string; width: number; height: number } | { ok: false; message: string };

// Sends one image to /app/media/upload with progress (XHR: fetch can't report upload progress).
export function uploadImage(file: File, kind: MediaKind, serviceId: string | undefined, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const body = new FormData();
    body.set('file', file);
    body.set('kind', kind);
    if (serviceId) body.set('serviceId', serviceId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/app/media/upload');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const r = xhr.response as UploadResult | null;
      if (r && typeof r === 'object' && 'ok' in r) resolve(r);
      else resolve({ ok: false, message: xhr.status === 401 ? 'Your session ended. Sign in again.' : 'The upload failed. Try again.' });
    };
    xhr.onerror = () => resolve({ ok: false, message: 'The upload failed — check your connection and try again.' });
    xhr.send(body);
  });
}

/** Checks done in the browser before sending (the server checks again, and decodes the image). */
export function precheck(file: File): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG or WebP image.';
  if (file.size > MAX_UPLOAD_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`;
  return null;
}

// One image slot (logo, cover, service photo): upload, replace, remove — with a preview and a
// progress bar. Uploads are saved to the draft straight away; removing is part of the next save.
export function ImageField({
  kind,
  label,
  value,
  onChange,
  serviceId,
  confirmRemove = false,
  compact = false,
}: {
  kind: MediaKind;
  label: string;
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  serviceId?: string;
  confirmRemove?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const spec = IMAGE_SPECS[kind];

  useEffect(() => () => void (local && URL.revokeObjectURL(local)), [local]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const problem = precheck(file);
    if (problem) return setError(problem);
    setLocal(URL.createObjectURL(file));
    setProgress(0);
    const result = await uploadImage(file, kind, serviceId, setProgress);
    setProgress(null);
    setLocal(null);
    if (input.current) input.current.value = '';
    if (!result.ok) return setError(result.message);
    onChange({ id: result.id, width: result.width, height: result.height });
  }

  const shown = local ?? (value ? mediaUrl(value.id) : null);
  const busy = progress !== null;
  return (
    <div className={`${styles.field} ${compact ? styles.compact : ''}`} data-kind={kind}>
      <div className={styles.labelRow}>
        <span className={styles.label} id={`${id}-label`}>
          {label}
        </span>
        {!compact ? <span className={styles.hint}>{spec.hint} JPEG, PNG or WebP, up to 10 MB.</span> : null}
      </div>
      <div className={styles.body}>
        <div className={styles.preview} data-empty={!shown}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: preview or same-origin WebP
            <img src={shown} alt={`${label} preview`} />
          ) : (
            <ImagePlus size={20} strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
        <div className={styles.controls}>
          <input
            ref={input}
            id={`${id}-file`}
            className="visually-hidden"
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            aria-labelledby={`${id}-label`}
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {busy ? (
            <div className={styles.progress}>
              <div role="progressbar" aria-labelledby={`${id}-label`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className={styles.bar}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.hint} aria-live="polite">
                {progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}
              </span>
            </div>
          ) : confirming ? (
            <div className={styles.confirm} role="group" aria-label={`Remove ${label.toLowerCase()}`}>
              <p>Remove the {label.toLowerCase()}? It stays on your live page until you publish.</p>
              <div className={styles.buttons}>
                <Button type="button" size="sm" variant="danger" onClick={() => (setConfirming(false), onChange(null))}>
                  Remove {label.toLowerCase()}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.buttons}>
              <Button type="button" size="sm" icon={value ? <RefreshCw size={14} aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />} onClick={() => input.current?.click()}>
                {value ? 'Replace' : 'Upload'}
                <span className="visually-hidden"> {label.toLowerCase()}</span>
              </Button>
              {value ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  onClick={() => (confirmRemove ? setConfirming(true) : onChange(null))}
                >
                  Remove<span className="visually-hidden"> {label.toLowerCase()}</span>
                </Button>
              ) : null}
            </div>
          )}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
