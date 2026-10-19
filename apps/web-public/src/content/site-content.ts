import type { Hue } from '@servicepro/ui';
import { BadgeIndianRupee, KeyRound, MapPinned, type LucideIcon } from 'lucide-react';

/** Promises the service actually keeps — reused on the home, service and about pages. */
export const PROMISES: { icon: LucideIcon; hue: Hue; title: string; text: string }[] = [
  { icon: BadgeIndianRupee, hue: 'orange', title: 'Price before work', text: 'The technician explains the cost before any repair starts.' },
  { icon: MapPinned, hue: 'sky', title: 'Track your visit', text: 'See who is coming and when, from one WhatsApp link.' },
  { icon: KeyRound, hue: 'mint', title: 'Completion code', text: 'A job closes only when you share your code.' },
];

/** How a visit works, in order. */
export const STEPS: { title: string; text: string; hue: Hue }[] = [
  { title: 'Book in a minute', text: 'Pick the appliance and confirm your location; we call you to agree a time — online, or by call or WhatsApp.', hue: 'violet' },
  { title: 'A technician visits', text: 'A technician skilled in your appliance checks it and explains the cost first.', hue: 'sky' },
  { title: 'Pay after the repair', text: 'Share your completion code when you’re happy, then pay by UPI or cash.', hue: 'mint' },
];
