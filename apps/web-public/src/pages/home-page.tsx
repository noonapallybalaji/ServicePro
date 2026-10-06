import { Button, Container, Heading, HUE_CLASSES, ServiceCard, SpotArt, TechnicianScene, Text, cn } from '@servicepro/ui';
import { ArrowRight, PhoneCall } from 'lucide-react';
import { Link } from 'react-router';

import { BookActions, StepList } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { SERVICES, servicePath } from '../content/services';
import { PROMISES } from '../content/site-content';
import { usePageMeta } from '../seo/head';
import { PAGES } from '../seo/pages';
import { SITE, whatsappLink } from '../site';

export function HomePage() {
  usePageMeta(PAGES.home);

  return (
    <SiteLayout>
        <section data-surface="brand" className="surface-hero relative isolate overflow-hidden">
          <div aria-hidden className="bg-dots absolute inset-y-0 right-0 -z-10 w-1/2" />
          <Container className="grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2 lg:py-20">
            <div className="flex flex-col gap-6">
              <Text variant="overline" className="text-accent-border">
                Home appliance repair in {SITE.city}
              </Text>
              <Heading level={1} size="display">
                Your appliance, fixed at home — without the guesswork.
              </Heading>
              <Text variant="body-lg" tone="secondary">
                Doorstep repair for AC, fridge, washing machine, TV and microwave. You see the price before work starts and track the visit live.
              </Text>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <BookActions />
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
              <Text tone="secondary">Choose your appliance to see the problems we fix in {SITE.city}.</Text>
            </div>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
              {SERVICES.map((service) => (
                <li key={service.slug}>
                  <ServiceCard asChild categoryCode={service.code} title={service.title} description={service.summary}>
                    <Link to={servicePath(service)} />
                  </ServiceCard>
                </li>
              ))}
            </ul>
            <div className="flex justify-center">
              <Button asChild variant="outline">
                <Link to="/services">
                  All appliance repair services <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
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
            <StepList />
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
            {SITE.phone ? (
              <Button asChild size="lg">
                <a href={whatsappLink('Hi, please resend my tracking link.')} target="_blank" rel="noreferrer">
                  <PhoneCall aria-hidden /> Resend my link
                </a>
              </Button>
            ) : null}
          </div>
        </Container>
    </SiteLayout>
  );
}
