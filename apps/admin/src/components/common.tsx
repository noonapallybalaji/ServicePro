import { isApiError } from '@servicepro/api-client';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="link inline-flex items-center gap-1 self-start text-sm">
      <ArrowLeft aria-hidden className="size-4" /> {label}
    </Link>
  );
}

/** Field-level error from an API validation problem ("address.pincode" style paths). */
export function fieldError(error: unknown, field: string): string | undefined {
  return isApiError(error) ? error.fieldError(field) : undefined;
}

/** A top-level (non-field) error message, if the error isn't a field validation problem. */
export function formError(error: unknown): string | undefined {
  if (!isApiError(error)) return undefined;
  return Object.keys(error.fieldErrors).length > 0 ? undefined : error.message;
}

/** "Rahul Kumar" for SNAKE_UPPER enum values: "WAITING_FOR_PARTS" → "Waiting for parts". */
export function humanize(value: string): string {
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
