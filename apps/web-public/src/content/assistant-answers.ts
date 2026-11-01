import { SITE } from '../site';
import { GENERAL_FAQS, SERVICES } from './services';

/*
 * What the help chat knows: plain-text answers it can give without a person (and without AI). Each
 * answer is true for every booking; where it depends on the booking, it says where to look. Typed
 * questions are matched to these by keywords (see help-chat.tsx).
 */

export type ChatLink = { label: string; to: string };

export interface ChatAnswer {
  question: string;
  answer: string;
  /** Extra words people use for this question (the question's own words count already). */
  keywords?: string;
  /** A page that goes further. */
  link?: ChatLink;
  /** Topic for the "Payments, warranty & more" menu. */
  topic?: 'payments' | 'visit' | 'warranty' | 'account';
}

const OWN: ChatAnswer[] = [
  {
    question: 'When will the technician come?',
    answer: 'After you book, our team calls or messages you on WhatsApp to agree a visit time that suits you. There are no fixed slots to pick.',
    keywords: 'time slot schedule date today tomorrow arrive come visit when soon urgent',
    topic: 'visit',
  },
  {
    question: 'How do I change the visit time or cancel?',
    answer: 'Open the booking in My bookings and use "Cancel booking" (until the technician sets out). To change the time, message us and we will fix a new one with you.',
    keywords: 'reschedule postpone change cancel cancellation time date',
    link: { label: 'My bookings', to: '/account' },
    topic: 'visit',
  },
  {
    question: "I'm booking for my parents. Who will the technician call?",
    answer: 'Tick "Someone else will be at home" when booking and add their name and number. The technician calls them; updates still come to you.',
    keywords: 'parents family someone else other person father mother home',
    topic: 'visit',
  },
  {
    question: 'Will I be charged more than the visiting charge?',
    answer: 'Only if you agree. When a repair costs extra, the technician sends you an estimate, and nothing extra is done until you approve it with a code sent to your phone. If you decline, only the visiting charge applies.',
    keywords: 'extra cost estimate spare parts quote approve hidden charges price repair',
    topic: 'payments',
  },
  {
    question: 'Where is my bill?',
    answer: 'On your tracking page, and in My bookings under your profile, as a PDF.',
    keywords: 'bill invoice receipt pdf gst',
    link: { label: 'My bookings', to: '/account' },
    topic: 'payments',
  },
  {
    question: 'How do refunds work?',
    answer: 'Our cancellation and refund policy explains when you get money back. If you think you were charged wrongly, message us with your request number.',
    keywords: 'refund money back charged wrongly overcharged',
    link: { label: 'Cancellation & refunds', to: '/cancellation-and-refunds' },
    topic: 'payments',
  },
  {
    question: 'Is my repair under warranty?',
    answer: 'If it is, the booking in My bookings shows a warranty card with the end date and what it covers.',
    keywords: 'warranty guarantee covered',
    link: { label: 'My bookings', to: '/account' },
    topic: 'warranty',
  },
  {
    question: 'The problem came back. What do I do?',
    answer: 'While the warranty lasts, open the booking and choose "Problem came back?": we call you to fix a time and send a technician at no visiting charge. Otherwise, book a new visit or message us.',
    keywords: 'again came back repeat same problem not fixed still broken complaint',
    link: { label: 'My bookings', to: '/account' },
    topic: 'warranty',
  },
  {
    question: 'How do I sign in?',
    answer: 'With your mobile number: we send you a one-time code. There is no password.',
    keywords: 'login log sign otp code password account',
    topic: 'account',
  },
  {
    question: 'Can I delete my account?',
    answer: 'Yes, from your profile in My bookings. Our privacy policy explains what we keep and why.',
    keywords: 'delete remove account data privacy personal',
    link: { label: 'Privacy policy', to: '/privacy' },
    topic: 'account',
  },
  {
    question: 'Something was damaged during the visit.',
    answer: `Tell us as soon as you can, with photos. Damage and safety reports are answered first.${SITE.phone ? ` If anyone is in danger, call us on ${SITE.phone} and the emergency services.` : ''}`,
    keywords: 'damage damaged broke broken scratch safety danger fire shock spark burn',
    topic: 'warranty',
  },
];

const GENERAL_TOPICS: Record<string, ChatAnswer['topic']> = {
  'When do I pay, and how?': 'payments',
  'How much does a visit cost?': 'payments',
  'What is the completion code?': 'visit',
  'Can I see when the technician is coming?': 'visit',
  'What if my appliance cannot be repaired?': 'warranty',
};

const GENERAL_KEYWORDS: Record<string, string> = {
  'How do I book a repair?': 'book booking repair request order service appointment',
  'How much does a visit cost?': 'price cost charge charges fee rate rates how much visiting inspection',
  'Which areas do you cover?': 'area areas location pincode pin serve service available city',
  'When do I pay, and how?': 'pay payment upi cash card online gpay phonepe paytm',
  'What is the completion code?': 'completion code otp finish complete',
  'Can I see when the technician is coming?': 'track tracking status where technician live location',
  'What if my appliance cannot be repaired?': 'cannot repair not repairable dead replace',
  'Can I change my visit time?': 'reschedule change time',
};

export const CHAT_ANSWERS: ChatAnswer[] = [
  ...OWN,
  ...GENERAL_FAQS.map((f) => ({ ...f, keywords: GENERAL_KEYWORDS[f.question], topic: GENERAL_TOPICS[f.question] })),
  // Appliance questions ("Do you repair inverter ACs?"), with the appliance as a keyword.
  ...SERVICES.flatMap((s) =>
    s.faqs.map((f) => ({ ...f, keywords: `${s.appliance} ${s.title}`, link: { label: s.title, to: `/${s.slug}` } })),
  ),
];
