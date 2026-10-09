import { Button, Text, cn } from '@servicepro/ui';
import { ExternalLink, LocateFixed, MapPin, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

import type { Pin } from './draft';

type Status = 'idle' | 'locating' | 'denied' | 'unavailable' | 'unsupported';

/** Beyond this the fix is probably Wi-Fi/cell based: still useful, but worth flagging. */
const APPROXIMATE_METRES = 200;

const formatAccuracy = (metres: number) => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`);

/** OpenStreetMap embed centred on the pin (no API key, no extra script). */
function mapEmbedUrl({ latitude, longitude }: Pin) {
  const d = 0.004;
  const bbox = [longitude - d, latitude - d, longitude + d, latitude + d].map((n) => n.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

const mapsLink = ({ latitude, longitude }: Pin) => `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

/**
 * "Use my current location": asks the device for its position only when the customer taps the
 * button, shows it on a small map, and lets them refresh or remove it. The pin is optional —
 * the typed address is always required.
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
    const approximate = pin.accuracy > APPROXIMATE_METRES;
    return (
      <div className="flex flex-col gap-3 rounded-card border border-success-border bg-success-subtle p-3">
        <div className="overflow-hidden rounded-control border border-border bg-surface">
          <iframe
            title="Map showing your pinned location"
            src={mapEmbedUrl(pin)}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="aspect-square w-full sm:aspect-video"
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2" role="status">
            <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-success" />
            <div className="flex flex-col">
              <Text weight="semibold">Location pinned</Text>
              <Text variant="sm" tone="secondary">
                Accurate to about {formatAccuracy(pin.accuracy)}.{' '}
                <a href={mapsLink(pin)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                  Check on Google Maps <ExternalLink aria-hidden className="size-3" />
                </a>
              </Text>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" loading={status === 'locating'} onClick={locate}>
              <RefreshCw aria-hidden /> Update
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X aria-hidden /> Remove
            </Button>
          </div>
        </div>
        {approximate ? (
          <Text variant="sm" className="flex items-start gap-2 text-warning-subtle-foreground">
            <TriangleAlert aria-hidden className="mt-1 size-4 shrink-0" />
            This looks approximate. Turn on GPS and tap Update, or make sure your address below is complete.
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          Map © OpenStreetMap contributors. Your pin is saved with this address so the technician can find you.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="lg" fullWidth loading={status === 'locating'} onClick={locate} className="border-primary text-primary">
        <LocateFixed aria-hidden /> Use my current location
      </Button>
      <Text variant="caption" tone="muted" className={cn(status !== 'idle' && status !== 'locating' && 'hidden')}>
        Optional — a pin helps the technician reach your door. We only ask when you tap the button.
      </Text>
      {status === 'denied' ? (
        <Text variant="sm" role="alert" className="text-warning-subtle-foreground">
          Location permission was blocked. Allow it in your browser's site settings, or just type your address below.
        </Text>
      ) : null}
      {status === 'unavailable' ? (
        <Text variant="sm" role="alert" className="text-warning-subtle-foreground">
          We couldn't get your location. Check that location is turned on, then try again — or type your address below.
        </Text>
      ) : null}
      {status === 'unsupported' ? (
        <Text variant="sm" role="alert" className="text-warning-subtle-foreground">
          This browser can't share a location. Please type your address below.
        </Text>
      ) : null}
    </div>
  );
}
