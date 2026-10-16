import './styles.css';

import { AppProviders } from '@servicepro/app-kit';
import { configureRealtimeBaseUrl } from '@servicepro/api-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { router } from './app/router';

// Live updates go straight to the API where the host can't proxy WebSockets (see render.yaml).
configureRealtimeBaseUrl(import.meta.env.VITE_REALTIME_URL);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
