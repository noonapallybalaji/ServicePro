import { GENERAL_FAQS, SERVICES, serviceHeading, servicePath, type ServiceContent } from '../content/services';
import { SITE } from '../site';
import { breadcrumbSchema, businessSchema, faqSchema, serviceSchema, websiteSchema, type Crumb, type JsonLd } from './schema';

/*
 * The page registry: one entry per public URL with its title, description, canonical path,
 * indexing rule, breadcrumbs and structured data. Pages read their own entry (usePageMeta),
 * and the build uses the same list for pre-rendering, sitemap.xml and robots.txt.
 */

export interface PageMeta {
  /** Canonical path, no query string. */
  path: string;
  title: string;
  description: string;
  /** Indexable pages go into the sitemap; the others get `noindex`. */
  indexable: boolean;
  crumbs?: Crumb[];
  jsonLd: JsonLd[];
  sitemap?: { changefreq: 'weekly' | 'monthly' | 'yearly'; priority: number };
}

const brand = (title: string) => `${title} | ${SITE.name}`;

const HOME: Crumb = { name: 'Home', path: '/' };
const SERVICES_CRUMB: Crumb = { name: 'Services', path: '/services' };

function withBreadcrumbs(meta: Omit<PageMeta, 'jsonLd'> & { jsonLd?: JsonLd[] }): PageMeta {
  const jsonLd = [...(meta.jsonLd ?? [])];
  if (meta.crumbs && meta.crumbs.length > 1) jsonLd.push(breadcrumbSchema(meta.crumbs));
  return { ...meta, jsonLd };
}

export function serviceDescription(service: ServiceContent): string {
  return `${service.heading} at home in ${SITE.city}: ${service.summary.charAt(0).toLowerCase()}${service.summary.slice(1)} Pay after the job.`;
}

function servicePage(service: ServiceContent): PageMeta {
  const path = servicePath(service);
  const description = serviceDescription(service);
  return withBreadcrumbs({
    path,
    title: brand(serviceHeading(service)),
    description,
    indexable: true,
    crumbs: [HOME, SERVICES_CRUMB, { name: service.title, path }],
    jsonLd: [serviceSchema(service, path, description)],
    sitemap: { changefreq: 'monthly', priority: 0.9 },
  });
}

export const PAGES = {
  home: withBreadcrumbs({
    path: '/',
    title: brand(`Appliance & Electronics Repair in ${SITE.city}`),
    description: `Doorstep AC, fridge, washing machine, TV and microwave repair in ${SITE.city}. See the visiting charge upfront, pay after the job, track your technician.`,
    indexable: true,
    jsonLd: [businessSchema(), websiteSchema()],
    sitemap: { changefreq: 'weekly', priority: 1 },
  }),
  services: withBreadcrumbs({
    path: '/services',
    title: brand(`Appliance Repair Services in ${SITE.city}`),
    description: `AC, refrigerator, washing machine, TV and microwave repair at your home in ${SITE.city}. Choose your appliance to see common problems we fix and book a visit.`,
    indexable: true,
    crumbs: [HOME, SERVICES_CRUMB],
    sitemap: { changefreq: 'monthly', priority: 0.8 },
  }),
  about: withBreadcrumbs({
    path: '/about',
    title: brand(`About Us · Appliance Repair in ${SITE.city}`),
    description: `${SITE.name} repairs home appliances at your doorstep in ${SITE.city}. Learn how a visit works, how pricing works and what we promise every customer.`,
    indexable: true,
    crumbs: [HOME, { name: 'About', path: '/about' }],
    sitemap: { changefreq: 'yearly', priority: 0.5 },
  }),
  contact: withBreadcrumbs({
    path: '/contact',
    title: brand('Contact Us & Book a Repair'),
    description: `Book an appliance repair in ${SITE.city} online, by phone or on WhatsApp. Find out how to reach ${SITE.name} about an existing booking.`,
    indexable: true,
    crumbs: [HOME, { name: 'Contact', path: '/contact' }],
    sitemap: { changefreq: 'yearly', priority: 0.6 },
  }),
  faq: withBreadcrumbs({
    path: '/faq',
    title: brand('Frequently Asked Questions'),
    description: `Answers about booking, visiting charges, payment, the completion code and tracking your appliance repair with ${SITE.name} in ${SITE.city}.`,
    indexable: true,
    crumbs: [HOME, { name: 'FAQ', path: '/faq' }],
    jsonLd: [faqSchema(GENERAL_FAQS)],
    sitemap: { changefreq: 'monthly', priority: 0.6 },
  }),

  // Policies: indexable only once the business has filled in the legal details (see site.ts).
  terms: withBreadcrumbs({
    path: '/terms',
    title: brand('Terms of Service'),
    description: `The terms for booking a doorstep appliance repair with ${SITE.name} in ${SITE.city}: booking, prices, payment and your account.`,
    indexable: SITE.legal.ready,
    crumbs: [HOME, { name: 'Terms of service', path: '/terms' }],
    sitemap: { changefreq: 'yearly', priority: 0.2 },
  }),
  privacy: withBreadcrumbs({
    path: '/privacy',
    title: brand('Privacy Policy'),
    description: `What ${SITE.name} collects when you book a repair, why, who sees it, and how to download or delete your data.`,
    indexable: SITE.legal.ready,
    crumbs: [HOME, { name: 'Privacy policy', path: '/privacy' }],
    sitemap: { changefreq: 'yearly', priority: 0.2 },
  }),
  refunds: withBreadcrumbs({
    path: '/cancellation-and-refunds',
    title: brand('Cancellation and Refund Policy'),
    description: `How to cancel or change an appliance repair booking with ${SITE.name}, and how refunds work.`,
    indexable: SITE.legal.ready,
    crumbs: [HOME, { name: 'Cancellation and refunds', path: '/cancellation-and-refunds' }],
    sitemap: { changefreq: 'yearly', priority: 0.2 },
  }),

  // Not indexable: transactional or private.
  book: { path: '/book', title: brand('Book a Repair'), description: `Book an appliance repair visit in ${SITE.city}.`, indexable: false, jsonLd: [] },
  account: { path: '/account', title: brand('My Bookings'), description: 'Your bookings, addresses and details.', indexable: false, jsonLd: [] },
  tracking: { path: '/t', title: brand('Track Your Service'), description: 'Follow your service request.', indexable: false, jsonLd: [] },
  notFound: { path: '/404', title: brand('Page Not Found'), description: "This page doesn't exist.", indexable: false, jsonLd: [] },
  /** Head of the empty shell that client-only routes load before they set their own tags. */
  appShell: { path: '/app', title: SITE.name, description: SITE.description, indexable: false, jsonLd: [] },
} satisfies Record<string, PageMeta>;

export const SERVICE_PAGES: ReadonlyMap<string, PageMeta> = new Map(SERVICES.map((s) => [s.slug, servicePage(s)]));

/** Every indexable page, in sitemap order. */
export function indexablePages(): PageMeta[] {
  return [PAGES.home, PAGES.services, ...SERVICES.map(servicePage), PAGES.about, PAGES.contact, PAGES.faq, ...LEGAL_PAGES].filter((page) => page.indexable);
}

/** Policy pages are always pre-rendered, even while they are drafts (and noindex). */
export const LEGAL_PAGES: PageMeta[] = [PAGES.terms, PAGES.privacy, PAGES.refunds];
