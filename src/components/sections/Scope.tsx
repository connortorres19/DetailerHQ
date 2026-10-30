import { Check, Minus } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import s from './section.module.css';
import styles from './Scope.module.css';

const included = [
  'Booking page and request status links',
  'Approvals, holds and suggested times',
  'Calendar with day, week and agenda views',
  'Customers and vehicles',
  'Leads and quotes',
  'Follow-up reminders and message templates',
  'Analytics from recorded jobs',
  'CSV export of your data',
];

const notYet = [
  'Automatic texts or emails to customers',
  'Online payments and deposits',
  'Calendar sync',
  'Social media integrations',
  'CSV import',
  'Staff accounts',
];

export function Scope() {
  return (
    <section className={`${s.section} ${s.canvas}`} aria-labelledby="scope-title">
      <Container>
        <SectionHeading
          id="scope-title"
          overline="Scope"
          title="What’s planned for the first version, and what isn’t."
          intro={<p>Plain lists, so you can decide whether it fits how you work before early access opens.</p>}
        />
        <div className={styles.columns}>
          <div>
            <h3 className={styles.heading}>Planned for the first version</h3>
            <ul className={styles.list} role="list">
              {included.map((item) => (
                <li key={item}>
                  <Check size={16} strokeWidth={1.5} aria-hidden="true" className={styles.yes} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={styles.heading}>Not available yet</h3>
            <ul className={styles.list} role="list">
              {notYet.map((item) => (
                <li key={item} className={styles.muted}>
                  <Minus size={16} strokeWidth={1.5} aria-hidden="true" className={styles.no} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
