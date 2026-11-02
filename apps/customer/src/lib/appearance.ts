import { reloadAppAsync } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';

import { isDark, THEME_KEY, themePreference, type ThemePreference } from './theme';

/** Saves the customer's choice and restarts the app in it (styles are built at start-up). */
export function setThemePreference(next: ThemePreference) {
  if (next === themePreference) return;
  try {
    SecureStore.setItem(THEME_KEY, next);
  } catch {
    return;
  }
  void reloadAppAsync('Appearance changed');
}

/** The sun / moon button on home: switch to the other look and keep it as the choice. */
export function toggleTheme() {
  setThemePreference(isDark ? 'light' : 'dark');
}

/** Following the phone: if its scheme changed while the app was away, restart in the new one. */
export function followSystemScheme() {
  if (themePreference !== 'system') return;
  const systemDark = Appearance.getColorScheme() === 'dark';
  if (systemDark !== isDark) void reloadAppAsync('System appearance changed');
}
