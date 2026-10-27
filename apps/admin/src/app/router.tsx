import { RequireSession, RouteError } from '@servicepro/app-kit';
import type { ComponentType } from 'react';
import { createBrowserRouter, type LazyRouteFunction, type RouteObject } from 'react-router';

import { LoginPage } from '../features/auth/login-page';
import { AdminShell } from './shell';

export const STAFF_ROLES = ['OWNER', 'ADMIN', 'DISPATCHER'] as const;

/** Route-level code splitting: each screen downloads only when first visited. */
function page<TModule>(load: () => Promise<TModule>, pick: (module: TModule) => ComponentType): LazyRouteFunction<RouteObject> {
  return async () => ({ Component: pick(await load()) });
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    // Internal visual source of truth (COMPONENT-ARCHITECTURE.md §5), staff only.
    path: '/design-system',
    lazy: async () => {
      const { DesignSystemPage } = await import('../features/design-system/design-system-page');
      return {
        Component: () => (
          <RequireSession roles={STAFF_ROLES} loginPath="/login">
            <DesignSystemPage />
          </RequireSession>
        ),
      };
    },
  },
  {
    path: '/',
    element: (
      <RequireSession roles={STAFF_ROLES} loginPath="/login">
        <AdminShell />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import('../features/dashboard/dashboard-page'), (m) => m.DashboardPage) },
      { path: 'requests', lazy: page(() => import('../features/requests/requests-page'), (m) => m.RequestsPage) },
      { path: 'requests/new', lazy: page(() => import('../features/requests/new-request-page'), (m) => m.NewRequestPage) },
      { path: 'requests/:requestId', lazy: page(() => import('../features/requests/request-detail-page'), (m) => m.RequestDetailPage) },
      { path: 'dispatch', lazy: page(() => import('../features/dispatch/dispatch-page'), (m) => m.DispatchPage) },
      { path: 'live-map', lazy: page(() => import('../features/technicians/live-map-page'), (m) => m.LiveMapPage) },
      { path: 'technicians', lazy: page(() => import('../features/technicians/technicians-page'), (m) => m.TechniciansPage) },
      { path: 'technicians/new', lazy: page(() => import('../features/technicians/new-technician-page'), (m) => m.NewTechnicianPage) },
      { path: 'technicians/:technicianId', lazy: page(() => import('../features/technicians/technician-detail-page'), (m) => m.TechnicianDetailPage) },
      { path: 'customers', lazy: page(() => import('../features/customers/customers-page'), (m) => m.CustomersPage) },
      { path: 'customers/new', lazy: page(() => import('../features/customers/new-customer-page'), (m) => m.NewCustomerPage) },
      { path: 'customers/:customerId', lazy: page(() => import('../features/customers/customer-detail-page'), (m) => m.CustomerDetailPage) },
      { path: 'support', lazy: page(() => import('../features/support/support-page'), (m) => m.SupportPage) },
      { path: 'billing', lazy: page(() => import('../features/billing/billing-page'), (m) => m.BillingPage) },
      { path: 'settings', lazy: page(() => import('../features/settings/settings-page'), (m) => m.SettingsPage) },
      { path: '*', element: <RouteError /> },
    ],
  },
]);
