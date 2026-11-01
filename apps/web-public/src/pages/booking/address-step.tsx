import { useCheckServiceability } from '@servicepro/api-client';
import { Field, Input, cn } from '@servicepro/ui';
import { MapPin } from 'lucide-react';

import { ADDRESS_LABELS, type BookingAddress } from './draft';
import { LocationPin } from './location-pin';

const PINCODE = /^[1-9][0-9]{5}$/;

/** Whether the typed PIN code is one we serve (checked as the customer types; the API checks again). */
export function usePincodeCheck(pincode: string) {
  const complete = PINCODE.test(pincode);
  const serviceability = useCheckServiceability(pincode, { query: { enabled: complete, staleTime: 5 * 60_000 } });
  return {
    complete,
    pending: complete && serviceability.isPending,
    covered: complete && serviceability.data?.isServiceable === true,
    notCovered: complete && serviceability.data?.isServiceable === false,
    failed: complete && serviceability.isError,
    areas: serviceability.data?.areas ?? [],
    /** The places the PIN code covers (India Post), best known first. */
    localities: serviceability.data?.localities ?? [],
  };
}

/** Complete enough to book: a PIN code we serve (or couldn't check), the area and the city. */
export function addressReady(address: BookingAddress, coveredOrUnchecked: boolean): boolean {
  return coveredOrUnchecked && address.locality.trim().length > 0 && address.city.trim().length > 0;
}

/**
 * A new address: what to call it, the PIN code (checked against our areas as it's typed), the area
 * and city. House number, landmark and the map pin are optional and help the technician find the door.
 */
export function AddressForm({ value, onChange }: { value: BookingAddress; onChange: (patch: Partial<BookingAddress>) => void }) {
  const check = usePincodeCheck(value.pincode);
  const pincodeHint = !check.complete
    ? 'We check straight away whether we cover it.'
    : check.pending
      ? 'Checking…'
      : check.covered
        ? `Great — we cover ${check.localities.slice(0, 3).join(', ') || check.areas.join(', ') || 'your area'}.`
        : check.failed
          ? "We couldn't check it right now. You can still save it; we'll confirm when you book."
          : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Save address as">
        {ADDRESS_LABELS.map((label) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={value.label === label}
            onClick={() => onChange({ label })}
            className={cn(
              'pressable transition-interactive inline-flex h-10 items-center rounded-pill border px-4 text-sm font-semibold',
              value.label === label ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-foreground-secondary',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="PIN code" hint={pincodeHint} error={check.notCovered ? "Sorry, we don't cover this PIN code yet." : undefined}>
          <Input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            leadingIcon={MapPin}
            value={value.pincode}
            onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <Field label="Area / locality">
          <Input autoComplete="address-level3" value={value.locality} onChange={(e) => onChange({ locality: e.target.value })} />
        </Field>
        {check.localities.length > 0 ? (
          // The PIN code's localities, one tap to fill the area.
          <div className="flex flex-wrap gap-2 md:col-span-2" role="group" aria-label="Areas in this PIN code">
            {check.localities.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={value.locality === name}
                onClick={() => onChange({ locality: name })}
                className="transition-interactive rounded-pill border border-border bg-surface px-3 py-1 text-sm text-foreground-secondary hover:border-border-strong aria-pressed:border-primary aria-pressed:bg-primary-subtle aria-pressed:text-primary"
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
        <Field label="House / flat no." optional>
          <Input autoComplete="address-line1" placeholder="e.g. Flat 402, Sunrise Apartments" value={value.line1} onChange={(e) => onChange({ line1: e.target.value })} />
        </Field>
        <Field label="City">
          <Input autoComplete="address-level2" value={value.city} onChange={(e) => onChange({ city: e.target.value })} />
        </Field>
        <Field label="Landmark" optional className="md:col-span-2">
          <Input placeholder="e.g. Opposite City Park" value={value.landmark} onChange={(e) => onChange({ landmark: e.target.value })} />
        </Field>
      </div>
      <LocationPin pin={value.pin} onChange={(pin) => onChange({ pin })} />
    </div>
  );
}
