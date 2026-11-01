import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The technician app as an Android / iOS app (Capacitor): the same web app, built with
 * `pnpm build:native` (API address from .env.native), inside a native shell with background
 * location and secure sign-in storage. Native projects: android/ and ios/.
 */
const config: CapacitorConfig = {
  appId: 'com.pakkafix.partner',
  appName: 'Pakka Fix Partner',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Hidden by the app once the first screen is ready (src/native/native-app.ts).
      launchAutoHide: false,
      backgroundColor: '#0a1f3c',
      showSpinner: false,
    },
  },
};

export default config;
