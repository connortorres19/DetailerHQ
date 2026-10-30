import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import s from './section.module.css';
import styles from './Features.module.css';

// Written as specifics, not slogans: each line describes behaviour that is in the MVP plan.
const features = [
  {
    title: 'Online booking',
    body: 'A booking page with your services, vehicle-size pricing and real availability. Customers send a request; you stay in control of what gets approved.',
    points: ['Times respect your hours, buffers and job length', 'No customer account or app required', 'A status link for every request'],
  },
  {
    title: 'Lead and quote management',
    body: 'Log inquiries from calls, texts and DMs in one list, then build a quote with line items and a valid-until date.',
    points: ['Leads from every channel in one place', 'Quotes with line items and expiry', 'See which quotes are waiting on a reply'],
  },
  {
    title: 'Customer and vehicle records',
    body: 'One profile per customer with every vehicle they own, notes that matter on the next visit, and a full service history.',
    points: ['Multiple vehicles per customer', 'Gate codes, paint notes, pet hair warnings', 'History by vehicle, not just by person'],
  },
  {
    title: 'Appointment scheduling',
    body: 'Day, week and agenda views. Approve, hold or suggest another time, and run two jobs at once if your shop has the bays for it.',
    points: ['Capacity for shops with more than one bay', 'Short holds while you confirm details', 'Double-booking is blocked, not just warned'],
  },
  {
    title: 'Follow-up reminders',
    body: 'Reminders for quotes, maintenance washes and check-ins, with templates that open in your own Messages or Mail app.',
    points: ['Due and overdue lists', 'Templates filled with names and vehicles', 'Nothing is sent without you'],
  },
  {
    title: 'Business analytics',
    body: 'Quoted value, booked job value and recorded revenue — kept separate and labelled, built only from jobs you’ve actually recorded.',
    points: ['Clear definitions on every number', 'Breakdowns by service and month', 'No percentage shown on too little data'],
  },
];

export function Features() {
  return (
    <section className={`${s.section} ${s.surface}`} aria-labelledby="features-title">
      <Container>
        <SectionHeading
          id="features-title"
          overline="What it’s being built to do"
          title="Six jobs, done properly."
          align="split"
          intro={<p>The first version is deliberately narrow. Each part is designed around how independent detailers actually take and run work.</p>}
        />
        <ol className={styles.list} role="list">
          {features.map((f, i) => (
            <li key={f.title} className={styles.item}>
              <span className={`${styles.index} tabular`} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className={styles.text}>
                <h3 className={styles.title}>{f.title}</h3>
                <p className={styles.body}>{f.body}</p>
              </div>
              <ul className={styles.points} role="list">
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
