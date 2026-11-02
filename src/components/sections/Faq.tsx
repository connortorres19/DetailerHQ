import { Plus } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { brand } from '@/config/brand';
import s from './section.module.css';
import styles from './Faq.module.css';

const faqs = [
  {
    q: `Can I use ${brand.name} today?`,
    a: 'Early access is invite-only for now. Invited businesses sign in and choose a plan under Settings → Billing — see Pricing for the plans.',
  },
  {
    q: 'Who is it for?',
    a: 'Independent detailers in the US — solo operators, mobile detailers and small shops with one or two bays. It isn’t built for multi-location chains or teams with staff scheduling.',
  },
  {
    q: 'Do my customers need an account or an app?',
    a: 'No. They use your booking page in any browser and get a private status link for their request.',
  },
  {
    q: 'Will it text or email my customers automatically?',
    a: 'Not in the first version. Message templates open in your own Messages or Mail app so you can send from your own number or address, then log that you sent it.',
  },
  {
    q: 'Does it take payments or deposits?',
    a: 'No. DetailerHQ never processes payments between you and your customers — no deposits, card payments or tax. You record what a job was paid when you complete it. (Your own DetailerHQ membership is billed through Stripe.)',
  },
  {
    q: 'Who owns my data?',
    a: 'You do. You’ll be able to export your customers, vehicles, jobs and quotes as CSV at any time.',
  },
  {
    q: `Is “${brand.name}” the final name?`,
    a: 'No. It’s a working name and may change before launch.',
  },
];

export function Faq() {
  return (
    <section id="faq" className={`${s.section} ${s.canvas}`} aria-labelledby="faq-title">
      <Container>
        <div className={styles.layout}>
          <SectionHeading id="faq-title" overline="FAQ" title="Practical questions, straight answers." />
          <div className={styles.list}>
            {faqs.map((item) => (
              <details key={item.q} className={styles.item} name="faq">
                <summary className={styles.question}>
                  <span>{item.q}</span>
                  <Plus size={18} strokeWidth={1.5} aria-hidden="true" className={styles.icon} />
                </summary>
                <p className={styles.answer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
