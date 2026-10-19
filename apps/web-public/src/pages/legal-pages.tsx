import { Alert, Container } from '@servicepro/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { PageHero } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { usePageMeta } from '../seo/head';
import { PAGES } from '../seo/pages';
import { SITE } from '../site';

/*
 * Terms, privacy and cancellation/refund policies. The wording describes what this website and
 * our systems actually do; business facts (legal name, grievance officer, dates, refund time)
 * come from configuration and are never filled in for the business. Until they are all set,
 * every page says plainly that it is a draft (and is kept out of search results).
 */

const legal = SITE.legal;
const business = legal.entityName ?? SITE.name;

function effectiveDate(): string | undefined {
  if (!legal.effectiveDate) return undefined;
  const date = new Date(`${legal.effectiveDate}T00:00:00+05:30`);
  return Number.isNaN(date.getTime())
    ? legal.effectiveDate
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function LegalPage({ title, intro, crumbs, children }: { title: string; intro: string; crumbs?: { name: string; path: string }[]; children: ReactNode }) {
  const date = effectiveDate();
  return (
    <SiteLayout>
      <PageHero crumbs={crumbs} title={title} intro={intro} />
      <Container className="flex flex-col gap-8 py-10 md:py-14">
        {legal.ready ? null : (
          <Alert
            tone="warning"
            title="Draft: not yet published"
            description={`${SITE.name} hasn't finished this policy. Some details below are still to be added. Contact us if you have a question before then.`}
          />
        )}
        <article className="legal-prose flex max-w-sheet flex-col gap-8">
          {children}
          <p className="text-sm text-foreground-muted">{date ? `Effective from ${date}.` : 'Effective date not set yet.'}</p>
        </article>
      </Container>
    </SiteLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3 text-foreground">{title}</h2>
      <div className="flex flex-col gap-3 text-body text-foreground-secondary [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">{children}</div>
    </section>
  );
}

/** Contact lines: only what has been configured. */
function ContactLines() {
  return (
    <ul>
      {SITE.phone ? <li>Phone or WhatsApp: {SITE.phone}</li> : null}
      {SITE.email ? (
        <li>
          Email: <a className="link" href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </li>
      ) : null}
      <li>
        All the ways to reach us: <Link className="link" to="/contact">Contact us</Link>.
      </li>
    </ul>
  );
}

function GrievanceOfficer() {
  return legal.grievanceOfficer && legal.grievanceEmail ? (
    <p>
      Grievance Officer: {legal.grievanceOfficer},{' '}
      <a className="link" href={`mailto:${legal.grievanceEmail}`}>
        {legal.grievanceEmail}
      </a>
      .
    </p>
  ) : (
    <p>Grievance Officer: to be named before this policy is published.</p>
  );
}

/* ── /terms ─────────────────────────────────────────────────────────────── */

export function TermsPage() {
  usePageMeta(PAGES.terms);
  return (
    <LegalPage crumbs={PAGES.terms.crumbs} title="Terms of service" intro={`The terms for booking a repair with ${business}.`}>
      <Section title="Who we are">
        <p>
          {business} provides doorstep repair of home appliances in {SITE.city}. By booking a visit or signing in on this website, you agree to these terms and
          to our <Link className="link" to="/privacy">privacy policy</Link>.
        </p>
      </Section>
      <Section title="Booking a visit">
        <ul>
          <li>A booking is a request. We confirm it, and the visit time, by message or phone. The time you choose is a preference, not a guaranteed slot.</li>
          <li>We verify your mobile number with a one-time code. Give us correct contact details and an address where an adult can let the technician in.</li>
          <li>If we can't serve your area, we tell you and nothing is charged.</li>
        </ul>
      </Section>
      <Section title="Prices and payment">
        <ul>
          <li>Each appliance has a fixed visiting charge, shown before you confirm the booking.</li>
          <li>The technician explains any repair cost before starting work. Nothing beyond the visiting charge is done without your agreement.</li>
          <li>If the appliance can't be repaired, or you decide not to go ahead, only the visiting charge applies.</li>
          <li>You pay after the visit. You receive a bill for the job.</li>
        </ul>
      </Section>
      <Section title="Completing the job">
        <p>
          When you're happy with the work, share the completion code we send you with the technician. Don't share it before the work is done: it confirms that
          the job is complete.
        </p>
      </Section>
      <Section title="Cancelling or changing a booking">
        <p>
          See our <Link className="link" to="/cancellation-and-refunds">cancellation and refund policy</Link>.
        </p>
      </Section>
      <Section title="Your account">
        <p>
          Your account is your mobile number. You can see your bookings, update your details and saved addresses, or delete your account from{' '}
          <Link className="link" to="/account">My bookings</Link>.
        </p>
      </Section>
      <Section title="Changes to these terms">
        <p>If we change these terms, we update this page and its effective date. We ask you to agree again the next time you book or sign in.</p>
      </Section>
      <Section title="Contact">
        <ContactLines />
      </Section>
    </LegalPage>
  );
}

/* ── /privacy ───────────────────────────────────────────────────────────── */

export function PrivacyPage() {
  usePageMeta(PAGES.privacy);
  return (
    <LegalPage crumbs={PAGES.privacy.crumbs} title="Privacy policy" intro="What we collect when you book a repair, why, who sees it, and how to have it deleted.">
      <Section title="Who is responsible">
        <p>{business} decides how your personal data is used for repairs booked through this website, on WhatsApp or by phone.</p>
        <GrievanceOfficer />
      </Section>
      <Section title="What we collect">
        <ul>
          <li>Your name and mobile number, and your email address if you add one.</li>
          <li>The addresses you give us for visits.</li>
          <li>
            Your device's location, only if you tap "Detect my location" or "Use my current location". We use it to find your PIN code and to help the technician find you;
            you can type your PIN code and address instead.
          </li>
          <li>What needs repairing: the appliance, the problem you describe, and notes from the visit.</li>
          <li>Your bookings, bills and payments.</li>
          <li>Messages we send you about your bookings, and your messages to us on WhatsApp.</li>
          <li>Technical data needed to keep the service secure, such as your IP address when you request a sign-in code.</li>
        </ul>
      </Section>
      <Section title="Why we use it">
        <ul>
          <li>To arrange and carry out your repair, and keep you informed about it.</li>
          <li>To bill you and keep the records tax law requires.</li>
          <li>To prevent fraud and misuse, for example limiting how often codes can be requested.</li>
        </ul>
        <p>We don't sell your data, and we don't use it for advertising.</p>
      </Section>
      <Section title="Who sees it">
        <ul>
          <li>The technician assigned to your job sees your name, phone number, address and the problem, so they can do the visit.</li>
          <li>Our staff, to manage bookings and answer your questions.</li>
          <li>Service providers who work for us: hosting, and the companies that deliver our SMS and WhatsApp messages.</li>
          <li>When you tap "Detect my location", OpenStreetMap's address service receives that position (from our server, not your browser) so we can find your PIN code.</li>
          <li>If you message us on WhatsApp, an automated assistant run by an AI service provider reads your messages to help with your booking.</li>
          <li>Authorities, when the law requires it.</li>
        </ul>
      </Section>
      <Section title="Cookies and storage on your device">
        <ul>
          <li>One cookie keeps you signed in. It's needed for the site to work and isn't used for tracking.</li>
          <li>Addresses you book with are saved to your account so you can pick them next time. Manage or remove them under Saved addresses in My bookings.</li>
          <li>
            If you turn on notifications, your browser shows our booking updates on this device. We don't use them for advertising; turn them off any time in
            your browser's site settings.
          </li>
          <li>Your browser remembers the PIN code (and, if you used "Detect my location", the position) you chose, so we don't ask again. Change it any time from the top of the page.</li>
          <li>We don't use advertising or analytics cookies.</li>
        </ul>
      </Section>
      <Section title="How long we keep it">
        <p>
          We keep your details while you have an account with us. When you delete your account, we remove your name, phone number, email, street address,
          location and the text of messages we sent you. We keep bills and payment records for as long as tax law requires, and the record that a job took
          place (without details that identify you).
        </p>
        <p>Messages you sent us on WhatsApp are kept in our WhatsApp account and aren't deleted automatically. Ask us and we'll delete them.</p>
      </Section>
      <Section title="Your rights">
        <ul>
          <li>
            <strong className="text-foreground">See your data:</strong> your bookings, details and addresses are in{' '}
            <Link className="link" to="/account">My bookings</Link>. For a full copy of what we hold, contact us (see below) and we'll send it.
          </li>
          <li>
            <strong className="text-foreground">Correct it:</strong> edit your name and email in Profile, or contact us to change anything else.
          </li>
          <li>
            <strong className="text-foreground">Delete it:</strong> choose "Delete my account" in Profile, or ask us. If you have a booking that isn't finished,
            we finish or cancel it first.
          </li>
          <li>
            <strong className="text-foreground">Withdraw consent</strong> at any time by deleting your account or contacting us.
          </li>
          <li>
            <strong className="text-foreground">Complain:</strong> contact our Grievance Officer. If you're not satisfied with the answer, you can complain to
            the Data Protection Board of India.
          </li>
        </ul>
      </Section>
      <Section title="Children">
        <p>Bookings must be made by adults (18 or over).</p>
      </Section>
      <Section title="Changes to this policy">
        <p>If we change this policy, we update this page and its effective date. We ask you to agree again the next time you book or sign in.</p>
      </Section>
      <Section title="Contact">
        <ContactLines />
      </Section>
    </LegalPage>
  );
}

/* ── /cancellation-and-refunds ──────────────────────────────────────────── */

export function RefundPolicyPage() {
  usePageMeta(PAGES.refunds);
  return (
    <LegalPage
      crumbs={PAGES.refunds.crumbs}
      title="Cancellation and refund policy"
      intro="How to cancel or change a booking, and how refunds work."
    >
      <Section title="Cancelling or changing a booking">
        <ul>
          <li>
            Until the technician sets out, you can cancel or move your visit yourself in <Link className="link" to="/account">My bookings</Link>. After that,
            or if you prefer, contact us by phone or WhatsApp with your request number (it starts with SR).
          </li>
          <li>If a cancellation charge applies, we tell you the amount before the cancellation is confirmed. You never pay a charge you weren't told about.</li>
          <li>If we have to cancel or can't make the visit, we tell you as soon as we know, and you pay nothing.</li>
        </ul>
      </Section>
      <Section title="Paying">
        <p>You pay after the visit, so in most cases there is nothing to refund when a booking is cancelled.</p>
      </Section>
      <Section title="Refunds">
        <ul>
          <li>If you were charged by mistake, or charged for work that wasn't done, contact us with your request number.</li>
          <li>
            Once we approve a refund, we send it to the way you paid
            {legal.refundWorkingDays ? ` within ${legal.refundWorkingDays} working days` : ' (refund time to be confirmed before this policy is published)'}.
            Your bank may take a little longer to show it.
          </li>
        </ul>
      </Section>
      <Section title="Contact">
        <ContactLines />
      </Section>
    </LegalPage>
  );
}
