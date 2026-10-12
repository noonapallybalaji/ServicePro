import { configureSessionEndpoints, session, type AuthSession, type CustomerSessionResponse } from '@servicepro/api-client';

/*
 * Customer sign-in on the public site. The shared session store (access token in memory, refresh
 * via an HttpOnly cookie) is pointed at the customer endpoints. To keep every page view free of
 * API calls, we only try to resume a session when this browser has signed in before — a
 * non-secret flag; the token itself never touches storage.
 */

const FLAG = 'servicepro.customer-signed-in';

function setFlag(on: boolean) {
  try {
    if (on) window.localStorage.setItem(FLAG, '1');
    else window.localStorage.removeItem(FLAG);
  } catch {
    // Storage blocked: we simply won't auto-resume.
  }
}

function hasFlag(): boolean {
  try {
    return window.localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

/** Call once in the browser, after the app has rendered. */
export function startCustomerSession() {
  configureSessionEndpoints({ refresh: '/api/v1/customer-auth/refresh', logout: '/api/v1/customer-auth/logout' });
  session.subscribe(() => {
    const { status } = session.getState();
    if (status === 'signed-in') setFlag(true);
    if (status === 'signed-out') setFlag(false);
  });

  if (hasFlag()) {
    void session.restore();
  } else {
    session.clear();
  }
}

/** Store a session returned by sign-in or by a booking. */
export function signInWith(response: CustomerSessionResponse) {
  const { accessToken, expiresAt, user } = response;
  const next: AuthSession = {
    accessToken,
    expiresAt,
    user: { id: user.id, fullName: user.fullName, role: 'CUSTOMER', phone: user.phone, preferredLanguage: user.preferredLanguage },
  };
  session.set(next);
}

/** The signed-in customer, if any (staff sessions never exist on this site). */
export function customerFrom(state: ReturnType<typeof session.getState>) {
  return state.status === 'signed-in' && state.session?.user.role === 'CUSTOMER' ? state.session.user : null;
}
