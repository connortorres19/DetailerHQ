import { Check } from 'lucide-react';
import b from './BookingPagePreview.module.css';

// The detailer's own booking page on a phone — their brand first, ours only in the footer.
const times = ['8:00 AM', '9:00 AM', '1:00 PM', '2:00 PM'];

export function BookingPagePreview() {
  return (
    <div className={b.page}>
      <div className={b.header}>
        <div className={b.business}>Northside Detail Co.</div>
        <div className={b.meta}>Mobile detailing · North Austin & Round Rock</div>
      </div>

      <div className={b.step}>Step 4 of 6 · Time</div>
      <div className={b.question}>When works for you?</div>
      <div className={b.tz}>Times are in Central Time (CT)</div>

      <div className={b.days} aria-hidden="true">
        {[
          ['Thu', '5', false],
          ['Fri', '6', false],
          ['Sat', '7', true],
          ['Mon', '9', false],
        ].map(([d, n, active]) => (
          <span key={String(n)} className={active ? b.dayActive : b.day}>
            <span>{d}</span>
            <strong>{n}</strong>
          </span>
        ))}
      </div>

      <div className={b.times}>
        {times.map((t) => (
          <span key={t} className={t === '9:00 AM' ? b.timeActive : b.time}>
            {t === '9:00 AM' ? <Check size={12} strokeWidth={2} aria-hidden="true" /> : null}
            {t}
          </span>
        ))}
      </div>

      <div className={b.summary}>
        <div>
          Full detail · Large SUV
          <span className={b.summaryMeta}>From $350 · about 4h 30m</span>
        </div>
      </div>
      <div className={b.cta}>Continue</div>
      <div className={b.footer}>No account needed · Powered by DetailerHQ</div>
    </div>
  );
}
