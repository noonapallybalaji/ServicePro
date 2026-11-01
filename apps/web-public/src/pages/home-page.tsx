import { Badge, formatINR, Container, Heading, Skeleton, Text } from '@servicepro/ui';
import { ArrowRight, Cable, ChevronRight, Droplets, FlaskConical, Package, ShieldCheck, Umbrella, Wallet, Zap } from 'lucide-react';
import { useEffect, type MouseEvent } from 'react';
import { Link } from 'react-router';

import { FALLBACK_APPLIANCES, useActiveCategories, useBookAppliance, type Appliance } from '../components/appliance-search';
import { AppliancePhoto } from '../components/appliance-photo';
import { HeroCarousel } from '../components/hero-carousel';
import { StepList } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { SiteLogo } from '../components/site-logo';
import { useStartRequest } from '../components/mobile-action-bar';
import { SERVICES, servicePath } from '../content/services';
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

  // Location first: ask new visitors once, as a dismissible sheet.
  useEffect(() => promptForLocationOnce(), []);

  return (
    <SiteLayout pinnedSearch>
      {/* The promises scroll along the top; the search is pinned under the header (every screen size). */}
      <div data-surface="brand" className="surface-hero">
        <PromiseTicker />
      </div>
      {/* Not overflow-hidden: the search results drop below. */}
      <Container className="flex flex-col gap-3 pt-3 md:pt-6">
        <div className="sr-only">
          <p>Home appliance repair in {SITE.city}</p>
          <Heading level={1}>Your appliance, fixed at home — without the guesswork.</Heading>
        </div>
        <HeroCarousel appliances={appliances} />
      </Container>

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
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
            {appliances.map((appliance) => (
              <li key={appliance.code}>
                <ApplianceTile appliance={appliance} />
              </li>
            ))}
            {catalog.isPending
              ? Array.from({ length: Math.max(0, 5 - appliances.length) }, (_, i) => (
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

      <Container className="pb-6 md:pb-12">
        <PromoBanner />
      </Container>

      <section aria-labelledby="how-title" className="bg-surface py-6 md:py-16">
        <Container className="flex flex-col gap-4 md:gap-8">
          <Heading level={2} id="how-title">
            How it works
          </Heading>
          <StepList />
        </Container>
      </section>

      <SparesComingSoon />

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
 * The promises as one thin, slowly scrolling strip along the top of the page (static and swipeable when the
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
    <div className="scrollbar-none overflow-x-auto border-b border-[#fff]/15 bg-[#000]/20 py-2 text-[#fff] motion-safe:overflow-hidden">
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
      className="pressable transition-interactive flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface text-center hover:border-border-strong hover:shadow-md"
    >
      <AppliancePhoto code={appliance.code} />
      <span className="flex flex-1 flex-col items-center justify-center gap-1 p-2 sm:p-3">
        <span className="line-clamp-2 text-sm font-semibold text-foreground">{appliance.name}</span>
        {appliance.visitCharge !== undefined ? (
          <span className="flex flex-col items-center">
            <span className="text-caption tracking-wide text-foreground-muted uppercase max-sm:hidden">Visit charge</span>
            <span className="text-sm font-bold text-accent-subtle-foreground tabular-nums">{formatINR(appliance.visitCharge)}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** A banner between the sections: the brand promise, with the one action that matters. */
function PromoBanner() {
  const startRequest = useStartRequest();
  return (
    <aside
      aria-label={`The ${SITE.name} promise`}
      className="relative isolate overflow-hidden rounded-card bg-[linear-gradient(110deg,#0a1f3c_0%,#0d3558_60%,#0f4f6e_100%)] p-4 text-[#fff] shadow-lg sm:p-6 md:p-8"
    >
      <div className="flex flex-col gap-3 md:max-w-[60%] md:gap-4">
        <span className="flex items-center gap-2">
          <SiteLogo variant="light" className="h-5 sm:h-6" />
          <span className="rounded-pill border border-[#fff]/25 px-2 text-caption font-semibold text-[#fff]/80">Pakka promise</span>
        </span>
        <p className="text-h3 leading-tight font-extrabold md:text-h1">
          Fixed right, the first time. <span className="text-[#ff8a1f]">That's pakka.</span>
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#fff]/85">
          <li className="flex items-center gap-1">
            <ShieldCheck aria-hidden className="size-4 text-[#ff8a1f]" /> Verified technicians
          </li>
          <li className="flex items-center gap-1">
            <ShieldCheck aria-hidden className="size-4 text-[#ff8a1f]" /> Price explained before work
          </li>
          <li className="flex items-center gap-1">
            <Wallet aria-hidden className="size-4 text-[#ff8a1f]" /> Pay after the repair
          </li>
        </ul>
        <Link
          to="/book"
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            startRequest();
          }}
          className="inline-flex w-fit items-center gap-2 rounded-pill bg-[#ff7a00] px-4 py-2 text-sm font-bold text-[#0a1f3c] shadow-lg hover:bg-[#ff8a1f]"
        >
          Book a repair <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 flex w-[42%] items-end justify-end gap-2 pr-4 max-md:hidden">
        <img src="/appliances/washer-cut.webp" alt="" loading="lazy" className="h-[70%] w-auto drop-shadow-2xl" />
        <img src="/appliances/fridge-cut.webp" alt="" loading="lazy" className="h-[92%] w-auto drop-shadow-2xl" />
      </div>
    </aside>
  );
}

/** Placeholder until spares and accessories are on sale: shows what's coming, nothing to tap. */
const SPARES = [
  { icon: Droplets, name: 'Water softeners' },
  { icon: FlaskConical, name: 'Descalers' },
  { icon: Package, name: 'Stands & trolleys' },
  { icon: Cable, name: 'Drain & inlet pipes' },
  { icon: Umbrella, name: 'Appliance covers' },
  { icon: Zap, name: 'Voltage stabilisers' },
];

function SparesComingSoon() {
  return (
    <Container asChild>
      <section aria-labelledby="spares-title" className="flex flex-col gap-3 py-6 md:gap-6 md:py-12">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={2} id="spares-title">
            Spares &amp; accessories
          </Heading>
          <Badge tone="warning">Coming soon</Badge>
        </div>
        <Text variant="sm" tone="secondary">
          Genuine spares and useful accessories for your appliances, delivered with your repair. We're adding them shortly.
        </Text>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
          {SPARES.map(({ icon: Icon, name }) => (
            <li key={name} className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface p-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-foreground-muted [&_svg]:size-6">
                <Icon aria-hidden />
              </span>
              <span className="text-caption font-semibold text-foreground-secondary">{name}</span>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
