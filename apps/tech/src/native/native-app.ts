import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { configureApiBaseUrl, configureNativeApp, configureRealtimeBaseUrl } from '@servicepro/api-client';

/*
 * Running inside the Android / iOS app (Capacitor) rather than a browser. The app loads from its
 * own origin, so the API is called by its full address, and the sign-in is kept in the device's
 * Keychain / Keystore instead of a cookie.
 */

export const isNativeApp = Capacitor.isNativePlatform();

const REFRESH_TOKEN_KEY = 'refresh-token';

/** Before the first render. */
export function startNativeApp() {
  if (!isNativeApp) return;

  configureApiBaseUrl(import.meta.env.VITE_API_URL);
  configureRealtimeBaseUrl(import.meta.env.VITE_REALTIME_URL || import.meta.env.VITE_API_URL);
  // Every read and write waits for the key prefix, so the first restore finds the stored sign-in.
  const ready = SecureStorage.setKeyPrefix('pakkafix.partner.');
  configureNativeApp({
    get: () => ready.then(() => SecureStorage.getItem(REFRESH_TOKEN_KEY)),
    set: (token) => ready.then(() => SecureStorage.setItem(REFRESH_TOKEN_KEY, token)),
    clear: () => ready.then(() => SecureStorage.removeItem(REFRESH_TOKEN_KEY)),
  });

  void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);

  // Android back button: back through the app's screens; on the first screen, leave the app
  // running in the background (location sharing continues) instead of closing it.
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}

/** Once the first screen has rendered. */
export function nativeAppReady() {
  if (isNativeApp) void SplashScreen.hide();
}
