import { session } from './session';

/**
 * The single HTTP entry point for every generated endpoint (ADR 0007).
 * - Same-origin by default (Vite proxy in dev, reverse proxy in production) so the
 *   refresh cookie stays first-party.
 * - Adds the bearer token, and on 401 refreshes once and retries.
 * - Turns RFC 7807 problem details into a typed ApiError.
 */

export interface ApiProblem {
  status: number;
  title?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly fieldErrors: Record<string, string[]>;

  constructor(problem: ApiProblem) {
    super(problem.title ?? `Request failed (${problem.status})`);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.fieldErrors = problem.errors ?? {};
  }

  /** First message for a field, using the API's camelCase property path (e.g. "address.pincode"). */
  fieldError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

let baseUrl = '';

/** Override only when the API isn't served from the same origin. */
export function configureApiBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

let realtimeBaseUrl = '';

/**
 * Where live connections (/hubs/*) go when the host can't proxy them: Render static-site
 * rewrites don't pass WebSockets. Unset, hubs follow the API base like every other request.
 */
export function configureRealtimeBaseUrl(url: string | undefined) {
  realtimeBaseUrl = (url ?? '').trim().replace(/\/$/, '');
}

export function hubUrl(hub: string): string {
  return realtimeBaseUrl ? `${realtimeBaseUrl}${hub}` : apiUrl(hub);
}

const NO_REFRESH_PATHS = ['/api/v1/auth/login', '/api/v1/auth/otp/', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/customer-auth/'];

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await send(url, init);

  if (response.status === 401 && !NO_REFRESH_PATHS.some((path) => url.startsWith(path))) {
    const refreshed = await session.refresh();
    if (refreshed) {
      return parse<T>(await send(url, init));
    }
  }

  return parse<T>(response);
}

function send(url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = session.getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(apiUrl(url), { ...init, headers, credentials: 'same-origin' });
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }

    const type = response.headers.get('content-type') ?? '';
    if (type.includes('json')) {
      return (await response.json()) as T;
    }

    return (await response.blob()) as T;
  }

  let problem: ApiProblem = { status: response.status };
  try {
    problem = { ...(await response.json()), status: response.status };
  } catch {
    // Non-JSON error body (proxy, network): keep the status only.
  }

  if (response.status === 401) {
    session.clear();
  }

  throw new ApiError(problem);
}
