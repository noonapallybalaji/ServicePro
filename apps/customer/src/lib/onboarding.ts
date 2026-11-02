import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/** Whether this phone has seen the welcome screens (null while it's being read at start-up). */

const KEY = 'pakkafix.customer.welcomed';
let welcomed: boolean | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

void SecureStore.getItemAsync(KEY)
  .then((value) => {
    welcomed = value === '1';
    emit();
  })
  .catch(() => {
    welcomed = false;
    emit();
  });

export function markWelcomed() {
  welcomed = true;
  emit();
  void SecureStore.setItemAsync(KEY, '1').catch(() => undefined);
}

export function useWelcomed(): boolean | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => welcomed,
  );
}
