import { formatPhone } from '@/domain/business';
import { formatCents } from '@/domain/service';
import styles from './quote.module.css';

// A quote as the customer sees it — the public /q/[token] page and the owner's preview render the
// same component from the same allow-listed fields (never internal notes or follow-ups).
export type QuoteDoc = {
  number: number;
  business: { name: string; phone: string | null; timezone: string };
  customerFirstName: string | null;
  vehicle: string | null;
  items: { name: string; description: string | null; quantity: number; price_cents: number }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  proposedStart: string | null;
  sentAt: string | null;
};

export function QuoteDocument({ q }: { q: QuoteDoc }) {
  const day = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
  const when = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: q.business.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
  return (
    <article className={styles.doc} aria-label={`Quote #${q.number}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.business}>{q.business.name}</p>
          {q.business.phone ? (
            <p className={styles.muted}>
              <a href={`tel:${q.business.phone}`}>{formatPhone(q.business.phone)}</a> · <a href={`sms:${q.business.phone}`}>Text</a>
            </p>
          ) : null}
        </div>
        <div className={styles.meta}>
          <p className={styles.label}>Quote</p>
          <p className={styles.mono}>#{q.number}</p>
          {q.sentAt ? <p className={styles.muted}>{day(q.sentAt.slice(0, 10))}</p> : null}
        </div>
      </header>

      <dl className={styles.facts}>
        {q.customerFirstName ? (
          <>
            <dt>Prepared for</dt>
            <dd>{q.customerFirstName}</dd>
          </>
        ) : null}
        {q.vehicle ? (
          <>
            <dt>Vehicle</dt>
            <dd>{q.vehicle}</dd>
          </>
        ) : null}
        {q.proposedStart ? (
          <>
            <dt>Proposed time</dt>
            <dd>{when(q.proposedStart)}</dd>
          </>
        ) : null}
        {q.validUntil ? (
          <>
            <dt>Valid until</dt>
            <dd>{day(q.validUntil)}</dd>
          </>
        ) : null}
      </dl>

      {q.notes ? (
        <section className={styles.block}>
          <h2>The work</h2>
          <p className={styles.preline}>{q.notes}</p>
        </section>
      ) : null}

      <table className={styles.lines}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className={styles.num}>
              Qty
            </th>
            <th scope="col" className={styles.num}>
              Price
            </th>
            <th scope="col" className={styles.num}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((i, n) => (
            <tr key={`${i.name}-${n}`}>
              <th scope="row">
                {i.name}
                {i.description ? <span className={styles.desc}>{i.description}</span> : null}
              </th>
              <td className={styles.num}>{i.quantity}</td>
              <td className={styles.num}>{formatCents(i.price_cents)}</td>
              <td className={styles.num}>{formatCents(i.price_cents * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Subtotal
            </th>
            <td className={styles.num}>{formatCents(q.subtotalCents)}</td>
          </tr>
          {q.discountCents ? (
            <tr>
              <th scope="row" colSpan={3}>
                Discount
              </th>
              <td className={styles.num}>−{formatCents(q.discountCents)}</td>
            </tr>
          ) : null}
          <tr className={styles.total}>
            <th scope="row" colSpan={3}>
              Total
            </th>
            <td className={styles.num}>{formatCents(q.totalCents)}</td>
          </tr>
        </tfoot>
      </table>

      {q.terms ? (
        <section className={styles.block}>
          <h2>Terms</h2>
          <p className={styles.preline}>{q.terms}</p>
        </section>
      ) : null}
      <p className={styles.muted}>No payment is taken online. Prices are in US dollars.</p>
    </article>
  );
}
