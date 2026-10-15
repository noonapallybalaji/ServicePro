/*
 * Date & time display (DESIGN-SYSTEM.md §9): absolute times for commitments ("10:30 AM"),
 * relative times for recency ("5 min ago"). Indian locale, business time zone.
 */

const LOCALE = 'en-IN';
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', timeZone: BUSINESS_TIME_ZONE });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: BUSINESS_TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: BUSINESS_TIME_ZONE,
});
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' });

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "10:30 am" */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormat.format(date) : '';
}

/** "Mon, 5 Oct" */
export function formatDay(value: DateInput): string {
  const date = toDate(value);
  return date ? dayFormat.format(date) : '';
}

/** "15 Jan 2027": dates far enough away that the year matters (warranty, expiry). */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : '';
}

/** "5 Oct, 10:30 am" */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? dateTimeFormat.format(date) : '';
}

/** "Today, 11:00 am – 1:00 pm" style window, or a single time when there's no end. */
export function formatWindow(start: DateInput, end: DateInput): string {
  const from = toDate(start);
  if (!from) return '';
  const to = toDate(end);
  const day = isSameLocalDay(from, new Date()) ? 'Today' : formatDay(from);
  return to ? `${day}, ${formatTime(from)} – ${formatTime(to)}` : `${day}, ${formatTime(from)}`;
}

/** "5 min ago", "in 2 hr" */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return '';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  return relativeFormat.format(Math.round(seconds / 86400), 'day');
}

/** "mm:ss" for countdowns (job offers). */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Local date (YYYY-MM-DD) for date inputs and API date parameters. */
export function toLocalDateInput(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  return parts;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateInput(a) === toLocalDateInput(b);
}
