import { apiFetch, useSession, type CustomerNotificationResponse, type CustomerNotificationsResponse } from '@servicepro/api-client';
import { Button, cn } from '@servicepro/ui';
import { Bell, BellRing, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { customerFrom } from '../customer-session';
import {
  devicePermission,
  needsHomeScreen,
  requestDevicePermission,
  resumeDeviceNotifications,
  showDeviceNotification,
  type DevicePermission,
} from '../notifications/device-notifications';

/** How often the feed is checked while the site is open and visible. */
const POLL_MS = 60_000;
const FEED = '/api/v1/account/notifications';

/** Earlier versions kept read state in the browser; it now lives on the server. */
function forgetOldReadState() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('servicepro.notifications-seen.'))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

type Feed = { owner: string; data: CustomerNotificationsResponse };

/*
 * Kept outside the component: the header is rebuilt on every page, and the bell must keep what it knows
 * (including items just marked read) instead of flashing back to the last server copy.
 */
let lastFeed: Feed | null = null;
const pendingRead = new Set<string>();
let pendingReadAll = false;

/** The server's list with reads still in flight applied, so a slow request never shows an item as unread again. */
function withPending(data: CustomerNotificationsResponse): CustomerNotificationsResponse {
  if (!pendingReadAll && pendingRead.size === 0) return data;
  const items = data.items.map((n) => (pendingReadAll || pendingRead.has(n.id) ? { ...n, isRead: true } : n));
  return { items, unreadCount: items.filter((n) => !n.isRead).length };
}

const linkFor = (n: CustomerNotificationResponse) => (n.serviceRequestId ? `/account/bookings/${n.serviceRequestId}` : '/account');

/**
 * The signed-in customer's updates (what we sent them on WhatsApp/SMS) with read state from the
 * server, so it's the same on every device. Checked every minute while the site is open; new unread
 * ones also go to the device tray when the customer allowed it and the tab is hidden.
 */
function useFeed(customerId: string | null) {
  // Tagged with whose feed it is, so signing out or switching account never shows the old list.
  const [feed, setFeedState] = useState<Feed | null>(() => lastFeed);
  const setFeed = useCallback((next: Feed | null | ((current: Feed | null) => Feed | null)) => {
    setFeedState((current) => {
      lastFeed = typeof next === 'function' ? next(current) : next;
      return lastFeed;
    });
  }, []);
  const [failed, setFailed] = useState(false);
  const known = useRef<Set<string> | null>(null);

  const apply = useCallback(
    (fresh: CustomerNotificationsResponse) => {
      if (!customerId) return;
      const data = withPending(fresh);
      // Only messages that arrived since the last check, never the backlog on first load.
      if (known.current && document.hidden) {
        for (const n of data.items.filter((x) => !x.isRead && !known.current?.has(x.id)).slice(0, 3)) {
          void showDeviceNotification({ id: n.id, title: n.title, body: n.body, url: linkFor(n) });
        }
      }
      known.current = new Set(data.items.map((n) => n.id));
      setFeed({ owner: customerId, data });
      setFailed(false);
    },
    [customerId, setFeed],
  );

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      apply(await apiFetch<CustomerNotificationsResponse>(`${FEED}?take=30`));
    } catch {
      setFailed(true);
    }
  }, [customerId, apply]);

  /** Marks one item read (or all, with no id): updated on screen at once, then confirmed by the server. */
  const markRead = useCallback(
    async (id?: string) => {
      if (!customerId) return;
      if (id) pendingRead.add(id);
      else pendingReadAll = true;
      setFeed((current) => (current && current.owner === customerId ? { owner: customerId, data: withPending(current.data) } : current));
      try {
        const confirmed = await apiFetch<CustomerNotificationsResponse>(id ? `${FEED}/${id}/read` : `${FEED}/read-all`, { method: 'POST' });
        if (id) pendingRead.delete(id);
        else pendingReadAll = false;
        apply(confirmed);
      } catch {
        if (id) pendingRead.delete(id);
        else pendingReadAll = false;
        void load(); // put the real state back
      }
    },
    [customerId, apply, load, setFeed],
  );

  useEffect(() => {
    known.current = null;
    if (!customerId) return;
    forgetOldReadState();
    resumeDeviceNotifications();
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [customerId, load]);

  const data = feed && feed.owner === customerId ? feed.data : null;
  return { items: data?.items ?? null, unread: data?.unreadCount ?? 0, failed, reload: load, markRead };
}

export function NotificationBell() {
  const sessionState = useSession();
  const customer = customerFrom(sessionState);
  const restoring = sessionState.status === 'unknown';
  const customerId = customer?.id ?? null;
  const { items, unread, failed, reload, markRead } = useFeed(customerId);
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  // Read when the panel first opens (the panel isn't in the pre-rendered HTML).
  const [permission, setPermission] = useState<DevicePermission>(devicePermission);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on Escape or a tap outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onPointer = (event: PointerEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the list only refreshes it; items stay unread until opened or "Mark all as read".
    if (next) void reload();
  }

  async function turnOn() {
    setPermission(await requestDevicePermission());
  }

  const shown = (items ?? []).filter((n) => !onlyUnread || !n.isRead);
  const tabs = [
    { unreadOnly: false, label: 'All' },
    { unreadOnly: true, label: unread > 0 ? `Unread (${unread})` : 'Unread' },
  ];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="transition-interactive relative flex size-10 items-center justify-center rounded-full text-foreground-secondary hover:bg-surface-sunken hover:text-foreground [&_svg]:size-5"
      >
        <Bell aria-hidden />
        {unread > 0 ? (
          <span aria-hidden className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-caption leading-none font-bold text-accent-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'z-(--z-overlay) flex flex-col overflow-hidden border border-border bg-surface shadow-lg',
            // Phones: full width under the header. Larger screens: a panel under the bell.
            'max-sm:fixed max-sm:inset-x-2 max-sm:top-[calc(var(--header-height)+0.5rem)] max-sm:rounded-card',
            'sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:w-96 sm:rounded-card',
            'max-h-[min(32rem,calc(100dvh-var(--header-height)-6rem))]',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="font-semibold text-foreground">Notifications</span>
            <span className="flex items-center gap-2">
              {customer && unread > 0 ? (
                <button type="button" onClick={() => void markRead()} className="link text-sm">
                  Mark all as read
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="transition-interactive rounded-control p-1 text-foreground-muted hover:text-foreground">
                <X aria-hidden className="size-4" />
              </button>
            </span>
          </div>

          {restoring ? (
            <p className="p-4 text-sm text-foreground-secondary">Loading…</p>
          ) : !customer ? (
            <div className="flex flex-col items-start gap-3 p-4">
              <p className="text-sm text-foreground-secondary">Sign in to see updates about your bookings: confirmations, your technician, bills and more.</p>
              <Button asChild size="sm">
                <Link to="/account" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <DeviceBanner permission={permission} onTurnOn={() => void turnOn()} />
              {(items ?? []).length > 0 ? (
                <div role="tablist" aria-label="Show" className="flex gap-1 border-b border-border px-3 py-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.label}
                      type="button"
                      role="tab"
                      aria-selected={onlyUnread === tab.unreadOnly}
                      onClick={() => setOnlyUnread(tab.unreadOnly)}
                      className={cn(
                        'transition-interactive rounded-pill px-3 py-1 text-caption font-semibold',
                        onlyUnread === tab.unreadOnly ? 'bg-primary text-primary-foreground' : 'text-foreground-secondary hover:bg-surface-sunken',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {items === null && !failed ? (
                  <p className="p-4 text-sm text-foreground-secondary">Loading…</p>
                ) : failed && !items ? (
                  <div className="flex flex-col items-start gap-2 p-4">
                    <p className="text-sm text-foreground-secondary">Couldn't load your notifications.</p>
                    <Button size="sm" variant="outline" onClick={() => void reload()}>
                      Try again
                    </Button>
                  </div>
                ) : (items ?? []).length === 0 ? (
                  <p className="p-4 text-sm text-foreground-secondary">No notifications yet. Updates about your bookings will appear here.</p>
                ) : shown.length === 0 ? (
                  <p className="p-4 text-sm text-foreground-secondary">You're all caught up.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {shown.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.isRead) void markRead(n.id);
                            setOpen(false);
                            void navigate(linkFor(n));
                          }}
                          className={cn('transition-interactive flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-sunken', !n.isRead && 'bg-primary-subtle')}
                        >
                          <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-accent')} />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={cn('text-sm text-foreground', n.isRead ? 'font-medium' : 'font-bold')}>
                                {n.title}
                                {n.isRead ? null : <span className="sr-only"> (unread)</span>}
                              </span>
                              <span className="shrink-0 text-caption text-foreground-muted">{timeAgo(n.createdAt)}</span>
                            </span>
                            <span className={cn('line-clamp-2 text-caption', n.isRead ? 'text-foreground-muted' : 'text-foreground-secondary')}>{n.body}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Asks for device notifications only when the customer taps the button. */
function DeviceBanner({ permission, onTurnOn }: { permission: DevicePermission; onTurnOn: () => void }) {
  if (permission === 'granted') return null;
  if (permission === 'unsupported') {
    return needsHomeScreen() ? (
      <p className="border-b border-border bg-surface-sunken px-4 py-2 text-caption text-foreground-secondary">
        To get notifications on this iPhone, add this site to your Home Screen (Share → Add to Home Screen) and open it from there.
      </p>
    ) : null;
  }
  if (permission === 'denied') {
    return (
      <p className="border-b border-border bg-surface-sunken px-4 py-2 text-caption text-foreground-secondary">
        Notifications are blocked for this site. To get them, allow notifications in your browser's site settings.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 border-b border-border bg-primary-subtle px-4 py-3">
      <BellRing aria-hidden className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-caption text-foreground">Get these updates on this device, even when you're on another tab.</p>
      <Button size="sm" onClick={onTurnOn}>
        Turn on
      </Button>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
