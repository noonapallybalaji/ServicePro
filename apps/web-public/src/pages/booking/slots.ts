import type { AvailabilityDay, AvailabilitySlot } from '@servicepro/api-client';

/*
 * Visit windows come from the server (GET /public/availability): it knows the technicians'
 * shifts and how busy each window is. This file only formats them, always in the business's
 * local time (India), whatever time zone the visitor's device is set to.
 */

const BUSINESS_TZ = 'Asia/Kolkata';

const parts = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, weekday: 'short', day: 'numeric', month: 'short' });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const time = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit', hour12: true });

export interface DayLabel {
  weekday: string;
  dayOfMonth: string;
  month: string;
}

/** "Today" / "Tomorrow" / "Fri", plus day and month, for a YYYY-MM-DD business date. */
export function dayLabel(date: string, now: Date): DayLabel {
  const noon = new Date(`${date}T12:00:00+05:30`);
  const p = Object.fromEntries(parts.formatToParts(noon).map((part) => [part.type, part.value]));
  const today = ymd.format(now);
  const tomorrow = ymd.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return { weekday: date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : (p.weekday ?? ''), dayOfMonth: p.day ?? '', month: p.month ?? '' };
}

/** "9:00 am – 12:00 pm". */
export function slotRange(slot: Pick<AvailabilitySlot, 'start' | 'end'>): string {
  return `${time.format(new Date(slot.start))} – ${time.format(new Date(slot.end))}`;
}

export function dayHasRoom(day: AvailabilityDay): boolean {
  return day.slots.some((s) => s.available);
}
