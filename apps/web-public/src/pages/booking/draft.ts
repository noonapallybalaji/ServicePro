
export const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

/** A point reported by the customer's device ("Detect my location" / "Use my current location"). */
export interface Pin {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in metres, as reported by the device. */
  accuracy: number;
}

export interface BookingAddress {
  label: AddressLabel;
  /** House / flat / floor number (optional: the technician has the pin and calls). */
  line1: string;
  /** Building, apartment or street */
  line2: string;
  locality: string;
  landmark: string;
  city: string;
  pincode: string;
  pin: Pin | null;
}

/**
 * What the customer fills in: the appliance, where, and who to call, plus an optional note about
 * the problem. No time: the office agrees the date.
 */
export interface Draft extends BookingAddress {
  categoryId: string;
  /** Optional, in the customer's words; without it the technician finds the fault on the visit. */
  problem: string;
  fullName: string;
  phone: string;
  // Optional details for the technician.
  accessNotes: string;
  someoneElse: boolean;
  contactName: string;
  contactPhone: string;
}

export const EMPTY_DRAFT: Draft = {
  categoryId: '',
  problem: '',
  label: 'Home',
  line1: '',
  line2: '',
  locality: '',
  landmark: '',
  city: '',
  pincode: '',
  pin: null,
  fullName: '',
  phone: '',
  accessNotes: '',
  someoneElse: false,
  contactName: '',
  contactPhone: '',
};

export const addressOneLine = (a: Pick<BookingAddress, 'line1' | 'line2' | 'locality' | 'city' | 'pincode'>): string =>
  [a.line1, a.line2, a.locality, a.city, a.pincode].filter((part) => part.trim()).join(', ');

/* ── Old device storage ───────────────────────────────────────────────── */

// Earlier versions remembered the last address in the browser; addresses now live in the account.
const STORAGE_KEY = 'servicepro.saved-address.v1';

/** Clears an address an earlier version left in this browser. */
export function forgetSavedAddress() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
