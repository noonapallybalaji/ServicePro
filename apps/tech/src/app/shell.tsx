import { getListMyJobsQueryKey, getListMyOffersQueryKey, useListMyOffers, useRealtime, useSession } from '@servicepro/api-client';
import { AppShell, BottomNavItem, Badge, SidebarNavItem, StatusDot, toast } from '@servicepro/ui';
import { CalendarCheck, Inbox, UserRound, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

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
 * Bottom bar on phones, sidebar on bigger screens; content stays a phone-width column.
 */
export function TechShell() {
  const { session } = useSession();
  const offers = useListMyOffers({ query: { refetchInterval: 60_000 } });

  const health = useRealtime({
    hub: '/hubs/tech',
    enabled: Boolean(session),
    invalidate: {
      offerReceived: [getListMyOffersQueryKey()[0]],
      offerResolved: [getListMyOffersQueryKey()[0], getListMyJobsQueryKey()[0]],
      jobChanged: [getListMyJobsQueryKey()[0]],
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
        <div className="mx-auto flex h-header w-full max-w-prose items-center justify-between gap-3 px-4">
          <span className="text-h3 text-foreground">ServicePro</span>
          {health !== 'live' ? (
            <Badge tone="warning" size="sm" role="status">
              <StatusDot colorClass="bg-warning" />
              {health === 'reconnecting' || health === 'connecting' ? 'Reconnecting…' : 'Offline'}
            </Badge>
          ) : null}
        </div>
      }
      sidebar={
        <nav aria-label="Main" className="flex flex-col gap-6 px-4 py-6">
          <span className="px-3 text-h3 text-foreground">ServicePro</span>
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <SidebarNavItem key={item.to} asChild icon={item.icon} label={item.label} badge={item.badge}>
                <NavLink to={item.to} end={item.end} />
              </SidebarNavItem>
            ))}
          </ul>
        </nav>
      }
      bottomNav={nav.map((item) => (
        <BottomNavItem key={item.to} asChild icon={item.icon} label={item.label} badge={item.badge}>
          <NavLink to={item.to} end={item.end} />
        </BottomNavItem>
      ))}
    >
      <div className="mx-auto w-full max-w-prose px-4 py-6">
        <Outlet />
      </div>
    </AppShell>
  );
}
