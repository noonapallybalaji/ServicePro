import { Button, Text } from '@servicepro/ui';
import { CircleCheck, LocateFixed, X } from 'lucide-react';
import { useState } from 'react';

import type { Pin } from './draft';

type Status = 'idle' | 'locating' | 'denied' | 'unavailable' | 'unsupported';

/** Beyond this the fix is probably Wi-Fi/cell based: still useful, but worth flagging. */
const APPROXIMATE_METRES = 200;

const formatAccuracy = (metres: number) => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`);

/**
 * Optional: customers who are at the service address can add their device's location so the
 * technician finds the door easily. People booking for another home (parents, a rented flat) skip
 * it — the typed address is what we rely on. The device is asked only when the button is tapped.
 */
export function LocationPin({ pin, onChange }: { pin: Pin | null; onChange: (pin: Pin | null) => void }) {
  const [status, setStatus] = useState<Status>('idle');

  function locate() {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('idle');
        onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  if (pin) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-success-border bg-success-subtle p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2" role="status">
          <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
          <div className="flex flex-col">
            <Text weight="semibold">Current location added</Text>
            <Text variant="sm" tone="secondary">
              Accurate to about {formatAccuracy(pin.accuracy)}
              {pin.accuracy > APPROXIMATE_METRES ? ' — approximate, so make sure the address above is complete.' : '.'}
            </Text>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="self-start sm:self-center">
          <X aria-hidden /> Remove
        </Button>
      </div>
    );
  }

  const message =
    status === 'denied'
      ? "Location permission is blocked. That's fine — the address above is enough."
      : status === 'unavailable'
        ? "We couldn't get your location. That's fine — the address above is enough."
        : status === 'unsupported'
          ? "This browser can't share a location. The address above is enough."
          : null;

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" loading={status === 'locating'} onClick={locate} className="self-start">
        <LocateFixed aria-hidden /> Use my current location
      </Button>
      {message ? (
        <Text variant="sm" role="alert" className="text-warning-subtle-foreground">
          {message}
        </Text>
      ) : null}
    </div>
  );
}
