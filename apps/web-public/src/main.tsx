import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { BookingPage } from './pages/booking/booking-page';
import { HomePage } from './pages/home-page';
import { TrackingPage } from './pages/tracking-page';

/*
 * Customer site: landing page, online booking and tracking. The AI qualification call joins the
 * booking flow in Phase 2 (PLAN.md §16). Kept separate from staff apps so ad traffic never
 * downloads staff code (PLAN.md §6.1).
 */
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/book', element: <BookingPage /> },
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
