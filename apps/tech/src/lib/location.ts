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

export type SharingState = 'off' | 'sharing' | 'denied' | 'unsupported';

/** How often the customer's map moves; frequent enough to feel live, light on battery and data. */
const SHARE_EVERY_MS = 30_000;

/**
 * Shares the technician's position with the customer while `active` (on the way to a job).
 * Stops when the job moves on or the screen closes; nothing is sent in the background.
 */
export function useShareLocation(active: boolean): SharingState {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [state, setState] = useState<SharingState>('off');

  useEffect(() => {
    if (!active || !supported) {
      return;
    }

    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        setState('sharing');
        const now = Date.now();
        if (now - lastSent < SHARE_EVERY_MS) return;
        lastSent = now;
        // A missed report is fine: the next one follows shortly.
        void reportMyLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }).catch(() => undefined);
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'off'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [active, supported]);

  if (!active) return 'off';
  return supported ? state : 'unsupported';
}
