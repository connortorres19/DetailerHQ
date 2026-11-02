import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Container } from '@/components/ui/Container';
import { DATA_TERMS, FOUNDING_TERMS, foundingSummary, STANDARD_TERMS, TRIAL_DAYS, type Availability } from '@/domain/billing';
import { callPublic } from '@/lib/booking/server';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Founding 5: $30 once for lifetime access (five businesses only). Standard: $30/month with a ${TRIAL_DAYS}-day free trial.`,
};
// The founding count comes from the database on every request — never a cached or made-up number.
export const dynamic = 'force-dynamic';

async function availability(): Promise<Availability | null> {
  try {
    const r = await callPublic<Availability>('founding_availability', []);
    return r.ok ? r.data : null;
  } catch {
    return null;
  }
}

const FAQ = [
  { q: 'What does DetailerHQ charge for?', a: 'Access to the software for your detailing business. DetailerHQ doesn’t process payments between you and your customers and takes nothing from your jobs.' },
  { q: 'Is a card needed for the free trial?', a: `Yes. You add a card when you start the ${TRIAL_DAYS}-day trial, and nothing is charged during it. Stripe’s checkout shows the exact date the trial ends and the date of your first $30 charge before you confirm.` },
  { q: 'How do I cancel?', a: 'In Settings → Billing → Manage billing, any time. Cancel before the trial ends and you’re never charged. After that, you keep full access until the end of the month you paid for.' },
  { q: 'What happens if a payment fails or my card expires?', a: 'Stripe retries the card and emails you. You keep full access for 7 days while you update the card; after that your account is read-only until the payment goes through. Nothing is deleted.' },
  { q: 'What happens to my data if I stop paying?', a: DATA_TERMS },
  { q: 'What makes Founding 5 different?', a: 'It’s a single $30 payment for lifetime access, for the first five businesses only. Founding members are never charged again. Once five spots are claimed the offer is closed for good.' },
];

export default async function PricingPage() {
  const founding = foundingSummary(await availability());
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Container>
          <header className={styles.head}>
            <p className={styles.overline}>Pricing</p>
            <h1 className={styles.title}>One price. Every feature.</h1>
            <p className={styles.intro}>$30 — either once, for the first five businesses, or monthly after a {TRIAL_DAYS}-day free trial. No add-ons, no per-booking fees.</p>
          </header>

          <div className={styles.plans}>
            <section className={styles.plan} aria-labelledby="founding">
              <p className={styles.flag} data-available={founding.available}>
                {founding.label}
              </p>
              <h2 id="founding" className={styles.name}>
                Founding 5 — lifetime
              </h2>
              <p className={styles.price}>
                <span className={styles.amount}>$30</span>
                <span className={styles.period}>one-time payment</span>
              </p>
              <ul className={styles.terms}>
                {FOUNDING_TERMS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {founding.note ? <p className={styles.note}>{founding.note}</p> : null}
            </section>

            <section className={styles.plan} aria-labelledby="standard">
              <p className={styles.flag}>{TRIAL_DAYS}-day free trial · card required</p>
              <h2 id="standard" className={styles.name}>
                Standard
              </h2>
              <p className={styles.price}>
                <span className={styles.amount}>$30</span>
                <span className={styles.period}>per month after the trial</span>
              </p>
              <ul className={styles.terms}>
                {STANDARD_TERMS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          </div>

          <p className={styles.how}>
            Early access is invite-only for now. Invited businesses choose a plan after signing in, under <strong>Settings → Billing</strong>. Payments are handled by Stripe;
            DetailerHQ never sees your card number. <Link href="/sign-in">Sign in</Link>
          </p>

          <section aria-labelledby="faq" className={styles.faq}>
            <h2 id="faq" className={styles.faqTitle}>
              Billing questions
            </h2>
            <dl>
              {FAQ.map((f) => (
                <div key={f.q} className={styles.qa}>
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
