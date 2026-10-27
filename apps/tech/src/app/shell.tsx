import { getListMyJobsQueryKey, getListMyOffersQueryKey, useGetMyTechnicianProfile, useListMyJobs, useListMyOffers, useRealtime, useSession } from '@servicepro/api-client';
import { AppShell, Avatar, BottomNavItem, Badge, BrandLockup, BrandMark, SidebarNavItem, StatusDot, Text, toast } from '@servicepro/ui';
import { CalendarCheck, Inbox, Navigation, UserRound, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

import { LocationSharingContext, useShareLocation } from '../lib/location';
import { paths } from './paths';

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
}

/**
 * Technician shell (UX-ARCHITECTURE.md §3.2): Today · Offers · Earnings · Profile.
 * Bottom bar on phones, brand sidebar on desktop; pages lay out in columns from `lg`.
 */
export function TechShell() {
  const { session } = useSession();
  const offers = useListMyOffers({ query: { refetchInterval: 60_000 } });
  // Location is shared from here, on every screen: while on duty for the office, and more often on the
  // way to a customer (who then sees it too). Never off duty.
  const jobs = useListMyJobs({ query: { enabled: Boolean(session), refetchInterval: 60_000 } });
  const profile = useGetMyTechnicianProfile({ query: { enabled: Boolean(session), refetchInterval: 60_000 } });
  const enRoute = (jobs.data?.active ?? []).some((job) => job.status === 'EN_ROUTE');
  const onDuty = profile.data?.dutyStatus === 'AVAILABLE' || profile.data?.dutyStatus === 'ON_JOB';
  const sharing = useShareLocation(enRoute ? 'enroute' : onDuty ? 'duty' : 'off');

  const health = useRealtime({
    hub: '/hubs/tech',
    enabled: Boolean(session),
    invalidate: {
      offerReceived: [getListMyOffersQueryKey()[0]],
      offerResolved: [getListMyOffersQueryKey()[0], getListMyJobsQueryKey()[0]],
      // A job's estimates and bill live under /service-requests/{id}: refresh them too (an approval moves the job).
      jobChanged: [getListMyJobsQueryKey()[0], '/api/v1/service-requests/'],
    },
    onMessage: (message) => {
      if (message === 'offerReceived') {
        navigator.vibrate?.([200, 100, 200]);
        toast.info('New job offer', { description: 'Open Offers to accept it before it expires.' });
      }
    },
  });

  const nav: NavEntry[] = [
    { to: paths.today, label: 'Today', icon: <CalendarCheck aria-hidden />, end: true },
    { to: paths.offers, label: 'Offers', icon: <Inbox aria-hidden />, badge: offers.data?.length ?? 0 },
    { to: paths.earnings, label: 'Earnings', icon: <Wallet aria-hidden /> },
    { to: paths.profile, label: 'Profile', icon: <UserRound aria-hidden /> },
  ];

  return (
    <AppShell
      header={
        <div className="mx-auto flex h-header w-full max-w-wide items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
          <span className="flex items-center gap-2 lg:hidden">
            <BrandMark className="size-8" />
            <span className="text-h3 text-foreground">ServicePro</span>
          </span>
          <span className="max-lg:hidden" />
          <div className="flex items-center gap-3">
            {sharing === 'sharing' ? (
              <Badge tone="info" size="sm" role="status">
                <Navigation aria-hidden className="size-3" /> Sharing location
              </Badge>
            ) : null}
            {health !== 'live' ? (
              <Badge tone="warning" size="sm" role="status">
                <StatusDot colorClass="bg-warning" />
                {health === 'reconnecting' || health === 'connecting' ? 'Reconnecting…' : 'Offline'}
              </Badge>
            ) : (
              <Badge tone="success" size="sm" appearance="outline" className="max-sm:hidden">
                <StatusDot colorClass="bg-success" live />
                Live
              </Badge>
            )}
            {session ? (
              <span className="flex items-center gap-2">
                <Avatar name={session.user.fullName} size="sm" />
                <span className="text-sm font-semibold text-foreground max-md:hidden">{session.user.fullName}</span>
              </span>
            ) : null}
          </div>
        </div>
      }
      sidebar={
        <div className="flex flex-1 flex-col gap-8 px-4 py-6">
          <BrandLockup tagline="Technician app" className="px-2" />
          <nav aria-label="Main">
            <ul className="flex flex-col gap-1">
              {nav.map((item) => (
                <SidebarNavItem key={item.to} asChild icon={item.icon} label={item.label} badge={item.badge}>
                  <NavLink to={item.to} end={item.end} />
                </SidebarNavItem>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex flex-col gap-1 rounded-card bg-nav-hover p-4">
            <Text variant="sm" weight="semibold">
              Need help on a job?
            </Text>
            <Text variant="caption" tone="muted">
              Call the office from the job screen — they can see what you see.
            </Text>
          </div>
        </div>
      }
      bottomNav={nav.map((item) => (
        <BottomNavItem key={item.to} asChild icon={item.icon} label={item.label} badge={item.badge}>
          <NavLink to={item.to} end={item.end} />
        </BottomNavItem>
      ))}
    >
      <div className="mx-auto w-full max-w-wide px-4 py-6 md:px-6 lg:px-8 lg:py-8">
        <LocationSharingContext value={sharing}>
          <Outlet />
        </LocationSharingContext>
      </div>
    </AppShell>
  );
}
