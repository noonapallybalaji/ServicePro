export const BUSINESS_NAME = (import.meta.env.VITE_BUSINESS_NAME as string | undefined) ?? 'ServicePro';
export const SUPPORT_PHONE = (import.meta.env.VITE_SUPPORT_PHONE as string | undefined) ?? '';

export const whatsappLink = (text: string) => `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
