import './styles.css';

import { configureRealtimeBaseUrl } from '@servicepro/api-client';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { startCustomerSession } from './customer-session';
import { routes } from './routes';

/*
 * Customer site: landing and service pages, online booking and tracking. Content pages are
 * pre-rendered at build time (scripts/prerender.mjs) and hydrated here; booking and tracking
 * render in the browser. Kept separate from staff apps so ad traffic never downloads staff code
 * (PLAN.md §6.1).
 */
const router = createBrowserRouter(routes);
// Live tracking updates go straight to the API where the host can't proxy WebSockets (see render.yaml).
configureRealtimeBaseUrl(import.meta.env.VITE_REALTIME_URL);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// Pre-rendered pages arrive with markup to hydrate; the app shell (booking, tracking) is empty.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}

// After the first render, so pre-rendered markup hydrates against the same (unknown) session state.
startCustomerSession();
