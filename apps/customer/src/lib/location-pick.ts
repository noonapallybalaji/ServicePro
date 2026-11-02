import { router } from 'expo-router';

/** A point chosen on the map, with the PIN code and area the API found for it. */
export interface PickedLocation {
  latitude: number;
  longitude: number;
  pincode: string;
  locality: string;
}

let pending: ((picked: PickedLocation) => void) | null = null;

/** Opens the map picker; `onPick` runs when the customer taps "Use this location". */
export function pickOnMap(onPick: (picked: PickedLocation) => void) {
  pending = onPick;
  router.push('/location?for=pick');
}

/** Called by the picker. Returns false when nobody asked (the picker then sets the service area). */
export function deliverPick(picked: PickedLocation): boolean {
  if (!pending) return false;
  pending(picked);
  pending = null;
  return true;
}

export const isPicking = () => pending !== null;
