import { useSyncExternalStore } from 'react';

import { apiUrl } from './base-url';

/**
 * In-memory session (ADR 0005): the access token never touches localStorage. On reload the
 * app calls `restore()`, which uses the HttpOnly refresh cookie to get a new access token.
 * The phone apps can't rely on cookies: they register a secure store (Keychain / Keystore) with
 * `configureNativeApp`, and the refresh token travels in the request body instead.
 * Shapes mirror the API's AuthSessionResponse / MeResponse.
 */

export type SessionRole = 'OWNER' | 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN' | 'CUSTOMER';

export interface SessionUser {
  id: string;
  fullName: string;
  role: SessionRole;
  phone: string;
  email?: string | null;
  technicianId?: string | null;
  preferredLanguage: string;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: string;
  user: SessionUser;
  /** Phone apps only; kept in the secure store, never in memory. */
  refreshToken?: string | null;
  refreshExpiresAt?: string | null;
}

/** Where a phone app keeps its refresh token (the device's Keychain / Keystore). */
export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

let nativeStore: RefreshTokenStore | null = null;

/** Phone apps call this once at start-up, before `restore()`. */
export function configureNativeApp(store: RefreshTokenStore) {
  nativeStore = store;
}

/** Tells the API this is the phone app, so the refresh token comes in the body (the API checks the origin too). */
export function nativeAppHeaders(): Record<string, string> {
  return nativeStore ? { 'X-ServicePro-Client': 'native' } : {};
}

/** Refresh / logout request for the current platform: the cookie in a browser, the stored token in the app. */
async function tokenRequest(path: string): Promise<Response> {
  if (!nativeStore) {
    return fetch(apiUrl(path), { method: 'POST', credentials: 'same-origin' });
  }
  const refreshToken = await nativeStore.get();
  if (!refreshToken) {
    return new Response(null, { status: 401 });
  }
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...nativeAppHeaders() },
    body: JSON.stringify({ refreshToken }),
  });
}

/** offline: the phone app couldn't reach the API to resume; its stored sign-in is kept for a retry. */
export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out' | 'offline';

interface SessionState {
  status: SessionStatus;
  session: AuthSession | null;
}

let state: SessionState = { status: 'unknown', session: null };

/** Staff and technician apps use the defaults; the customer site points these at /api/v1/customer-auth. */
let endpoints = { refresh: '/api/v1/auth/refresh', logout: '/api/v1/auth/logout' };

export function configureSessionEndpoints(next: { refresh: string; logout: string }) {
  endpoints = next;
}
const listeners = new Set<() => void>();
let refreshInFlight: Promise<boolean> | null = null;

function emit(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const session = {
  getAccessToken: () => state.session?.accessToken ?? null,

  getState: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Call with the body of a login / OTP-verify / refresh response. */
  set(next: AuthSession) {
    // The app's refresh token rotates on every refresh: keep the newest in the secure store, not in memory.
    if (nativeStore && next.refreshToken) void nativeStore.set(next.refreshToken);
    emit({ status: 'signed-in', session: { accessToken: next.accessToken, expiresAt: next.expiresAt, user: next.user } });
  },

  clear() {
    void nativeStore?.clear();
    if (state.status !== 'signed-out') {
      emit({ status: 'signed-out', session: null });
    }
  },

  /**
   * Exchanges the refresh cookie for a new access token. Concurrent callers share one request,
   * so a burst of 401s triggers a single refresh.
   */
  refresh(): Promise<boolean> {
    refreshInFlight ??= tokenRequest(endpoints.refresh)
      .then(async (response) => {
        if (!response.ok) {
          // The app keeps its sign-in through a server outage; only a rejected token signs it out.
          if (nativeStore && response.status >= 500) emit({ status: 'offline', session: null });
          else session.clear();
          return false;
        }

        session.set((await response.json()) as AuthSession);
        return true;
      })
      .catch(() => {
        // No connection in the app: keep the stored sign-in and let the technician retry.
        if (nativeStore) emit({ status: 'offline', session: null });
        else session.clear();
        return false;
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  },

  /** On app start: resume the session if the refresh cookie (or the app's stored token) is still valid. */
  restore(): Promise<boolean> {
    return state.status === 'signed-in' ? Promise.resolve(true) : session.refresh();
  },

  async signOut() {
    try {
      await tokenRequest(endpoints.logout);
    } finally {
      session.clear();
    }
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
