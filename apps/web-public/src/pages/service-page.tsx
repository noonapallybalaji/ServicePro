import { ApplianceArt, CategoryTile, Text } from '@servicepro/ui';
import { CircleCheck } from 'lucide-react';
import { Link } from 'react-router';

import { BookActions, BookCta, FaqList, PageHero, PageSection, PromiseList, StepList } from '../components/page-parts';
import { SiteLayout } from '../components/site-layout';
import { GENERAL_FAQS, inSentence, serviceBySlug, serviceHeading, servicePath, type ServiceContent } from '../content/services';
import { usePageMeta } from '../seo/head';
import { SERVICE_PAGES, type PageMeta } from '../seo/pages';
import { SITE } from '../site';
import { TypicalPrices } from '../components/typical-prices';

/** One page per appliance: what we fix, how it works, FAQs, related services. */
export function ServicePage({ slug }: { slug: string }) {
  const service = serviceBySlug(slug);
  const meta = SERVICE_PAGES.get(slug);
  if (!service || !meta) throw new Error(`No service content for "${slug}"`);
  return <ServiceContentPage service={service} meta={meta} />;
}

function ServiceContentPage({ service, meta }: { service: ServiceContent; meta: PageMeta }) {
  usePageMeta(meta);

  const related = service.related.map(serviceBySlug).filter((s): s is ServiceContent => Boolean(s));
  const faqs = [...service.faqs, ...GENERAL_FAQS.slice(1, 5)];

  return (
    <SiteLayout>
      <PageHero
        crumbs={meta.crumbs}
        eyebrow={`Doorstep repair in ${SITE.city}`}
        title={serviceHeading(service)}
        intro={service.intro}
        art={<ApplianceArt code={service.code} />}
        actions={<BookActions service={service.code} label={`Book ${inSentence(service.title)}`} />}
      />

      <PageSection id="covers" title={`${capitalize(service.appliance)} repair services`} intro={`What a visit from ${SITE.name} covers.`}>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {service.covers.map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
              <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
              <span className="text-body text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection
        id="problems"
        tinted
        title={`Common ${service.appliance} problems we fix`}
        intro="Pick the closest one when you book, so the technician comes prepared."
      >
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {service.problems.map((problem) => (
            <li key={problem.title}>
              <article className="flex h-full flex-col gap-2 rounded-card border border-border bg-background p-5">
                <h3 className="text-h3 text-foreground">{problem.title}</h3>
                <p className="text-sm text-foreground-secondary">{problem.text}</p>
              </article>
            </li>
          ))}
        </ul>
      </PageSection>

      <TypicalPrices code={service.code} appliance={service.appliance} />

      <PageSection id="how" title={`How our ${service.appliance} repair service works`}>
        <StepList />
      </PageSection>

      <PageSection id="why" tinted title={`Why choose ${SITE.name}`}>
        <PromiseList />
      </PageSection>

      <PageSection id="faq" title="Frequently asked questions">
        <FaqList faqs={faqs} />
        <Text variant="sm" tone="secondary">
          More answers on our{' '}
          <Link to="/faq" className="link">
            FAQ page
          </Link>
          .
        </Text>
      </PageSection>

      <PageSection id="related" tinted title="Other appliances we repair">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {related.map((other) => (
            <li key={other.slug}>
              <Link
                to={servicePath(other)}
                className="pressable transition-interactive flex h-full items-center gap-4 rounded-card border border-border bg-background p-4 hover:border-border-strong hover:shadow-md"
              >
                <CategoryTile code={other.code} />
                <span className="flex flex-col gap-1">
                  <span className="text-body font-semibold text-foreground">{other.title}</span>
                  <span className="text-sm text-foreground-secondary">{other.summary}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>

      <BookCta
        title={`Book ${inSentence(service.title)} in ${SITE.city}`}
        text="Choose a time that suits you. You'll see the visiting charge before you confirm, and pay only after the visit."
        service={service.code}
      />
    </SiteLayout>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
