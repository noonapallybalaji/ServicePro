/// <reference types="vite/client" />

/** Public-site configuration. All optional; see src/site.ts and .env.example. */
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_BUSINESS_NAME?: string;
  readonly VITE_SITE_DESCRIPTION?: string;
  readonly VITE_SUPPORT_PHONE?: string;
  readonly VITE_WHATSAPP_NUMBER?: string;
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
  readonly VITE_LEGAL_ENTITY_NAME?: string;
  readonly VITE_GRIEVANCE_OFFICER_NAME?: string;
  readonly VITE_GRIEVANCE_OFFICER_EMAIL?: string;
  readonly VITE_POLICY_EFFECTIVE_DATE?: string;
  readonly VITE_REFUND_WORKING_DAYS?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
  readonly VITE_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
