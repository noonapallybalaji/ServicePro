import { checkServiceability, locateServiceability } from '@servicepro/api-client';
import { Alert, Button, Dialog, DialogBody, DialogContent, DialogHeader, Field, Input, Text } from '@servicepro/ui';
import { CircleCheck, LocateFixed, MapPin, MessageCircle, RotateCcw } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { SITE, whatsappLink } from '../site';
import { closeLocationPicker, saveServiceLocation, useLocationPicker, useServiceLocation, type ServiceLocation } from './service-location';

const PINCODE = /^[1-9][0-9]{5}$/;

type Status =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'checking' }
  /** The API answered: we don't cover this PIN code. */
  | { kind: 'unsupported'; pincode: string }
  /** The API (or the network) failed: nothing is known, so offer a retry, never "unsupported". */
  | { kind: 'failed'; retry: () => void; offline: boolean }
  /** The device couldn't give a usable position or PIN code: type it instead. */
  | { kind: 'type-it'; reason: string };

/**
 * Location first: "Detect my location" or a PIN code, checked against the service areas before the
 * customer starts a booking. Rendered once per page by the site layout; opened from the header,
 * the home page and the booking flow (openLocationPicker).
 */
export function LocationDialogHost() {
  const request = useLocationPicker();
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && closeLocationPicker()}>
      {request ? <LocationDialog then={request.then} automatic={request.automatic ?? false} /> : null}
    </Dialog>
  );
}

function LocationDialog({ then, automatic }: { then?: string; automatic: boolean }) {
  const navigate = useNavigate();
  const current = useServiceLocation();
  const [pincode, setPincode] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const pinInput = useRef<HTMLInputElement>(null);

  const busy = status.kind === 'locating' || status.kind === 'checking';
  const pincodeError = touched && pincode.length > 0 && !PINCODE.test(pincode) ? 'Enter a 6-digit PIN code, like 500081.' : undefined;

  function served(location: Omit<ServiceLocation, 'checkedAt'>) {
    saveServiceLocation(location);
    closeLocationPicker();
    if (then) void navigate(then);
  }

  function failed(retry: () => void) {
    setStatus({ kind: 'failed', retry, offline: typeof navigator !== 'undefined' && navigator.onLine === false });
  }

  async function check(code: string) {
    setStatus({ kind: 'checking' });
    try {
      const result = await checkServiceability(code);
      if (result.isServiceable) served({ pincode: code, areas: [...result.areas] });
      else setStatus({ kind: 'unsupported', pincode: code });
    } catch {
      failed(() => void check(code));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (PINCODE.test(pincode)) void check(pincode);
    else pinInput.current?.focus();
  }

  function typeInstead(reason: string) {
    setStatus({ kind: 'type-it', reason });
    window.setTimeout(() => pinInput.current?.focus(), 50);
  }

  // Location permission is asked only now, when the customer taps the button.
  function detect() {
    if (!('geolocation' in navigator)) {
      typeInstead("This browser can't share your location. Please type your PIN code.");
      return;
    }

    setStatus({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) => void locate(position.coords),
      (error) =>
        typeInstead(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission is off. No problem — type your PIN code instead.'
            : "We couldn't get your location. Please type your PIN code.",
        ),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  }

  async function locate(coords: GeolocationCoordinates) {
    setStatus({ kind: 'checking' });
    try {
      const result = await locateServiceability({ latitude: coords.latitude, longitude: coords.longitude });
      if (!result.located || !result.pincode) {
        typeInstead("We couldn't work out your PIN code from your location. Please type it.");
        return;
      }

      setPincode(result.pincode);
      const pin = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
      if (result.isServiceable) served({ pincode: result.pincode, areas: [...result.areas], locality: result.locality ?? undefined, pin });
      else setStatus({ kind: 'unsupported', pincode: result.pincode });
    } catch {
      failed(() => void locate(coords));
    }
  }

  const whatsapp = whatsappLink(`Hi, do you repair appliances in PIN code ${status.kind === 'unsupported' ? status.pincode : pincode}?`);

  return (
    <DialogContent aria-describedby={undefined}>
      <DialogHeader
        title={current ? 'Change your location' : 'Where do you need the repair?'}
        description={`We repair appliances at home in selected areas of ${SITE.city}.`}
      />
      <DialogBody className="flex flex-col gap-5 pb-6">
        {current ? (
          <Text variant="sm" tone="secondary" className="flex items-center gap-2">
            <CircleCheck aria-hidden className="size-4 text-success" />
            Now: {current.locality ? `${current.locality}, ` : ''}
            {current.pincode}
          </Text>
        ) : null}

        <Button type="button" size="lg" variant="outline" onClick={detect} loading={status.kind === 'locating'} disabled={busy} className="w-full">
          <LocateFixed aria-hidden /> Detect my location
        </Button>
        <Text variant="caption" tone="muted" className="-mt-3 text-center">
          We'll ask your permission to use this device's location.
        </Text>

        <div className="flex items-center gap-3 text-sm text-foreground-muted" aria-hidden>
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <Field label="Enter your PIN code" error={pincodeError}>
            <Input
              ref={pinInput}
              inputMode="numeric"
              autoComplete="postal-code"
              enterKeyHint="go"
              maxLength={6}
              placeholder="e.g. 500081"
              leadingIcon={MapPin}
              value={pincode}
              onChange={(event) => {
                setPincode(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (status.kind !== 'idle' && !busy) setStatus({ kind: 'idle' });
              }}
              onBlur={() => setTouched(true)}
            />
          </Field>
          <Button type="submit" size="lg" loading={status.kind === 'checking'} disabled={busy || pincode.length !== 6} className="w-full">
            Check availability
          </Button>
        </form>

        <div aria-live="polite" className="empty:hidden">
          {status.kind === 'type-it' ? <Alert tone="info" title={status.reason} /> : null}
          {status.kind === 'unsupported' ? (
            <Alert
              tone="warning"
              title={`We don't serve ${status.pincode} yet`}
              description={`${SITE.name} currently serves selected areas of ${SITE.city}. Message us and we'll tell you if we can help.`}
              action={
                whatsapp ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={whatsapp} target="_blank" rel="noreferrer">
                      <MessageCircle aria-hidden /> WhatsApp us
                    </a>
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {status.kind === 'failed' ? (
            <Alert
              tone="error"
              title={status.offline ? "You're offline" : "We couldn't check right now"}
              description={status.offline ? 'Connect to the internet and try again.' : 'This is on our side, not your area. Please try again.'}
              action={
                <Button size="sm" variant="outline" onClick={status.retry}>
                  <RotateCcw aria-hidden /> Try again
                </Button>
              }
            />
          ) : null}
        </div>

        {automatic ? (
          <Button type="button" variant="ghost" onClick={closeLocationPicker} className="self-center">
            Skip for now
          </Button>
        ) : null}
      </DialogBody>
    </DialogContent>
  );
}
