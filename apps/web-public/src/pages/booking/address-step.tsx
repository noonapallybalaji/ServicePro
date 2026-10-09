import { useCheckServiceability } from '@servicepro/api-client';
import { Button, Checkbox, Field, Heading, Input, Text, cn } from '@servicepro/ui';
import { Briefcase, Home, MapPin, MapPinned } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { ADDRESS_LABELS, addressOneLine, forgetSavedAddress, loadSavedAddress, type AddressLabel, type BookingAddress, type Draft } from './draft';
import { LocationPin } from './location-pin';

const PINCODE = /^[1-9][0-9]{5}$/;
const LABEL_ICONS: Record<AddressLabel, ReactNode> = {
  Home: <Home aria-hidden />,
  Work: <Briefcase aria-hidden />,
  Other: <MapPinned aria-hidden />,
};

interface AddressStepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
  actions: (ready: boolean) => ReactNode;
}

/** Where the technician should come: device pin (optional) plus a complete written address. */
export function AddressStep({ draft, update, onNext, actions }: AddressStepProps) {
  const [saved, setSaved] = useState<BookingAddress | null>(() => (draft.line1 ? null : loadSavedAddress()));
  const pincodeComplete = PINCODE.test(draft.pincode);
  const serviceability = useCheckServiceability(draft.pincode, { query: { enabled: pincodeComplete, staleTime: 5 * 60_000 } });
  const covered = serviceability.data?.isServiceable === true;
  const ready = Boolean(covered && draft.line1.trim() && draft.locality.trim() && draft.city.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) onNext();
  }

  const pincodeHint = !pincodeComplete
    ? 'We check straight away whether we cover it.'
    : serviceability.isPending
      ? 'Checking…'
      : covered
        ? `Great — we cover ${serviceability.data?.areas.join(', ') || 'your area'}.`
        : undefined;
  const pincodeError = pincodeComplete && serviceability.data && !covered ? "Sorry, we don't cover this pincode yet." : undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {saved ? (
        <div className="flex flex-col gap-3 rounded-card border border-primary-border bg-primary-subtle p-4 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-primary [&_svg]:size-5">
            {LABEL_ICONS[saved.label]}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <Text weight="semibold">Saved address · {saved.label}</Text>
            <Text variant="sm" tone="secondary" className="truncate">
              {addressOneLine(saved)}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                update(saved);
                setSaved(null);
              }}
            >
              Use this address
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                forgetSavedAddress();
                setSaved(null);
              }}
            >
              Forget
            </Button>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="pin-heading" className="flex flex-col gap-3">
        <Heading level={3} size="h3" id="pin-heading">
          Pin your location
        </Heading>
        <LocationPin pin={draft.pin} onChange={(pin) => update({ pin })} />
      </section>

      <section aria-labelledby="address-heading" className="flex flex-col gap-4">
        <Heading level={3} size="h3" id="address-heading">
          Address details
        </Heading>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Pincode" hint={pincodeHint} error={pincodeError}>
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              leadingIcon={MapPin}
              value={draft.pincode}
              onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="City">
            <Input autoComplete="address-level2" value={draft.city} onChange={(e) => update({ city: e.target.value })} />
          </Field>
          <Field label="House / flat / floor no.">
            <Input autoComplete="address-line1" placeholder="e.g. Flat 402, 4th floor" value={draft.line1} onChange={(e) => update({ line1: e.target.value })} />
          </Field>
          <Field label="Building / apartment / street" optional>
            <Input autoComplete="address-line2" placeholder="e.g. Sunrise Apartments, Road No. 5" value={draft.line2} onChange={(e) => update({ line2: e.target.value })} />
          </Field>
          <Field label="Area / locality">
            <Input autoComplete="address-level3" value={draft.locality} onChange={(e) => update({ locality: e.target.value })} />
          </Field>
          <Field label="Landmark" optional hint="Helps the technician find you.">
            <Input placeholder="e.g. Opposite City Park" value={draft.landmark} onChange={(e) => update({ landmark: e.target.value })} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-foreground">Save address as</legend>
          <div role="radiogroup" aria-label="Save address as" className="flex flex-wrap gap-2">
            {ADDRESS_LABELS.map((label) => {
              const selected = draft.label === label;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => update({ label })}
                  className={cn(
                    'pressable transition-interactive inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-sm font-semibold [&_svg]:size-4',
                    selected ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-foreground-secondary hover:border-border-strong',
                  )}
                >
                  {LABEL_ICONS[label]} {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Checkbox
          checked={draft.rememberAddress}
          onCheckedChange={(checked) => update({ rememberAddress: checked === true })}
          label="Remember this address on this device"
          description="Next time you can book with one tap. Stored only in this browser."
        />
      </section>

      {actions(ready)}
    </form>
  );
}
