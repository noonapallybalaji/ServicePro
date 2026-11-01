import './styles.css';

import { AppProviders } from '@servicepro/app-kit';
import { configureRealtimeBaseUrl } from '@servicepro/api-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { router } from './app/router';
import { AppUpdatePrompt } from './native/app-update';
import { nativeAppReady, startNativeApp } from './native/native-app';

// Live updates go straight to the API where the host can't proxy WebSockets (see render.yaml).
configureRealtimeBaseUrl(import.meta.env.VITE_REALTIME_URL);
// Inside the Android / iOS app: API address, secure sign-in storage, back button.
startNativeApp();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
      <AppUpdatePrompt />
    </AppProviders>
  </StrictMode>,
);
requestAnimationFrame(nativeAppReady);
