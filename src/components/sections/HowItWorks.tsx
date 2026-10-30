import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { InterfaceFrame } from '@/components/ui/InterfaceFrame';
import { BookingPagePreview } from '@/components/previews/BookingPagePreview';
import s from './section.module.css';
import styles from './HowItWorks.module.css';

const steps = [
  {
    title: 'Set up your services and hours',
    body: 'Add what you offer, prices by vehicle size, how long each job takes, your working hours and the buffer you need between jobs.',
  },
  {
    title: 'Share your booking link',
    body: 'Put it in your Instagram bio, your Google profile or a text. Customers choose a service, add their vehicle and pick a time that actually fits.',
  },
  {
    title: 'Decide on each request',
    body: 'Approve it, hold the time while you confirm details, suggest another time or decline. Nothing lands on your calendar without you.',
  },
  {
    title: 'Customers see where they stand',
    body: 'Every request has its own status link with the next step. After the job, a reminder tells you when it’s time to follow up.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className={`${s.section} ${s.surface}`} aria-labelledby="how-title">
      <Container>
        <div className={styles.layout}>
          <div>
            <SectionHeading
              id="how-title"
              overline="How it works"
              title="From a link in your bio to a job on the calendar."
            />
            <ol className={styles.steps} role="list">
              {steps.map((step, i) => (
                <li key={step.title} className={styles.step}>
                  <span className={`${styles.number} tabular`} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className={styles.title}>{step.title}</h3>
                    <p className={styles.body}>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.device}>
            <InterfaceFrame title="Booking page" device="phone">
              <BookingPagePreview />
            </InterfaceFrame>
          </div>
        </div>
      </Container>
    </section>
  );
}
