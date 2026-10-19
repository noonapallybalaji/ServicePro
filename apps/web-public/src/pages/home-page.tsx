import { Button, CategoryTile, formatINR, Container, HUE_CLASSES, Heading, Skeleton, TechnicianScene, Text, cn } from '@servicepro/ui';
import { ArrowRight, ChevronRight, ListChecks, Wrench } from 'lucide-react';
import { useEffect, type MouseEvent } from 'react';
import { Link } from 'react-router';

import { ApplianceSearch, FALLBACK_APPLIANCES, useActiveCategories, useBookAppliance, type Appliance } from '../components/appliance-search';
import { StepList } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { useStartRequest } from '../components/mobile-action-bar';
import { SERVICES, servicePath } from '../content/services';
import { PROMISES } from '../content/site-content';
import { promptForLocationOnce } from '../location/service-location';
import { usePageMeta } from '../seo/head';
import { PAGES } from '../seo/pages';
import { SITE } from '../site';

/*
 * Mobile-first home (app-like): location, search, big appliance tiles and one clear action. The
 * appliance list comes from the live catalog; the pre-rendered page (and the moment before the
 * catalog arrives) uses the service pages' list so the HTML still links every service.
 */

export function HomePage() {
  usePageMeta(PAGES.home);
  const { categories, catalog } = useActiveCategories();
  const appliances: Appliance[] = categories.length > 0 ? categories.map((c) => ({ code: c.code, name: c.name, categoryId: c.id, visitCharge: c.baseVisitCharge })) : FALLBACK_APPLIANCES;
  const startRequest = useStartRequest();

  // Location first: ask new visitors once, as a dismissible sheet.
  useEffect(() => promptForLocationOnce(), []);

  return (
    <SiteLayout pinnedSearch>
      {/* Not overflow-hidden: the search results drop below the band. Only the decoration is clipped. */}
      <section data-surface="brand" className="surface-hero relative isolate z-10">
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="bg-dots absolute inset-y-0 right-0 w-1/2" />
        </div>
        {/* Phones and tablets: the promises scroll along the top of the hero. */}
        <PromiseTicker />
        <Container className="grid items-center gap-6 py-5 md:py-10 lg:grid-cols-2 lg:gap-10 lg:py-16">
          <div className="flex min-w-0 flex-col gap-3 md:gap-5">
            <Text variant="overline" className="text-accent-border">
              Home appliance repair in {SITE.city}
            </Text>
            <Heading level={1} className="text-h1 lg:text-display">
              Your appliance, fixed at home — without the guesswork.
            </Heading>
            {/* Phones: headline and search only, so the appliances show sooner (the text stays for search engines). */}
            <Text tone="secondary" className="max-md:hidden md:text-body-lg">
              Doorstep repair for AC, fridge, washing machine, TV and microwave. See the price before work starts and track the visit live.
            </Text>
            {/* Phones and tablets have it pinned under the header instead. */}
            <div className="max-lg:hidden">
              <ApplianceSearch />
            </div>
            {/* Below desktop the bottom bar has Request and Track, and the promises run in the strip below. */}
            <div className="flex flex-wrap gap-3 max-lg:hidden">
              <Button variant="accent" size="lg" onClick={startRequest}>
                <Wrench aria-hidden /> Request a repair
              </Button>
              <Button asChild variant="inverse" size="lg">
                <Link to="/account">
                  <ListChecks aria-hidden /> Track my request
                </Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-2 max-lg:hidden" aria-label="Why customers choose us">
              {PROMISES.map(({ icon: Icon, hue, title }) => (
                <li key={title} className={cn('flex items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold', HUE_CLASSES[hue].subtle)}>
                  <Icon aria-hidden className="size-4" /> {title}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-sheet max-lg:hidden [&>svg]:h-auto [&>svg]:w-full">
            <TechnicianScene />
          </div>
        </Container>
      </section>

      <Container asChild>
        <section id="services" aria-labelledby="services-title" className="flex scroll-mt-20 flex-col gap-3 py-6 md:gap-6 md:py-12">
          <div className="flex items-end justify-between gap-3">
            <Heading level={2} id="services-title">
              What needs repair?
            </Heading>
            <Link to="/services" className="link inline-flex items-center gap-1 text-sm max-sm:hidden">
              All services <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          {catalog.isError && categories.length === 0 ? (
            <Text variant="sm" tone="muted">
              Couldn't load the latest list. You can still tap an appliance below.
            </Text>
          ) : null}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {appliances.map((appliance) => (
              <li key={appliance.code}>
                <ApplianceTile appliance={appliance} />
              </li>
            ))}
            {catalog.isPending
              ? Array.from({ length: Math.max(0, 6 - appliances.length) }, (_, i) => (
                  <li key={`more-${i}`} aria-hidden>
                    <Skeleton className="aspect-square w-full rounded-card" />
                  </li>
                ))
              : null}
          </ul>
          {categories.length > 0 ? (
            <Text variant="sm" tone="secondary">
              Visiting charge per appliance. It's part of your final bill and may be adjusted there; any repair work is explained and agreed before it starts.
            </Text>
          ) : null}
        </section>
      </Container>

      <section aria-labelledby="how-title" className="bg-surface py-6 md:py-16">
        <Container className="flex flex-col gap-4 md:gap-8">
          <Heading level={2} id="how-title">
            How it works
          </Heading>
          <StepList />
        </Container>
      </section>

      <Container asChild>
        <nav aria-labelledby="learn-title" className="flex flex-col gap-2 py-6 md:py-14">
          <Heading level={2} size="h3" id="learn-title">
            Learn about our repair services
          </Heading>
          <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => (
              <li key={service.slug}>
                <Link to={servicePath(service)} className="transition-interactive flex min-h-12 items-center justify-between gap-3 border-b border-border text-sm font-semibold text-foreground hover:text-primary">
                  {service.title} <ChevronRight aria-hidden className="size-4 text-foreground-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </SiteLayout>
  );
}

/** Only promises that are true for every booking. */
const TICKER = ['Pay after the repair', 'Price explained before work', 'Track your technician live', 'Job closes only with your code'];

/**
 * Phones and tablets: the promises as one thin, slowly scrolling strip along the top of the hero (static and swipeable when the
 * customer prefers reduced motion). Screen readers get the list once.
 */
function PromiseTicker() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} aria-label={hidden ? undefined : 'Why customers choose us'} className="flex shrink-0 items-center">
      {TICKER.map((item) => (
        <li key={item} className="flex items-center gap-2 px-3 text-caption font-semibold whitespace-nowrap">
          <span aria-hidden className="size-1 rounded-full bg-accent" />
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="scrollbar-none overflow-x-auto border-b border-white/15 bg-black/20 py-2 text-white lg:hidden motion-safe:overflow-hidden">
      <div className="ticker-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

function ApplianceTile({ appliance }: { appliance: Appliance }) {
  const book = useBookAppliance();
  return (
    <Link
      to={`/book?service=${encodeURIComponent(appliance.code)}`}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        book(appliance.code);
      }}
      className="pressable transition-interactive flex h-full flex-col items-center gap-2 rounded-card border border-border bg-surface p-2 text-center hover:border-border-strong hover:shadow-md sm:p-3"
    >
      <CategoryTile code={appliance.code} size="lg" className="w-full" />
      <span className="line-clamp-2 text-sm font-semibold text-foreground">{appliance.name}</span>
      {appliance.visitCharge !== undefined ? (
        <span className="text-caption text-foreground-secondary">
          Visit <span className="font-semibold text-foreground tabular-nums">{formatINR(appliance.visitCharge)}</span>
        </span>
      ) : null}
    </Link>
  );
}
