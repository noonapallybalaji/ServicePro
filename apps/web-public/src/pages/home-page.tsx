import { Button, Container, Heading, HUE_CLASSES, ServiceCard, SpotArt, TechnicianScene, Text, cn, type Hue } from '@servicepro/ui';
import { BadgeIndianRupee, KeyRound, MapPinned, MessageCircle, Phone, PhoneCall, type LucideIcon } from 'lucide-react';

import { SUPPORT_PHONE, whatsappLink } from '../config';
import { SiteFooter, SiteHeader } from './site-header';

/** Appliances the business repairs (PLAN.md §7.5 seed catalogue). */
const SERVICES = [
  { code: 'AC', title: 'AC repair & service', description: 'Cooling, gas top-up, servicing, installation' },
  { code: 'FRIDGE', title: 'Refrigerator repair', description: 'Not cooling, noise, leaks, compressor' },
  { code: 'WASHER', title: 'Washing machine repair', description: 'Not spinning, draining, door, motor' },
  { code: 'TV', title: 'TV repair', description: 'No picture, no sound, panel and board faults' },
  { code: 'MICROWAVE', title: 'Microwave repair', description: 'Not heating, sparking, buttons, turntable' },
] as const;

/** Promises the product actually enforces — never marketing claims it can't back up. */
const PROMISES: { icon: LucideIcon; hue: Hue; title: string; text: string }[] = [
  { icon: BadgeIndianRupee, hue: 'orange', title: 'Price before work', text: 'You approve the estimate before any repair starts.' },
  { icon: MapPinned, hue: 'sky', title: 'Live tracking', text: 'See who is coming and when, from one WhatsApp link.' },
  { icon: KeyRound, hue: 'mint', title: 'Completion code', text: 'A job closes only when you share your code.' },
];

const STEPS: { title: string; text: string; hue: Hue }[] = [
  { title: 'Tell us what’s wrong', text: 'Call or WhatsApp us. We note the appliance, the problem and a time that suits you.', hue: 'violet' },
  { title: 'A technician visits', text: 'The best-matched technician checks your appliance and explains the cost first.', hue: 'sky' },
  { title: 'Pay after the repair', text: 'Share your completion code when you’re happy, then pay by UPI or cash.', hue: 'mint' },
];

export function HomePage() {
  const bookText = 'Hi, I need an appliance repaired.';

  return (
    <>
      <SiteHeader />
      <main id="main">
        <section data-surface="brand" className="surface-hero relative isolate overflow-hidden">
          <div aria-hidden className="bg-dots absolute inset-y-0 right-0 -z-10 w-1/2" />
          <Container className="grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2 lg:py-20">
            <div className="flex flex-col gap-6">
              <Text variant="overline" className="text-accent">
                Home appliance repair
              </Text>
              <Heading level={1} size="display">
                Your appliance, fixed at home — without the guesswork.
              </Heading>
              <Text variant="body-lg" tone="secondary">
                Doorstep repair for AC, fridge, washing machine, TV and microwave. You see the price before work starts and track the visit live.
              </Text>
              <div className="flex flex-col gap-3 sm:flex-row">
                {SUPPORT_PHONE ? (
                  <>
                    <Button asChild variant="accent" size="lg">
                      <a href={`tel:${SUPPORT_PHONE}`}>
                        <Phone aria-hidden /> Call to book
                      </a>
                    </Button>
                    <Button asChild variant="inverse" size="lg">
                      <a href={whatsappLink(bookText)} target="_blank" rel="noreferrer">
                        <MessageCircle aria-hidden /> WhatsApp us
                      </a>
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="accent" size="lg">
                    <a href="#services">See what we repair</a>
                  </Button>
                )}
              </div>
            </div>
            <div className="mx-auto w-full max-w-sheet [&>svg]:h-auto [&>svg]:w-full">
              <TechnicianScene />
            </div>
          </Container>
        </section>

        <Container className="relative z-10 -mt-8 md:-mt-10">
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PROMISES.map(({ icon: Icon, hue, title, text }) => (
              <li key={title} className="flex items-start gap-4 rounded-card border border-border bg-surface p-5 shadow-md">
                <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-control', HUE_CLASSES[hue].subtle)}>
                  <Icon aria-hidden className="size-6" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-body font-bold text-foreground">{title}</span>
                  <span className="text-sm text-foreground-secondary">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>

        <Container asChild>
          <section id="services" aria-labelledby="services-title" className="flex scroll-mt-20 flex-col gap-8 py-16 md:py-20">
            <div className="flex flex-col gap-2 text-center">
              <Text variant="overline" tone="brand">
                Services
              </Text>
              <Heading level={2} size="h1" id="services-title">
                What we repair
              </Heading>
              <Text tone="secondary">Tap a service to book it on WhatsApp.</Text>
            </div>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
              {SERVICES.map((service) => (
                <li key={service.code}>
                  {SUPPORT_PHONE ? (
                    <ServiceCard asChild categoryCode={service.code} title={service.title} description={service.description}>
                      <a href={whatsappLink(`Hi, I need ${service.title.toLowerCase()}.`)} target="_blank" rel="noreferrer" aria-label={`Book ${service.title} on WhatsApp`} />
                    </ServiceCard>
                  ) : (
                    <ServiceCard asChild categoryCode={service.code} title={service.title} description={service.description}>
                      <div />
                    </ServiceCard>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </Container>

        <section aria-labelledby="how-title" className="bg-surface py-16 md:py-20">
          <Container className="flex flex-col gap-10">
            <div className="flex flex-col gap-2 text-center">
              <Text variant="overline" tone="brand">
                How it works
              </Text>
              <Heading level={2} size="h1" id="how-title">
                Three simple steps
              </Heading>
            </div>
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-4 rounded-card bg-background p-6">
                  <span className={cn('flex size-12 items-center justify-center rounded-full text-h3 font-bold', HUE_CLASSES[step.hue].subtle)}>{index + 1}</span>
                  <span className="flex flex-col gap-2">
                    <span className="text-h3 text-foreground">{step.title}</span>
                    <span className="text-body text-foreground-secondary">{step.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <Container className="py-16 md:py-20">
          <div className="flex flex-col items-center gap-6 rounded-sheet border border-border bg-surface p-6 text-center md:flex-row md:p-10 md:text-left">
            <SpotArt kind="search" className="size-32" />
            <div className="flex flex-1 flex-col gap-2">
              <Heading level={2}>Already booked?</Heading>
              <Text tone="secondary">
                Open the tracking link from your WhatsApp message to see who's coming, when, and your bill once the job is done.
              </Text>
            </div>
            {SUPPORT_PHONE ? (
              <Button asChild size="lg">
                <a href={whatsappLink('Hi, please resend my tracking link.')} target="_blank" rel="noreferrer">
                  <PhoneCall aria-hidden /> Resend my link
                </a>
              </Button>
            ) : null}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
