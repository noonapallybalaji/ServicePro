import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/*
 * The area the customer wants service in (their PIN code and place), chosen on the home screen and
 * used to prefill the booking. Remembered on the phone between visits.
 */

export interface ServiceArea {
  pincode: string;
  place: string;
}

const KEY = 'pakkafix.customer.area';
let area: ServiceArea | null = null;
const listeners = new Set<() => void>();

void SecureStore.getItemAsync(KEY)
  .then((saved) => {
    if (saved && !area) {
      area = JSON.parse(saved) as ServiceArea;
      listeners.forEach((listener) => listener());
    }
  })
  .catch(() => undefined);

export function setServiceArea(next: ServiceArea) {
  area = next;
  listeners.forEach((listener) => listener());
  void SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
}

export function useServiceArea(): ServiceArea | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => area,
  );
}
