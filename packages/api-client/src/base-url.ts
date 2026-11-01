let baseUrl = '';

/** Override only when the API isn't served from the same origin (the phone apps). */
export function configureApiBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}
