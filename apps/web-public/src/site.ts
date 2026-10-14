/*
 * The one place that describes the business and the website. Everything public — page titles,
 * Open Graph tags, JSON-LD, the sitemap, contact links — reads from here.
 *
 * Values come from VITE_* environment variables (see .env.example). Optional facts (email,
 * street address, social profiles) stay undefined until configured and are then simply
 * left out: we never publish business information that hasn't been provided.
 */

const env = import.meta.env;

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface SiteConfig {
  /** Brand shown in titles, the header and structured data. */
  name: string;
  /** Production origin, no trailing slash. Canonical URLs, the sitemap and OG URLs use it. */
  url: string;
  /** One-sentence description: default meta description and the business description in JSON-LD. */
  description: string;
  /** E.164 phone number (+91…), if configured. */
  phone?: string;
  email?: string;
  /** Primary service location. */
  city: string;
  region: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  countryName: string;
  /** Street address and postcode, only if the business has a public address. */
  streetAddress?: string;
  postalCode?: string;
  /** Profile URLs (Facebook, Instagram, Google Business Profile…), for JSON-LD sameAs. */
  socialProfiles: string[];
  /** e.g. "@handle", for twitter:site. */
  twitterHandle?: string;
  /** Google Search Console HTML-tag verification token (content of the meta tag only). */
  googleSiteVerification?: string;
  /** Facts the policy pages need. Until all are set, those pages show a draft notice and are noindex. */
  legal: LegalConfig;
  locale: string;
  language: string;
  themeColor: string;
  logoPath: string;
  ogImagePath: string;
  ogImageWidth: number;
  ogImageHeight: number;
}

export interface LegalConfig {
  /** Registered name of the business (e.g. the company or proprietorship), as on its invoices. */
  entityName?: string;
  /** Grievance Officer required by the DPDP Act and IT Rules: name and email. */
  grievanceOfficer?: string;
  grievanceEmail?: string;
  /** YYYY-MM-DD; keep it equal to the API's Legal__PolicyVersion. */
  effectiveDate?: string;
  /** Working days within which an approved refund is sent back. */
  refundWorkingDays?: number;
  /** True once every fact above is set and the wording has been reviewed. */
  ready: boolean;
}

function legalConfig(): LegalConfig {
  const days = Number.parseInt(env.VITE_REFUND_WORKING_DAYS ?? '', 10);
  const legal = {
    entityName: optional(env.VITE_LEGAL_ENTITY_NAME),
    grievanceOfficer: optional(env.VITE_GRIEVANCE_OFFICER_NAME),
    grievanceEmail: optional(env.VITE_GRIEVANCE_OFFICER_EMAIL),
    effectiveDate: optional(env.VITE_POLICY_EFFECTIVE_DATE),
    refundWorkingDays: Number.isFinite(days) && days > 0 ? days : undefined,
  };
  return { ...legal, ready: Object.values(legal).every((value) => value !== undefined) };
}

export const SITE: SiteConfig = {
  name: optional(env.VITE_BUSINESS_NAME) ?? 'ServicePro',
  url: (optional(env.VITE_SITE_URL) ?? 'http://localhost:5192').replace(/\/+$/, ''),
  description:
    optional(env.VITE_SITE_DESCRIPTION) ??
    'Doorstep repair for AC, refrigerator, washing machine, TV and microwave. See the visiting charge before you book and track your technician.',
  phone: optional(env.VITE_SUPPORT_PHONE),
  email: optional(env.VITE_SUPPORT_EMAIL),
  city: optional(env.VITE_SERVICE_CITY) ?? 'Hyderabad',
  region: optional(env.VITE_SERVICE_REGION) ?? 'Telangana',
  countryCode: optional(env.VITE_SERVICE_COUNTRY) ?? 'IN',
  countryName: optional(env.VITE_SERVICE_COUNTRY_NAME) ?? 'India',
  streetAddress: optional(env.VITE_BUSINESS_STREET_ADDRESS),
  postalCode: optional(env.VITE_BUSINESS_POSTAL_CODE),
  socialProfiles: list(env.VITE_SOCIAL_PROFILES),
  twitterHandle: optional(env.VITE_TWITTER_HANDLE),
  googleSiteVerification: optional(env.VITE_GOOGLE_SITE_VERIFICATION),
  legal: legalConfig(),
  locale: 'en_IN',
  language: 'en-IN',
  themeColor: '#0b6276',
  logoPath: '/logo.png',
  ogImagePath: '/og-image.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
};

export const absoluteUrl = (path: string): string => `${SITE.url}${path === '/' ? '/' : path}`;

/** wa.me link with a pre-filled message; undefined when no phone is configured. */
export function whatsappLink(text: string): string | undefined {
  return SITE.phone ? `https://wa.me/${SITE.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : undefined;
}
