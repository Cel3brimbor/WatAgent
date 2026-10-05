//TODO: replace with a monitored address before launch, and have the text reviewed by a lawyer.
export const PRIVACY_CONTACT_EMAIL = "privacy@example.com";
export const PRIVACY_UPDATED = "October 4, 2026";

export function PrivacyPolicy() {
  return (
    <main className="legal-shell">
      <article className="legal-doc">
        <a className="legal-back" href="/login/">
          ← Back to sign in
        </a>
        <p className="login-mark">WatAgent</p>
        <h1>Privacy Policy</h1>
        <p className="legal-meta">Last updated {PRIVACY_UPDATED}</p>

        <p>
          WatAgent is a calendar with an AI planning assistant. This policy explains what we collect, why, who
          we share it with, and the choices you have.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account:</strong> your name, email address and profile picture from Google when you sign in.
          </li>
          <li>
            <strong>Calendar content:</strong> events, calendars and subscriptions you create, import from an
            .ics link, or sync from Google Calendar, plus your appearance and calendar preferences.
          </li>
          <li>
            <strong>Assistant data:</strong> your chat messages, saved chats, rules you set up, and the changes
            the assistant proposes.
          </li>
          <li>
            <strong>Google Calendar access:</strong> if you connect it, a Google token that lets us read and
            update your calendars. We store it encrypted.
          </li>
          <li>
            <strong>Usage and logs:</strong> daily request counts per account, and technical logs such as IP
            address, used for security, abuse prevention and rate limiting.
          </li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To sign you in, show your calendar, and run the assistant.</li>
          <li>To keep the service secure, enforce limits, and investigate abuse.</li>
          <li>To fix bugs and decide what to improve.</li>
        </ul>
        <p>We do not sell your personal information or use it for advertising.</p>

        <h2>Who processes it</h2>
        <p>We rely on these providers to run WatAgent:</p>
        <ul>
          <li>
            <strong>Google</strong> for sign-in and, if you connect it, Google Calendar and Places search.
          </li>
          <li>
            <strong>Supabase</strong> for authentication and database hosting.
          </li>
          <li>
            <strong>AI model providers</strong> (OpenRouter and, as a fallback, Groq). When you use the
            assistant, your message and the calendar details needed to answer it are sent to them to generate a
            reply.
          </li>
        </ul>
        <p>
          Assistant replies can be wrong. Review proposed changes before you accept them. Do not put
          information in chats or events that you would not want processed by these providers.
        </p>

        <h2>Cookies and device storage</h2>
        <p>
          We use one essential, HttpOnly cookie to keep you signed in, and short-lived cookies during sign-in. On
          iOS the sign-in token is kept in the system keychain. We do not use advertising or cross-site tracking
          cookies.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          We keep your data while your account is active. Email {PRIVACY_CONTACT_EMAIL} to ask us to delete your
          account and its data. You can also revoke WatAgent&apos;s access at any time in your Google Account
          under Security → Third-party access.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask to access, correct, export or delete your information by emailing us. Depending on where
          you live, you may have additional rights under local law.
        </p>

        <h2>Security</h2>
        <p>
          Data is transmitted over HTTPS, Google tokens are encrypted at rest, and access to each account&apos;s
          data is restricted to that account. No system is perfectly secure, so we cannot guarantee absolute
          security.
        </p>

        <h2>Children</h2>
        <p>WatAgent is not directed to children under 13, and we do not knowingly collect their information.</p>

        <h2>Changes</h2>
        <p>
          If we change this policy we will update the date above and, for significant changes, tell you in the
          app.
        </p>

        <h2>Contact</h2>
        <p>
          Questions: <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
        </p>
      </article>
    </main>
  );
}
