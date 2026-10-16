import { reportMyLocation } from '@servicepro/api-client';
import { useEffect, useState } from 'react';

export interface Position {
  latitude: number;
  longitude: number;
}

/**
 * Best-effort current position for status updates (PLAN.md §7.7 history location).
 * Never blocks the technician: resolves to null after `timeoutMs` or if permission is denied.
 */
export function currentPosition(timeoutMs = 3000): Promise<Position | null> {
  if (!('geolocation' in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
    );
  });
}

/** Google Maps directions deep link (UX-ARCHITECTURE.md §0 C6: no in-app navigation). */
export function directionsUrl(destination: { latitude?: number | null; longitude?: number | null; text: string }): string {
  const target =
    destination.latitude != null && destination.longitude != null
      ? `${destination.latitude},${destination.longitude}`
      : destination.text;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}

/** locating: waiting for the first fix; unavailable: the device can't get one (no GPS signal, location services off). */
export type SharingState = 'off' | 'locating' | 'sharing' | 'denied' | 'unavailable' | 'unsupported';

/** How often the customer's map moves; frequent enough to feel live, light on battery and data. */
const SHARE_EVERY_MS = 30_000;

/**
 * Shares the technician's position with the customer while `active` (on the way to a job).
 * The newest position is sent straight away and then every 30 s, whether or not the phone
 * reports movement (a phone waiting at a signal sends nothing new, and the customer's map
 * would otherwise go stale). Stops when the job moves on or the screen closes.
 */
export function useShareLocation(active: boolean): SharingState {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [state, setState] = useState<SharingState>('locating');

  useEffect(() => {
    if (!active || !supported) {
      return;
    }

    let latest: GeolocationCoordinates | null = null;
    let sentAny = false;
    // A missed report is fine: the next one follows shortly.
    const send = () => latest && void reportMyLocation({ latitude: latest.latitude, longitude: latest.longitude }).catch(() => undefined);

    const watch = navigator.geolocation.watchPosition(
      (position) => {
        latest = position.coords;
        setState('sharing');
        if (!sentAny) {
          sentAny = true;
          send();
        }
      },
      // Timeouts and lost signal are retried by the watch itself; only a refusal is final.
      (error) => setState(error.code === error.PERMISSION_DENIED ? 'denied' : latest ? 'sharing' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
    const timer = window.setInterval(send, SHARE_EVERY_MS);

    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
      setState('locating');
    };
  }, [active, supported]);

  if (!active) return 'off';
  return supported ? state : 'unsupported';
}
