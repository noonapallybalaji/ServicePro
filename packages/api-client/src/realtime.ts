import type { HubConnection } from '@microsoft/signalr';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { hubUrl } from './http';
import { session } from './session';

/**
 * SignalR messages are refetch signals (the server pushes "something changed", never data of
 * record). Each app maps messages to the query keys it should invalidate.
 */
export type RealtimeHub = '/hubs/ops' | '/hubs/tech';

export type RealtimeMessage = 'serviceRequestChanged' | 'technicianChanged' | 'jobChanged' | 'offerReceived' | 'offerResolved' | 'supportChanged';

export type ConnectionHealth = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** Loaded on first use, so pages without live updates (the public landing pages) don't download it. */
const loadSignalR = () => import('@microsoft/signalr');

function stop(connection: HubConnection | null) {
  if (connection && connection.state !== 'Disconnected') {
    void connection.stop();
  }
}

interface UseRealtimeOptions {
  hub: RealtimeHub;
  enabled: boolean;
  /** Query-key prefixes (the generated hooks' URL keys) to invalidate per message. */
  invalidate: Partial<Record<RealtimeMessage, readonly string[]>>;
  /** Optional side effect per message, e.g. vibrate on a new offer. */
  onMessage?: (message: RealtimeMessage, payload: unknown) => void;
}

export function useRealtime({ hub, enabled, invalidate, onMessage }: UseRealtimeOptions): ConnectionHealth {
  const queryClient = useQueryClient();
  const [health, setHealth] = useState<ConnectionHealth>('connecting');

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let connection: HubConnection | null = null;
    void loadSignalR()
      .then(({ HubConnectionBuilder, LogLevel }) => {
        if (cancelled) return;
        const live = new HubConnectionBuilder()
          .withUrl(hubUrl(hub), { accessTokenFactory: () => session.getAccessToken() ?? '' })
          .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
          .configureLogging(LogLevel.Warning)
          .build();
        connection = live;

        for (const [message, prefixes] of Object.entries(invalidate) as [RealtimeMessage, readonly string[]][]) {
          live.on(message, (payload: unknown) => {
            for (const prefix of prefixes) {
              void queryClient.invalidateQueries({
                predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith(prefix),
              });
            }

            onMessage?.(message, payload);
          });
        }

        live.onreconnecting(() => setHealth('reconnecting'));
        live.onreconnected(() => {
          setHealth('live');
          // Anything may have changed while we were away.
          void queryClient.invalidateQueries();
        });
        live.onclose(() => setHealth('offline'));
        return live.start().then(() => !cancelled && setHealth('live'));
      })
      .catch(() => !cancelled && setHealth('offline'));

    return () => {
      cancelled = true;
      stop(connection);
    };
    // The invalidation map is static per app; reconnect only when the hub or auth changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, enabled, queryClient]);

  return enabled ? health : 'offline';
}

/**
 * Live updates for a customer's tracking page. Anonymous: the link token is the permission, as it
 * is for the page itself. Groups don't survive a reconnect, so the hub is re-joined each time.
 * Returns whether updates are live; callers keep a slower poll as the fallback.
 */
export function useTrackingUpdates(token: string | undefined, onChange: () => void): boolean {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    let connection: HubConnection | null = null;
    void loadSignalR()
      .then(({ HubConnectionBuilder, LogLevel }) => {
        if (cancelled) return;
        const hub = new HubConnectionBuilder()
          .withUrl(hubUrl('/hubs/tracking'))
          .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
          .configureLogging(LogLevel.Error)
          .build();
        connection = hub;
        const join = () =>
          hub
            .invoke<boolean>('Join', token)
            .then((joined) => !cancelled && setLive(joined))
            .catch(() => !cancelled && setLive(false));

        hub.on('trackingChanged', onChange);
        hub.onreconnecting(() => setLive(false));
        hub.onreconnected(() => {
          onChange();
          void join();
        });
        hub.onclose(() => setLive(false));
        return hub.start().then(join);
      })
      .catch(() => !cancelled && setLive(false));

    return () => {
      cancelled = true;
      stop(connection);
    };
    // onChange is a refetch callback; reconnect only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return token ? live : false;
}
