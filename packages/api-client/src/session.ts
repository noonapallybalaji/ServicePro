import { useSyncExternalStore } from 'react';

/**
 * In-memory session (ADR 0005): the access token never touches localStorage. On reload the
 * app calls `restore()`, which uses the HttpOnly refresh cookie to get a new access token.
 * Shapes mirror the API's AuthSessionResponse / MeResponse.
 */

export type SessionRole = 'OWNER' | 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';

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
}

export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out';

interface SessionState {
  status: SessionStatus;
  session: AuthSession | null;
}

let state: SessionState = { status: 'unknown', session: null };
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
    emit({ status: 'signed-in', session: next });
  },

  clear() {
    if (state.status !== 'signed-out') {
      emit({ status: 'signed-out', session: null });
    }
  },

  /**
   * Exchanges the refresh cookie for a new access token. Concurrent callers share one request,
   * so a burst of 401s triggers a single refresh.
   */
  refresh(): Promise<boolean> {
    refreshInFlight ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          session.clear();
          return false;
        }

        session.set((await response.json()) as AuthSession);
        return true;
      })
      .catch(() => {
        session.clear();
        return false;
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  },

  /** On app start: resume the session if the refresh cookie is still valid. */
  restore(): Promise<boolean> {
    return state.status === 'signed-in' ? Promise.resolve(true) : session.refresh();
  },

  async signOut() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      session.clear();
    }
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
