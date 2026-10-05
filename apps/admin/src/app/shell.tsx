import { session, useRealtime, useSession } from '@servicepro/api-client';
import {
  AppShell,
  Avatar,
  Badge,
  BottomNavItem,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  IconButton,
  Input,
  SidebarNavItem,
  StatusDot,
  Text,
} from '@servicepro/ui';
import {
  Gauge,
  LayoutList,
  LogOut,
  MoreHorizontal,
  ReceiptIndianRupee,
  Search,
  Send,
  Settings,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import { paths } from './paths';
import { LIVE_INVALIDATION } from './realtime';

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const OPERATE: NavEntry[] = [
  { to: paths.dashboard, label: 'Dashboard', icon: <Gauge aria-hidden />, end: true },
  { to: paths.requests, label: 'Service requests', icon: <LayoutList aria-hidden /> },
  { to: paths.dispatch, label: 'Dispatch', icon: <Send aria-hidden /> },
];

const MANAGE: NavEntry[] = [
  { to: paths.technicians, label: 'Technicians', icon: <Wrench aria-hidden /> },
  { to: paths.customers, label: 'Customers', icon: <Users aria-hidden /> },
  { to: paths.billing, label: 'Billing', icon: <ReceiptIndianRupee aria-hidden /> },
];

const SETTINGS: NavEntry = { to: paths.settings, label: 'Settings', icon: <Settings aria-hidden /> };

/**
 * Owner/dispatcher shell (UX-ARCHITECTURE.md §3.3): grouped sidebar on desktop; on phones a
 * bottom bar with the three operating views plus "More".
 */
export function AdminShell() {
  const { session: current } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const health = useRealtime({ hub: '/hubs/ops', enabled: Boolean(current), invalidate: LIVE_INVALIDATION });

  return (
    <AppShell
      header={<Header live={health} />}
      sidebar={
        <div className="flex h-full flex-col gap-6 px-4 py-6">
          <span className="px-3 text-h3 text-foreground">ServicePro</span>
          <nav aria-label="Main" className="flex flex-1 flex-col gap-6">
            <NavGroup title="Operate" items={OPERATE} />
            <NavGroup title="Manage" items={MANAGE} />
            <ul className="mt-auto flex flex-col gap-1">
              <SidebarNavItem asChild icon={SETTINGS.icon} label={SETTINGS.label}>
                <NavLink to={SETTINGS.to} />
              </SidebarNavItem>
            </ul>
          </nav>
        </div>
      }
      bottomNav={
        <>
          {OPERATE.map((item) => (
            <BottomNavItem key={item.to} asChild icon={item.icon} label={item.label === 'Service requests' ? 'Requests' : item.label}>
              <NavLink to={item.to} end={item.end} />
            </BottomNavItem>
          ))}
          <BottomNavItem icon={<MoreHorizontal aria-hidden />} label="More" href="#more" onClick={(event) => { event.preventDefault(); setMoreOpen(true); }} />
        </>
      }
    >
      <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent presentation="sheet">
          <DialogHeader title="More" />
          <DialogBody className="pb-4">
            <ul className="flex flex-col gap-1" onClickCapture={() => setMoreOpen(false)}>
              {[...MANAGE, SETTINGS].map((item) => (
                <SidebarNavItem key={item.to} asChild icon={item.icon} label={item.label} className="h-12">
                  <NavLink to={item.to} />
                </SidebarNavItem>
              ))}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function NavGroup({ title, items }: { title: string; items: NavEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="overline" tone="muted" className="px-3">
        {title}
      </Text>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <SidebarNavItem key={item.to} asChild icon={item.icon} label={item.label}>
            <NavLink to={item.to} end={item.end} />
          </SidebarNavItem>
        ))}
      </ul>
    </div>
  );
}

function Header({ live }: { live: ReturnType<typeof useRealtime> }) {
  const { session: current } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  /** One search box: an SR number opens the job; anything else searches customers. */
  function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    void navigate(/^sr-?\d+$/i.test(term) ? `${paths.requests}?sr=${encodeURIComponent(term.toUpperCase())}` : `${paths.customers}?search=${encodeURIComponent(term)}`);
    setQuery('');
  }

  return (
    <div className="flex h-header items-center gap-3 px-4 md:px-6 lg:px-8">
      <span className="text-h3 text-foreground lg:hidden">ServicePro</span>
      <form role="search" onSubmit={search} className="hidden max-w-md flex-1 md:block">
        <Input
          type="search"
          aria-label="Search by SR number, phone or customer name"
          placeholder="SR number, phone or customer name"
          leadingIcon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <div className="ml-auto flex items-center gap-3">
        {live === 'live' ? (
          <Badge tone="success" size="sm" appearance="outline" className="max-sm:hidden">
            <StatusDot colorClass="bg-success" live />
            Live
          </Badge>
        ) : (
          <Badge tone="warning" size="sm" role="status">
            <StatusDot colorClass="bg-warning" />
            {live === 'offline' ? 'Live updates paused' : 'Reconnecting…'}
          </Badge>
        )}
        {current ? (
          <div className="flex items-center gap-2">
            <Avatar name={current.user.fullName} size="sm" />
            <span className="max-md:hidden text-sm font-semibold text-foreground">{current.user.fullName}</span>
          </div>
        ) : (
          <UserRound aria-hidden className="size-5" />
        )}
        <IconButton icon={LogOut} label="Sign out" showTooltip onClick={() => void session.signOut()} />
      </div>
    </div>
  );
}
