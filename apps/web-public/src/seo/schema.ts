import type { Faq, ServiceContent } from '../content/services';
import { SITE, absoluteUrl } from '../site';

/*
 * JSON-LD builders (schema.org). Every value comes from SITE or from content that is visible on
 * the page. Optional business facts (phone, email, address, social profiles) are included only
 * when configured — nothing is invented.
 */

export type JsonLd = Record<string, unknown>;

export interface Crumb {
  name: string;
  path: string;
}

const BUSINESS_ID = `${SITE.url}/#business`;
const WEBSITE_ID = `${SITE.url}/#website`;

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as T;
}

const city = () => ({ '@type': 'City', name: SITE.city, containedInPlace: { '@type': 'State', name: SITE.region } });

/** The business as a service-area LocalBusiness. */
export function businessSchema(): JsonLd {
  const address = compact({
    '@type': 'PostalAddress',
    streetAddress: SITE.streetAddress,
    postalCode: SITE.postalCode,
    addressLocality: SITE.city,
    addressRegion: SITE.region,
    addressCountry: SITE.countryCode,
  });

  return compact({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': BUSINESS_ID,
    name: SITE.name,
    description: SITE.description,
    url: absoluteUrl('/'),
    logo: absoluteUrl(SITE.logoPath),
    image: absoluteUrl(SITE.ogImagePath),
    telephone: SITE.phone,
    email: SITE.email,
    // Only a street address makes this a physical location; otherwise we describe the area served.
    address: SITE.streetAddress ? address : undefined,
    areaServed: city(),
    sameAs: SITE.socialProfiles,
  });
}

export function websiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE.name,
    url: absoluteUrl('/'),
    inLanguage: SITE.language,
    publisher: { '@id': BUSINESS_ID },
  };
}

export function serviceSchema(service: ServiceContent, path: string, description: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${absoluteUrl(path)}#service`,
    name: `${service.heading} in ${SITE.city}`,
    serviceType: service.title,
    description,
    url: absoluteUrl(path),
    provider: { '@type': 'LocalBusiness', '@id': BUSINESS_ID, name: SITE.name, url: absoluteUrl('/') },
    areaServed: city(),
  };
}

export function breadcrumbSchema(crumbs: Crumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Only for pages that show exactly these questions and answers. */
export function faqSchema(faqs: Faq[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}
