/** Public settings built into the app from .env (EXPO_PUBLIC_*). */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  siteUrl: (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/$/, ''),
  supportPhone: process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '',
  whatsappNumber: process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || process.env.EXPO_PUBLIC_SUPPORT_PHONE || '',
  city: 'Hyderabad',
};
