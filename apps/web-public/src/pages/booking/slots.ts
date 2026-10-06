/*
 * Visit windows the customer can pick. Times are the business's local time (India, UTC+05:30),
 * whatever time zone the visitor's device is set to.
 */

const BUSINESS_TZ = 'Asia/Kolkata';
const BUSINESS_OFFSET = '+05:30';
/** Bookings need this much notice before a window starts. */
const LEAD_TIME_MS = 2 * 60 * 60 * 1000;
export const BOOKABLE_DAYS = 7;

export const SLOTS = [
  { id: 'morning', label: 'Morning', range: '9 am – 12 pm', start: '09:00', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', range: '12 – 3 pm', start: '12:00', end: '15:00' },
  { id: 'evening', label: 'Evening', range: '3 – 6 pm', start: '15:00', end: '18:00' },
] as const;

export type SlotId = (typeof SLOTS)[number]['id'];

export interface BookableDay {
  /** YYYY-MM-DD in business time. */
  date: string;
  weekday: string;
  dayOfMonth: string;
  month: string;
}

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const parts = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, weekday: 'short', day: 'numeric', month: 'short' });

export function bookableDays(now: Date): BookableDay[] {
  return Array.from({ length: BOOKABLE_DAYS }, (_, offset) => {
    const day = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const p = Object.fromEntries(parts.formatToParts(day).map((part) => [part.type, part.value]));
    return { date: ymd.format(day), weekday: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : (p.weekday ?? ''), dayOfMonth: p.day ?? '', month: p.month ?? '' };
  });
}

export function slotWindow(date: string, slotId: SlotId): { start: string; end: string } {
  const slot = SLOTS.find((s) => s.id === slotId) ?? SLOTS[0];
  return { start: `${date}T${slot.start}:00${BUSINESS_OFFSET}`, end: `${date}T${slot.end}:00${BUSINESS_OFFSET}` };
}

export function isSlotAvailable(date: string, slotId: SlotId, now: Date): boolean {
  return new Date(slotWindow(date, slotId).start).getTime() - now.getTime() >= LEAD_TIME_MS;
}
