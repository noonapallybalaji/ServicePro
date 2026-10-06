import { Button, Container, Heading, HUE_CLASSES, Text, cn } from '@servicepro/ui';
import { CalendarCheck, ChevronDown, ChevronRight, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { Faq } from '../content/services';
import { PROMISES, STEPS } from '../content/site-content';
import type { Crumb } from '../seo/schema';
import { SITE, whatsappLink } from '../site';

/* ── Hero ───────────────────────────────────────────────────────────────── */

interface PageHeroProps {
  title: string;
  intro: ReactNode;
  crumbs?: Crumb[];
  eyebrow?: string;
  art?: ReactNode;
  actions?: ReactNode;
}

/** The brand band that opens every inner page; same look as the home hero, smaller. */
export function PageHero({ title, intro, crumbs, eyebrow, art, actions }: PageHeroProps) {
  return (
    <section data-surface="brand" className="surface-hero relative isolate overflow-hidden">
      <div aria-hidden className="bg-dots absolute inset-y-0 right-0 -z-10 w-1/2" />
      <Container className="grid items-center gap-8 py-10 md:py-14 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          {crumbs ? <Breadcrumbs crumbs={crumbs} /> : null}
          <div className="flex flex-col gap-3">
            {eyebrow ? (
              <Text variant="overline" className="text-accent-border">
                {eyebrow}
              </Text>
            ) : null}
            <Heading level={1} size="h1" className="md:text-display">
              {title}
            </Heading>
            <Text variant="body-lg" tone="secondary" className="max-w-prose">
              {intro}
            </Text>
          </div>
          {actions ? <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div> : null}
        </div>
        {art ? <div className="mx-auto hidden w-full max-w-xs md:block [&>svg]:h-auto [&>svg]:w-full">{art}</div> : null}
      </Container>
    </section>
  );
}

/** Visible trail that matches the BreadcrumbList JSON-LD on the same page. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-foreground-muted">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-foreground-secondary">
                  {crumb.name}
                </span>
              ) : (
                <>
                  <Link to={crumb.path} className="inline-flex min-h-6 items-center rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                    {crumb.name}
                  </Link>
                  <ChevronRight aria-hidden className="size-4" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Sections ───────────────────────────────────────────────────────────── */

interface SectionProps {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  tinted?: boolean;
  className?: string;
}

/** A titled page section with an H2. */
export function PageSection({ id, title, intro, children, tinted = false, className }: SectionProps) {
  return (
    <section aria-labelledby={id} className={cn('py-12 md:py-16', tinted && 'bg-surface', className)}>
      <Container className="flex flex-col gap-8">
        <div className="flex max-w-prose flex-col gap-2">
          <Heading level={2} size="h1" id={id}>
            {title}
          </Heading>
          {intro ? <Text tone="secondary">{intro}</Text> : null}
        </div>
        {children}
      </Container>
    </section>
  );
}

export function PromiseList() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {PROMISES.map(({ icon: Icon, hue, title, text }) => (
        <li key={title} className="flex items-start gap-4 rounded-card border border-border bg-surface p-5">
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
  );
}

export function StepList() {
  return (
    <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex flex-col gap-4 rounded-card bg-background p-6">
          <span aria-hidden className={cn('flex size-12 items-center justify-center rounded-full text-h3 font-bold', HUE_CLASSES[step.hue].subtle)}>
            {index + 1}
          </span>
          <span className="flex flex-col gap-2">
            <span className="text-h3 text-foreground">{step.title}</span>
            <span className="text-body text-foreground-secondary">{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Native <details>: keyboard and screen-reader support for free, and answers stay in the HTML. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="flex flex-col gap-3">
      {faqs.map((faq) => (
        <details key={faq.question} className="group rounded-card border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-4 text-body font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            {faq.question}
            <ChevronDown aria-hidden className="transition-interactive size-5 shrink-0 text-foreground-muted group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-5 text-body text-foreground-secondary">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

/* ── Call to action ─────────────────────────────────────────────────────── */

export function BookActions({ service, label = 'Book a repair' }: { service?: string; label?: string }) {
  return (
    <>
      <Button asChild variant="accent" size="lg">
        <Link to={service ? `/book?service=${service}` : '/book'}>
          <CalendarCheck aria-hidden /> {label}
        </Link>
      </Button>
      {SITE.phone ? (
        <>
          <Button asChild variant="inverse" size="lg">
            <a href={`tel:${SITE.phone}`}>
              <Phone aria-hidden /> Call us
            </a>
          </Button>
          <Button asChild variant="inverse" size="lg">
            <a href={whatsappLink('Hi, I need an appliance repaired.')} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden /> WhatsApp
            </a>
          </Button>
        </>
      ) : null}
    </>
  );
}

export function BookCta({ title, text, service, label }: { title: string; text: string; service?: string; label?: string }) {
  return (
    <section aria-labelledby="book-cta" className="py-12 md:py-16">
      <Container>
        <div data-surface="brand" className="surface-hero flex flex-col gap-6 rounded-sheet p-6 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="flex max-w-prose flex-col gap-2">
            <Heading level={2} id="book-cta">
              {title}
            </Heading>
            <Text tone="secondary">{text}</Text>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <BookActions service={service} label={label} />
          </div>
        </div>
      </Container>
    </section>
  );
}
