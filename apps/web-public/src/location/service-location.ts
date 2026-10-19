import { useSyncExternalStore } from 'react';

/*
 * The customer's service location (gap analysis: location first). A PIN code the API has confirmed
 * we serve, remembered on this device so returning visitors aren't asked again. It is a
 * convenience only: the booking API checks the PIN code again when the booking is made.
 *
 * Also the "open the location picker" signal, so the header, home page and booking flow share one
 * dialog. Pre-rendered pages see no location (server snapshot), then hydrate with the saved one.
 */

export interface ServiceLocation {
  pincode: string;
  /** Service area names the API returned for the PIN code. */
  areas: string[];
  /** From "Detect my location": the area name and the device position, to prefill the address. */
  locality?: string;
  pin?: { latitude: number; longitude: number; accuracy: number };
  checkedAt: string;
}

const STORAGE_KEY = 'servicepro.location.v1';
const PROMPTED_KEY = 'servicepro.location.prompted';

type Listener = () => void;
const listeners = new Set<Listener>();
const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notify = () => listeners.forEach((listener) => listener());

let cached: ServiceLocation | null | undefined;

function read(): ServiceLocation | null {
  if (cached !== undefined) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<ServiceLocation>) : null;
    cached = saved && typeof saved.pincode === 'string' && /^[1-9][0-9]{5}$/.test(saved.pincode)
      ? { pincode: saved.pincode, areas: Array.isArray(saved.areas) ? saved.areas : [], locality: saved.locality, pin: saved.pin, checkedAt: saved.checkedAt ?? '' }
      : null;
  } catch {
    cached = null; // private mode, blocked storage or a corrupt value
  }

  return cached;
}

export function saveServiceLocation(location: Omit<ServiceLocation, 'checkedAt'>) {
  cached = { ...location, checkedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Still used for this visit; just not remembered.
  }

  notify();
}

export function clearServiceLocation() {
  cached = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }

  notify();
}

/** The saved location right now, outside React (e.g. to prefill a form's first state). */
export function getServiceLocation(): ServiceLocation | null {
  return typeof window === 'undefined' ? null : read();
}

/** The saved location, or null (always null while pre-rendering). */
export function useServiceLocation(): ServiceLocation | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/* ── The location picker ─────────────────────────────────────────────── */

export interface PickerRequest {
  /** Where to go once a served location is chosen ("/book?service=AC"), if anywhere. */
  then?: string;
  /** Opened by the site rather than the customer: offer "Skip for now". */
  automatic?: boolean;
}

let picker: PickerRequest | null = null;
const pickerListeners = new Set<Listener>();

export function openLocationPicker(request: PickerRequest = {}) {
  picker = request;
  pickerListeners.forEach((listener) => listener());
}

export function closeLocationPicker() {
  picker = null;
  pickerListeners.forEach((listener) => listener());
}

export function useLocationPicker(): PickerRequest | null {
  return useSyncExternalStore(
    (listener) => {
      pickerListeners.add(listener);
      return () => pickerListeners.delete(listener);
    },
    () => picker,
    () => null,
  );
}

/** Ask once per visit at most, and never again once a location is saved. */
export function promptForLocationOnce() {
  if (read()) return;
  try {
    if (window.sessionStorage.getItem(PROMPTED_KEY)) return;
    window.sessionStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    // Storage blocked: ask anyway.
  }

  openLocationPicker({ automatic: true });
}
