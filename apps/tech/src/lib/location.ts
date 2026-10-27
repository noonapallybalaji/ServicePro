import { reportMyLocation } from '@servicepro/api-client';
import { createContext, useContext, useEffect, useState } from 'react';

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

/**
 * enroute: on the way to a customer (their map and the office's), often and precise.
 * duty: on duty between jobs (the office's live map), less often and coarser, to save battery.
 */
export type SharingMode = 'off' | 'duty' | 'enroute';

const EVERY_MS: Record<Exclude<SharingMode, 'off'>, number> = { enroute: 30_000, duty: 120_000 };

/**
 * Shares the technician's position while on duty: with the office, and with the customer whose job
 * they're on the way to (`mode`; never off duty). Runs from
 * the app shell, so it keeps going on every screen of the app. The newest position is sent straight
 * away and then every 30 s, whether or not the phone reports movement (a phone waiting at a signal
 * sends nothing new, and the customer's map would otherwise go stale).
 *
 * Phone browsers pause a web app in the background (for example while Google Maps is open), so the
 * position is sent again the moment the app comes back, and the screen is kept on while sharing
 * where the phone allows it.
 */
export function useShareLocation(mode: SharingMode): SharingState {
  const active = mode !== 'off';
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
      { enableHighAccuracy: mode === 'enroute', maximumAge: mode === 'enroute' ? 15_000 : 60_000, timeout: 30_000 },
    );
    const timer = window.setInterval(send, EVERY_MS[mode]);

    // Back from another app: send a fresh position at once instead of waiting for the next tick.
    let wakeLock: WakeLockSentinel | null = null;
    const keepScreenOn = () => {
      // Only on the way to a customer: keeping the screen on all day while on duty would drain the battery.
      if (mode === 'enroute' && document.visibilityState === 'visible' && 'wakeLock' in navigator && !wakeLock) {
        navigator.wakeLock.request('screen').then((lock) => {
          wakeLock = lock;
          lock.addEventListener('release', () => (wakeLock = null));
        }).catch(() => undefined); // not allowed (battery saver, old browser): sharing still works
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      keepScreenOn();
      navigator.geolocation.getCurrentPosition(
        (position) => {
          latest = position.coords;
          send();
        },
        () => send(),
        { enableHighAccuracy: mode === 'enroute', maximumAge: 10_000, timeout: 15_000 },
      );
    };
    keepScreenOn();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLock?.release();
      setState('locating');
    };
  }, [active, mode, supported]);

  if (!active) return 'off';
  return supported ? state : 'unsupported';
}

/** The shell's sharing state, for screens that explain it (the job screen). */
export const LocationSharingContext = createContext<SharingState>('off');

export const useSharingState = () => useContext(LocationSharingContext);
