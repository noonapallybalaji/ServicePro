import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { HomePage } from './pages/home-page';
import { TrackingPage } from './pages/tracking-page';

/*
 * Customer site. Phase 1 ships the tracking page only (PLAN.md §16); the landing pages and
 * request flow arrive with AI intake in Phase 2. Kept separate from staff apps so ad traffic
 * never downloads staff code (PLAN.md §6.1).
 */
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/t/:token', element: <TrackingPage /> },
  { path: '*', element: <HomePage /> },
]);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
