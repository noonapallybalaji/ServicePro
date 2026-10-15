import { Button, Container, Heading, Text } from '@servicepro/ui';
import { CalendarClock, CreditCard, LifeBuoy, ShieldAlert, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { PageHero } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { usePageMeta } from '../seo/head';
import { PAGES } from '../seo/pages';
import { SITE } from '../site';

/*
 * Help centre (gap analysis 10.5): self-help by topic, then a help request with the topic
 * already chosen. Answers describe how the service actually works; where an owner setting can
 * change it, they say so ("if the button is there").
 */

interface Topic {
  id: string;
  /** Help request category (account Help tab). */
  category: string;
  title: string;
  icon: ReactNode;
  answers: { q: string; a: ReactNode }[];
}

const TOPICS: Topic[] = [
  {
    id: 'booking',
    category: 'BOOKING',
    title: 'Booking and visit times',
    icon: <CalendarClock aria-hidden />,
    answers: [
      {
        q: 'Which times can I choose?',
        a: 'The booking form shows the visit windows we offer for the next few days; a time we are already full for is greyed out. The office confirms the exact time on WhatsApp.',
      },
      {
        q: 'How do I change the time or cancel?',
        a: (
          <>
            Open the booking in <Link className="link" to="/account">My bookings</Link> and use <strong>Change time</strong> or <strong>Cancel booking</strong>. They are
            there until the technician sets out. If they aren't, contact us.
          </>
        ),
      },
      {
        q: "I'm booking for my parents. Who will the technician call?",
        a: 'Tick “Someone else will be at home” when booking and add their name and number. The technician calls them; updates still come to you.',
      },
      {
        q: 'How does the technician find the house?',
        a: 'Add a landmark and “Directions for the technician” (gate code, floor, parking) when booking. Sharing your location is optional.',
      },
    ],
  },
  {
    id: 'visit',
    category: 'LATE_TECHNICIAN',
    title: 'The technician and the visit',
    icon: <Wrench aria-hidden />,
    answers: [
      {
        q: 'How do I know who is coming?',
        a: 'Once a technician is assigned, your tracking page shows their name and updates as they set out and arrive.',
      },
      {
        q: 'Will I be charged more than the visiting charge?',
        a: 'Only if you agree. When a repair costs extra, the technician sends you an estimate; nothing extra is done until you approve it with a code sent to your phone. If you decline, only the visiting charge applies.',
      },
      {
        q: 'What is the completion code?',
        a: 'A code we send you when the technician arrives. Share it only when you are happy the work is done: it confirms the job is complete.',
      },
    ],
  },
  {
    id: 'payment',
    category: 'PAYMENT',
    title: 'Payments and bills',
    icon: <CreditCard aria-hidden />,
    answers: [
      { q: 'When do I pay?', a: 'After the visit. You can pay the technician by UPI or cash, or online if a “Pay online” button is shown on your tracking page.' },
      {
        q: 'Where is my bill?',
        a: (
          <>
            On your tracking page, and under Profile &gt; My bills in <Link className="link" to="/account?tab=profile">My bookings</Link>, as a PDF.
          </>
        ),
      },
      {
        q: 'How do refunds work?',
        a: (
          <>
            See our <Link className="link" to="/cancellation-and-refunds">cancellation and refund policy</Link>. If you think you were charged wrongly, ask us below.
          </>
        ),
      },
    ],
  },
  {
    id: 'warranty',
    category: 'REPAIR_QUALITY',
    title: 'Warranty and repeat problems',
    icon: <ShieldCheck aria-hidden />,
    answers: [
      {
        q: 'Is my repair under warranty?',
        a: 'If it is, the booking in My bookings shows a warranty card with the end date and what it covers.',
      },
      {
        q: 'The problem came back. What do I do?',
        a: 'While the warranty lasts, open the booking and choose “Problem came back?”: pick a time and we send a technician at no visiting charge. Otherwise, ask us below.',
      },
    ],
  },
  {
    id: 'account',
    category: 'OTHER',
    title: 'Your account and privacy',
    icon: <UserRound aria-hidden />,
    answers: [
      { q: 'How do I sign in?', a: 'With your mobile number: we send you a one-time code. There is no password.' },
      {
        q: 'Can I see or delete my data?',
        a: (
          <>
            Yes. In My bookings &gt; Profile, choose “Download my data” or “Delete my account”. See our <Link className="link" to="/privacy">privacy policy</Link>.
          </>
        ),
      },
    ],
  },
  {
    id: 'damage',
    category: 'DAMAGE_OR_SAFETY',
    title: 'Damage or a safety concern',
    icon: <ShieldAlert aria-hidden />,
    answers: [
      {
        q: 'Something was damaged during the visit.',
        a: 'Tell us as soon as you can, with photos. Damage and safety reports are answered first.',
      },
      {
        q: 'Is anyone in danger?',
        a: SITE.phone ? `Call us now on ${SITE.phone}, and the emergency services if needed.` : 'Contact the emergency services if needed, then tell us.',
      },
    ],
  },
];

export function HelpPage() {
  usePageMeta(PAGES.help);
  return (
    <SiteLayout>
      <PageHero crumbs={PAGES.help.crumbs} title="Help centre" intro="Answers to common questions. Still stuck? Ask us and we'll reply here and on WhatsApp." />
      <Container className="flex flex-col gap-10 py-10 md:py-14">
        <nav aria-label="Help topics">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {TOPICS.map((topic) => (
              <li key={topic.id}>
                <a
                  href={`#${topic.id}`}
                  className="pressable transition-interactive flex h-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-sm font-semibold text-foreground hover:border-border-strong [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary"
                >
                  {topic.icon}
                  {topic.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {TOPICS.map((topic) => (
          <section key={topic.id} id={topic.id} aria-labelledby={`${topic.id}-title`} className="flex max-w-sheet scroll-mt-24 flex-col gap-4">
            <Heading level={2} id={`${topic.id}-title`}>
              {topic.title}
            </Heading>
            <dl className="flex flex-col gap-4">
              {topic.answers.map((item) => (
                <div key={item.q} className="flex flex-col gap-1">
                  <dt className="text-body font-semibold text-foreground">{item.q}</dt>
                  <dd className="text-body text-foreground-secondary">{item.a}</dd>
                </div>
              ))}
            </dl>
            <Button asChild variant="outline" className="self-start">
              <Link to={`/account?tab=help&topic=${topic.category}`}>
                <LifeBuoy aria-hidden /> Still need help? Ask us
              </Link>
            </Button>
          </section>
        ))}

        <Text variant="sm" tone="muted">
          More general questions are in our <Link className="link" to="/faq">FAQ</Link>.
        </Text>
      </Container>
    </SiteLayout>
  );
}
