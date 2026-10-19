import { Button, CategoryTile, Container, Heading, SpotArt, TechnicianScene, Text } from '@servicepro/ui';
import { CalendarCheck, Mail, MapPin, MessageCircle, Phone, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { BookActions, BookCta, FaqList, PageHero, PageSection, PromiseList, StepList } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { GENERAL_FAQS, SERVICES, inSentence, servicePath } from '../content/services';
import { usePageMeta } from '../seo/head';
import { PAGES } from '../seo/pages';
import { SITE, whatsappLink } from '../site';

/* ── /services ──────────────────────────────────────────────────────────── */

export function ServicesPage() {
  usePageMeta(PAGES.services);
  return (
    <SiteLayout pinnedSearch>
      <PageHero
        crumbs={PAGES.services.crumbs}
        eyebrow={`Doorstep repair in ${SITE.city}`}
        title={`Appliance repair services in ${SITE.city}`}
        intro="A technician comes to your home, finds the fault and explains the cost before starting. Choose your appliance to see the problems we fix."
        art={<TechnicianScene />}
        actions={<BookActions />}
      />
      <PageSection id="all-services" title="Choose your appliance">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <li key={service.slug}>
              <article className="flex h-full flex-col gap-4 rounded-card border border-border bg-surface p-5">
                <CategoryTile code={service.code} size="lg" className="w-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <h3 className="text-h3 text-foreground">
                    <Link to={servicePath(service)} className="hover:underline">
                      {service.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-foreground-secondary">{service.summary}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to={servicePath(service)}>
                      Learn more<span className="sr-only"> about {inSentence(service.title)}</span>
                    </Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to={`/book?service=${service.code}`}>
                      Book now<span className="sr-only">: {inSentence(service.title)}</span>
                    </Link>
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
        <Text tone="secondary">
          Something else at home not working? Call or message us — if it is an appliance we can help with, we will tell you.
        </Text>
      </PageSection>
      <PageSection id="how" tinted title="How a repair visit works">
        <StepList />
      </PageSection>
      <BookCta title="Ready to book?" text="Pick your appliance and we'll call you to agree a time. You pay only after the visit." />
    </SiteLayout>
  );
}

/* ── /about ─────────────────────────────────────────────────────────────── */

export function AboutPage() {
  usePageMeta(PAGES.about);
  return (
    <SiteLayout>
      <PageHero
        crumbs={PAGES.about.crumbs}
        title={`About ${SITE.name}`}
        intro={`${SITE.name} repairs home appliances at your doorstep in ${SITE.city}. We send a technician to your home, explain the problem and the cost, and only close the job when you confirm it is done.`}
        art={<TechnicianScene />}
      />
      <PageSection id="what" title="What we repair">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <li key={service.slug}>
              <Link
                to={servicePath(service)}
                className="pressable transition-interactive flex items-center gap-4 rounded-card border border-border bg-surface p-4 hover:border-border-strong hover:shadow-md"
              >
                <CategoryTile code={service.code} />
                <span className="text-body font-semibold text-foreground">{service.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>
      <PageSection id="how" tinted title="How a visit works">
        <StepList />
      </PageSection>
      <PageSection id="promises" title="What we promise every customer">
        <PromiseList />
      </PageSection>
      <PageSection id="where" tinted title="Where we work" intro={`We serve homes in ${SITE.city}, ${SITE.region}. Enter your pincode when you book to check that we cover your area.`}>
        <div>
          <Button asChild>
            <Link to="/book">
              <MapPin aria-hidden /> Check your area and book
            </Link>
          </Button>
        </div>
      </PageSection>
    </SiteLayout>
  );
}

/* ── /contact ───────────────────────────────────────────────────────────── */

function ContactCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <span className="flex size-12 items-center justify-center rounded-control bg-primary-subtle text-primary [&_svg]:size-6">{icon}</span>
      <h3 className="text-h3 text-foreground">{title}</h3>
      <div className="flex flex-1 flex-col gap-3 text-sm text-foreground-secondary">{children}</div>
    </article>
  );
}

export function ContactPage() {
  usePageMeta(PAGES.contact);
  return (
    <SiteLayout>
      <PageHero
        crumbs={PAGES.contact.crumbs}
        title="Contact us"
        intro={`Book an appliance repair in ${SITE.city} or get help with an existing booking.`}
      />
      <PageSection id="reach" title="Ways to reach us">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <li>
            <ContactCard icon={<CalendarCheck aria-hidden />} title="Book online">
              <p>Choose your appliance and confirm your location. We call you to agree a time. It takes about a minute.</p>
              <div className="mt-auto">
                <Button asChild>
                  <Link to="/book">Book a repair</Link>
                </Button>
              </div>
            </ContactCard>
          </li>
          {SITE.phone ? (
            <li>
              <ContactCard icon={<Phone aria-hidden />} title="Call or WhatsApp">
                <p>
                  <a href={`tel:${SITE.phone}`} className="link inline-flex min-h-10 items-center text-body">
                    {SITE.phone}
                  </a>
                </p>
                <div className="mt-auto flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <a href={`tel:${SITE.phone}`}>
                      <Phone aria-hidden /> Call
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={whatsappLink('Hi, I need help with an appliance repair.')} target="_blank" rel="noreferrer">
                      <MessageCircle aria-hidden /> WhatsApp
                    </a>
                  </Button>
                </div>
              </ContactCard>
            </li>
          ) : null}
          {SITE.email ? (
            <li>
              <ContactCard icon={<Mail aria-hidden />} title="Email">
                <p>
                  <a href={`mailto:${SITE.email}`} className="link inline-flex min-h-10 items-center text-body">
                    {SITE.email}
                  </a>
                </p>
              </ContactCard>
            </li>
          ) : null}
          <li>
            <ContactCard icon={<Search aria-hidden />} title="Already booked?">
              <p>Open the tracking link from your WhatsApp message to see your technician, visit time and bill.</p>
              {SITE.phone ? <p>Lost the link? Message us with your request number (it starts with SR-).</p> : null}
            </ContactCard>
          </li>
        </ul>
      </PageSection>
      <PageSection
        id="area"
        tinted
        title="Service area"
        intro={`We repair appliances at homes in ${SITE.city}, ${SITE.region}. Enter your pincode when you book and we confirm straight away whether we cover it.`}
      >
        <div className="flex flex-wrap gap-3">
          {SERVICES.map((service) => (
            <Link key={service.slug} to={servicePath(service)} className="link inline-flex min-h-10 items-center">
              {service.title} in {SITE.city}
            </Link>
          ))}
        </div>
      </PageSection>
    </SiteLayout>
  );
}

/* ── /faq ───────────────────────────────────────────────────────────────── */

export function FaqPage() {
  usePageMeta(PAGES.faq);
  return (
    <SiteLayout>
      <PageHero crumbs={PAGES.faq.crumbs} title="Frequently asked questions" intro="How booking, pricing, payment and tracking work." />
      <PageSection id="questions" title="Booking, visits and payment">
        <div className="max-w-sheet">
          <FaqList faqs={GENERAL_FAQS} />
        </div>
      </PageSection>
      <PageSection id="by-appliance" tinted title="Questions about a specific appliance" intro="Each service page answers questions about that appliance.">
        <ul className="flex flex-wrap gap-3">
          {SERVICES.map((service) => (
            <li key={service.slug}>
              <Link to={`${servicePath(service)}#faq`} className="link inline-flex min-h-10 items-center">
                {service.title} questions
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>
      <BookCta title="Still have a question?" text="Book a visit and the technician will explain everything at home, or contact us first." />
    </SiteLayout>
  );
}

/* ── 404 ────────────────────────────────────────────────────────────────── */

export function NotFoundPage() {
  usePageMeta(PAGES.notFound);
  return (
    <SiteLayout>
      <Container className="flex flex-col items-center gap-6 py-16 text-center md:py-24">
        <SpotArt kind="search" className="size-32" />
        <div className="flex max-w-prose flex-col gap-2">
          <Heading level={1}>We couldn't find that page</Heading>
          <Text tone="secondary">The link may be old or mistyped. Here are some places to start:</Text>
        </div>
        <nav aria-label="Suggested pages">
          <ul className="flex flex-wrap justify-center gap-3">
            <li>
              <Button asChild>
                <Link to="/">Home</Link>
              </Button>
            </li>
            <li>
              <Button asChild variant="outline">
                <Link to="/services">All services</Link>
              </Button>
            </li>
            <li>
              <Button asChild variant="outline">
                <Link to="/book">Book a repair</Link>
              </Button>
            </li>
          </ul>
        </nav>
      </Container>
    </SiteLayout>
  );
}
