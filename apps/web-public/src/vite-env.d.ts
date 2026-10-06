/// <reference types="vite/client" />

/** Public-site configuration. All optional; see src/site.ts and .env.example. */
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_BUSINESS_NAME?: string;
  readonly VITE_SITE_DESCRIPTION?: string;
  readonly VITE_SUPPORT_PHONE?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_SERVICE_CITY?: string;
  readonly VITE_SERVICE_REGION?: string;
  readonly VITE_SERVICE_COUNTRY?: string;
  readonly VITE_SERVICE_COUNTRY_NAME?: string;
  readonly VITE_BUSINESS_STREET_ADDRESS?: string;
  readonly VITE_BUSINESS_POSTAL_CODE?: string;
  readonly VITE_SOCIAL_PROFILES?: string;
  readonly VITE_TWITTER_HANDLE?: string;
  readonly VITE_GOOGLE_SITE_VERIFICATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
