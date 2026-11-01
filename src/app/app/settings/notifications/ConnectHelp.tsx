import { ExternalLink } from 'lucide-react';
import styles from './notifications.module.css';

// "How to Connect Your Business Email" — plain-language steps for each kind of provider.
// Each section is a native <details> so it opens and closes with a keyboard or screen reader.

const GOOGLE_HELP = 'https://support.google.com/accounts/answer/185833';
const MICROSOFT_HELP = 'https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission';

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.outLink}>
      {children}
      <ExternalLink size={13} aria-hidden="true" />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function Settings({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className={styles.settingsList}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConnectHelp() {
  return (
    <div className={styles.help}>
      <p>
        Connect the email address you already use for your detailing business. DetailerHQ will use this account to automatically send booking confirmations, appointment
        reminders, quote emails, and other customer notifications.
      </p>
      <p>You’ll need your email provider’s SMTP settings and an app password or approved SMTP credential. Your normal email password may not work.</p>

      <details className={styles.helpItem}>
        <summary>Gmail or Google Workspace</summary>
        <ol className={styles.steps}>
          <li>Turn on 2-Step Verification for your Google account (Google Account → Security → 2-Step Verification).</li>
          <li>Go to Google Account → Security → App passwords, if your account is eligible.</li>
          <li>Create an app password and name it “DetailerHQ”. Google shows a 16-character password once — copy it.</li>
          <li>
            Enter these settings in the form below:
            <Settings
              rows={[
                ['SMTP hostname', <code key="h">smtp.gmail.com</code>],
                ['Port', <code key="p">587</code>],
                ['Encryption', 'STARTTLS'],
                ['Username', 'Your full Gmail or Google Workspace email address'],
                ['Password', 'The app password you just created (not your normal Google password)'],
              ]}
            />
          </li>
        </ol>
        <p className={styles.muted}>
          App passwords aren’t available for every account. If you don’t see the option, your account may use only security keys, be in Google’s Advanced Protection Program, or
          be managed by an organization (Google Workspace) whose administrator has turned app passwords or SMTP off. Ask your administrator, or use another address.
        </p>
        <p className={styles.muted}>
          Sending limits: Google allows roughly 500 recipients a day for a free Gmail account and about 2,000 for Google Workspace.
        </p>
        <Out href={GOOGLE_HELP}>Google’s guide to app passwords</Out>
      </details>

      <details className={styles.helpItem}>
        <summary>Outlook or Microsoft 365</summary>
        <ul className={styles.steps}>
          <li>
            A Microsoft 365 mailbox can send through SMTP only if <strong>SMTP AUTH</strong> (SMTP sign-in) is turned on for it. Many organizations turn it off, and only a Microsoft
            365 administrator can turn it on.
          </li>
          <li>
            Get the SMTP hostname, port, encryption and sign-in method from your Microsoft account settings or your administrator. For Microsoft 365 they’re usually{' '}
            <code>smtp.office365.com</code>, port <code>587</code>, STARTTLS, with your full email address as the username.
          </li>
          <li>
            Your normal password may not work. Microsoft is retiring password sign-in for SMTP (“basic authentication”): it’s planned to be off by default for existing Microsoft 365
            organizations from the end of December 2026 — administrators can still turn it on for now — and removed later. If your account uses multi-factor sign-in, you may need
            an app password, or SMTP may not be allowed at all.
          </li>
          <li>Personal Outlook.com, Hotmail and Live addresses usually can’t connect this way, because Microsoft no longer accepts passwords for SMTP on those accounts.</li>
        </ul>
        <Out href={MICROSOFT_HELP}>Microsoft’s guide to SMTP AUTH</Out>
      </details>

      <details className={styles.helpItem}>
        <summary>Your own domain or another provider</summary>
        <p>
          Your email hosting company (the one you use for email on your own domain) publishes its SMTP settings. Search its help pages for “SMTP settings”, or ask its support team.
          You need:
        </p>
        <Settings
          rows={[
            ['SMTP hostname', 'Often smtp.yourdomain.com or mail.yourprovider.com'],
            ['Port', 'Usually 587 or 465'],
            ['Encryption', 'Port 587 usually uses STARTTLS; port 465 uses SSL/TLS'],
            ['Username', 'Usually your full email address'],
            ['Password', 'Your SMTP password, or an app-specific password if your provider uses them'],
          ]}
        />
        <p className={styles.muted}>So emails don’t land in spam, your provider should have SPF and DKIM set up for your domain — most do this for you.</p>
      </details>

      <details className={styles.helpItem}>
        <summary>Good to know</summary>
        <ul className={styles.steps}>
          <li>It’s free: emails go out through your own email account. No extra service is needed.</li>
          <li>
            Your provider’s sending limits apply. DetailerHQ sends at most 100 emails an hour and 300 a day for your business; over a limit, emails wait instead of failing.
          </li>
          <li>Replies come straight to your inbox. Some providers also keep a copy in your Sent folder.</li>
          <li>
            If you change your email password or delete the app password, automatic emails pause and this page shows “Needs attention”. Enter the new password to send them again.
          </li>
          <li>Your password is encrypted as soon as you save it and is never shown again — not even to you.</li>
        </ul>
      </details>
    </div>
  );
}
