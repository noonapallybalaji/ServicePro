import { RequireSession, RouteError } from '@servicepro/app-kit';
import { createBrowserRouter } from 'react-router';

import { ApplicationStatusPage } from '../features/auth/application-status-page';
import { JoinPage } from '../features/auth/join-page';
import { LoginPage } from '../features/auth/login-page';
import { EarningsPage } from '../features/earnings/earnings-page';
import { JobPage } from '../features/jobs/job-page';
import { OffersPage } from '../features/offers/offers-page';
import { ProfilePage } from '../features/profile/profile-page';
import { TodayPage } from '../features/today/today-page';
import { paths } from './paths';
import { TechShell } from './shell';

export const router = createBrowserRouter([
  { path: paths.login, element: <LoginPage />, errorElement: <RouteError /> },
  { path: paths.join, element: <JoinPage />, errorElement: <RouteError /> },
  { path: paths.joinStatus, element: <ApplicationStatusPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireSession roles={['TECHNICIAN']} loginPath={paths.login}>
        <TechShell />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'offers', element: <OffersPage /> },
      { path: 'jobs/:jobId', element: <JobPage /> },
      { path: 'earnings', element: <EarningsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <RouteError /> },
    ],
  },
]);
