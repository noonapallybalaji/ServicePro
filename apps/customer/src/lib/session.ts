import {
  configureApiBaseUrl,
  configureNativeApp,
  configureSessionEndpoints,
  session,
  useSession,
  type CustomerSessionResponse,
} from '@servicepro/api-client';
import * as SecureStore from 'expo-secure-store';

import { config } from './config';

/*
 * Customer sign-in in the app. The shared session store keeps the access token in memory; the
 * refresh token lives in the phone's Keychain / Keystore and travels in the request body (the API
 * hands it to the app instead of setting a cookie). Signing in happens with a code, or by booking.
 */

const REFRESH_TOKEN_KEY = 'pakkafix.customer.refresh-token';

/** Once, before the first screen: API address, customer endpoints, secure storage, resume. */
export function startSession() {
  configureApiBaseUrl(config.apiUrl);
  configureSessionEndpoints({ refresh: '/api/v1/customer-auth/refresh', logout: '/api/v1/customer-auth/logout' });
  configureNativeApp({
    get: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    set: (token) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
    clear: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  });
  void session.restore();
}

/** Store a session returned by sign-in or by a booking. */
export function signInWith(response: CustomerSessionResponse) {
  const { accessToken, expiresAt, user } = response;
  session.set({
    accessToken,
    expiresAt,
    refreshToken: response.refreshToken ?? null,
    refreshExpiresAt: response.refreshExpiresAt ?? null,
    user: { id: user.id, fullName: user.fullName, role: 'CUSTOMER', phone: user.phone, preferredLanguage: user.preferredLanguage },
  });
}

/** The signed-in customer, or null. `status` tells "still checking" from "signed out". */
export function useCustomer() {
  const state = useSession();
  return { status: state.status, customer: state.status === 'signed-in' ? (state.session?.user ?? null) : null };
}
