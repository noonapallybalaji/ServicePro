import type { SlotId } from './slots';

export const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

/** A point reported by the customer's device ("Use my current location"). */
export interface Pin {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in metres, as reported by the device. */
  accuracy: number;
}

export interface BookingAddress {
  label: AddressLabel;
  /** House / flat / floor number */
  line1: string;
  /** Building, apartment or street */
  line2: string;
  locality: string;
  landmark: string;
  city: string;
  pincode: string;
  pin: Pin | null;
}

export interface Draft extends BookingAddress {
  categoryId: string;
  issueTypeId: string;
  description: string;
  date: string;
  slot: SlotId | '';
  fullName: string;
  phone: string;
  /** Remember this address on this device for the next booking. */
  rememberAddress: boolean;
}

export const EMPTY_DRAFT: Draft = {
  categoryId: '',
  issueTypeId: '',
  description: '',
  label: 'Home',
  line1: '',
  line2: '',
  locality: '',
  landmark: '',
  city: '',
  pincode: '',
  pin: null,
  date: '',
  slot: '',
  fullName: '',
  phone: '',
  rememberAddress: true,
};

export const addressOneLine = (a: Pick<BookingAddress, 'line1' | 'line2' | 'locality' | 'city' | 'pincode'>): string =>
  [a.line1, a.line2, a.locality, a.city, a.pincode].filter((part) => part.trim()).join(', ');

/* ── Saved on this device ─────────────────────────────────────────────── */

const STORAGE_KEY = 'servicepro.saved-address.v1';

/** The address from the last booking on this device, if the customer chose to keep it. */
export function loadSavedAddress(): BookingAddress | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<BookingAddress>;
    if (!saved.line1 || !saved.pincode || !saved.locality || !saved.city) return null;
    return {
      label: ADDRESS_LABELS.includes(saved.label as AddressLabel) ? (saved.label as AddressLabel) : 'Home',
      line1: saved.line1,
      line2: saved.line2 ?? '',
      locality: saved.locality,
      landmark: saved.landmark ?? '',
      city: saved.city,
      pincode: saved.pincode,
      pin: saved.pin && Number.isFinite(saved.pin.latitude) && Number.isFinite(saved.pin.longitude) ? saved.pin : null,
    };
  } catch {
    return null; // private mode, blocked storage or a corrupt value
  }
}

export function saveAddress(address: BookingAddress) {
  try {
    const { label, line1, line2, locality, landmark, city, pincode, pin } = address;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ label, line1, line2, locality, landmark, city, pincode, pin }));
  } catch {
    // Remembering the address is a convenience; booking already succeeded.
  }
}

export function forgetSavedAddress() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
