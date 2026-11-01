import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { registerPlugin } from '@capacitor/core';
import { reportMyLocation } from '@servicepro/api-client';
import { createContext, useContext, useEffect, useState } from 'react';

import { isNativeApp } from '../native/native-app';

/** The phone app's location service: keeps reporting with the app in the background. */
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

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
  const supported = isNativeApp || (typeof navigator !== 'undefined' && 'geolocation' in navigator);
  const [state, setState] = useState<SharingState>('locating');

  useEffect(() => {
    if (!active || !supported) {
      return;
    }
    if (isNativeApp) {
      return shareFromTheApp(mode, setState);
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

/**
 * In the Android / iOS app: the native location service keeps reporting while the technician uses
 * other apps (Google Maps). Android shows a notification while it runs, as the system requires.
 * Positions are sent at the mode's pace; a moving phone reports at most that often.
 */
function shareFromTheApp(mode: Exclude<SharingMode, 'off'>, setState: (state: SharingState) => void): () => void {
  let latest: { latitude: number; longitude: number } | null = null;
  let lastSent = 0;
  let stopped = false;
  const send = () => {
    if (!latest) return;
    lastSent = Date.now();
    void reportMyLocation(latest).catch(() => undefined); // the next report follows shortly
  };

  const watcher = BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Sharing your location',
      backgroundMessage: mode === 'enroute' ? 'Your customer can see you on the way.' : 'The office can see where you are while you are on duty.',
      requestPermissions: true,
      stale: false,
      distanceFilter: mode === 'enroute' ? 20 : 100,
    },
    (position, error) => {
      if (stopped) return;
      if (error) {
        setState(error.code === 'NOT_AUTHORIZED' ? 'denied' : latest ? 'sharing' : 'unavailable');
        return;
      }
      if (!position) return;
      latest = { latitude: position.latitude, longitude: position.longitude };
      setState('sharing');
      if (Date.now() - lastSent >= EVERY_MS[mode]) send();
    },
  );
  // Standing still produces no updates: repeat the last position so the maps stay fresh.
  const timer = window.setInterval(() => Date.now() - lastSent >= EVERY_MS[mode] && send(), 15_000);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    void watcher.then((id) => BackgroundGeolocation.removeWatcher({ id })).catch(() => undefined);
    setState('locating');
  };
}

/** The phone app's settings page, where the technician can allow location after refusing it. */
export function openLocationSettings() {
  void BackgroundGeolocation.openSettings();
}

/** In the phone app, sharing continues with other apps in front; in a browser it pauses. */
export const sharesInBackground = isNativeApp;

/** The shell's sharing state, for screens that explain it (the job screen). */
export const LocationSharingContext = createContext<SharingState>('off');

export const useSharingState = () => useContext(LocationSharingContext);
