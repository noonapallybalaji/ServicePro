import { Outlet, ScrollRestoration, type RouteObject } from 'react-router';

import { SERVICES } from './content/services';
import { HomePage } from './pages/home-page';
import { AboutPage, ContactPage, FaqPage, NotFoundPage, ServicesPage } from './pages/info-pages';
import { PrivacyPage, RefundPolicyPage, TermsPage } from './pages/legal-pages';
import { ServicePage } from './pages/service-page';

/*
 * One route table for the browser and the build-time pre-renderer.
 * Content pages are bundled eagerly (they are pre-rendered and hydrated); the booking flow and
 * the private tracking page are split into their own chunks so landing visitors never load them.
 */
export const routes: RouteObject[] = [
  {
    element: (
      <>
        <ScrollRestoration />
        <Outlet />
      </>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/services', element: <ServicesPage /> },
      ...SERVICES.map((service) => ({ path: `/${service.slug}`, element: <ServicePage slug={service.slug} /> })),
      { path: '/about', element: <AboutPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/faq', element: <FaqPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/cancellation-and-refunds', element: <RefundPolicyPage /> },
      {
        path: '/book',
        lazy: async () => {
          const [{ BookingPage }, { withQueryClient }] = await Promise.all([import('./pages/booking/booking-page'), import('./query')]);
          return { Component: withQueryClient(BookingPage) };
        },
      },
      {
        path: '/account',
        lazy: async () => {
          const [{ AccountPage }, { withQueryClient }] = await Promise.all([import('./pages/account/account-page'), import('./query')]);
          return { Component: withQueryClient(AccountPage) };
        },
      },
      {
        path: '/t/:token',
        lazy: async () => {
          const [{ TrackingPage }, { withQueryClient }] = await Promise.all([import('./pages/tracking-page'), import('./query')]);
          return { Component: withQueryClient(TrackingPage) };
        },
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
