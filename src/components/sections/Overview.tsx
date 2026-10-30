import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import s from './section.module.css';
import styles from './Overview.module.css';

const halves = [
  {
    label: 'Online booking',
    title: 'A booking page customers can actually finish.',
    body: 'Your services, your prices, your hours. Customers pick a service and vehicle, choose a time that genuinely fits your schedule, and send a request — no account, no app to install. Each request gets its own status link so nobody has to wonder whether they’re booked.',
  },
  {
    label: 'Business management',
    title: 'The back office behind every job.',
    body: 'Approve or reschedule requests, see the day at a glance, keep notes on every customer and vehicle, track quotes from first message to decision, and get reminded when it’s time to follow up. It’s built for a detailer between jobs, on a phone, in a driveway.',
  },
];

export function Overview() {
  return (
    <section className={`${s.section} ${s.canvas}`} aria-labelledby="overview-title">
      <Container>
        <SectionHeading
          id="overview-title"
          overline="Product overview"
          title="Booking on the front. A tidy business behind it."
          align="split"
          intro={
            <p>
              Most independent detailers juggle texts, DMs, a paper calendar and their memory. The aim is one place for all of it, with nothing you don’t need.
            </p>
          }
        />
        <div className={styles.grid}>
          {halves.map((h, i) => (
            <article key={h.label} className={styles.item}>
              <p className={styles.label}>
                <span className="tabular">{String(i + 1).padStart(2, '0')}</span> {h.label}
              </p>
              <h3 className={styles.title}>{h.title}</h3>
              <p className={styles.body}>{h.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
