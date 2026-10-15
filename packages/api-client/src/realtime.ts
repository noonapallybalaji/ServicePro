import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiUrl } from './http';
import { session } from './session';

/**
 * SignalR messages are refetch signals (the server pushes "something changed", never data of
 * record). Each app maps messages to the query keys it should invalidate.
 */
export type RealtimeHub = '/hubs/ops' | '/hubs/tech';

export type RealtimeMessage = 'serviceRequestChanged' | 'technicianChanged' | 'jobChanged' | 'offerReceived' | 'offerResolved' | 'supportChanged';

export type ConnectionHealth = 'connecting' | 'live' | 'reconnecting' | 'offline';

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

    const connection: HubConnection = new HubConnectionBuilder()
      .withUrl(apiUrl(hub), { accessTokenFactory: () => session.getAccessToken() ?? '' })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    for (const [message, prefixes] of Object.entries(invalidate) as [RealtimeMessage, readonly string[]][]) {
      connection.on(message, (payload: unknown) => {
        for (const prefix of prefixes) {
          void queryClient.invalidateQueries({
            predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith(prefix),
          });
        }

        onMessage?.(message, payload);
      });
    }

    connection.onreconnecting(() => setHealth('reconnecting'));
    connection.onreconnected(() => {
      setHealth('live');
      // Anything may have changed while we were away.
      void queryClient.invalidateQueries();
    });
    connection.onclose(() => setHealth('offline'));

    let cancelled = false;
    connection
      .start()
      .then(() => !cancelled && setHealth('live'))
      .catch(() => !cancelled && setHealth('offline'));

    return () => {
      cancelled = true;
      if (connection.state !== HubConnectionState.Disconnected) {
        void connection.stop();
      }
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

    const connection = new HubConnectionBuilder()
      .withUrl(apiUrl('/hubs/tracking'))
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Error)
      .build();
    let cancelled = false;
    const join = () =>
      connection
        .invoke<boolean>('Join', token)
        .then((joined) => !cancelled && setLive(joined))
        .catch(() => !cancelled && setLive(false));

    connection.on('trackingChanged', onChange);
    connection.onreconnecting(() => setLive(false));
    connection.onreconnected(() => {
      onChange();
      void join();
    });
    connection.onclose(() => setLive(false));
    connection
      .start()
      .then(join)
      .catch(() => !cancelled && setLive(false));

    return () => {
      cancelled = true;
      if (connection.state !== HubConnectionState.Disconnected) {
        void connection.stop();
      }
    };
    // onChange is a refetch callback; reconnect only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return token ? live : false;
}
