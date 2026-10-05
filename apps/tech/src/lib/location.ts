export interface Position {
  latitude: number;
  longitude: number;
}

/**
 * Best-effort current position for status updates (PLAN.md §7.7 history location).
 * Never blocks the technician: resolves to null after `timeoutMs` or if permission is denied.
 */
export function currentPosition(timeoutMs = 3000): Promise<Position | null> {
  if (!('geolocation' in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
    );
  });
}

/** Google Maps directions deep link (UX-ARCHITECTURE.md §0 C6: no in-app navigation). */
export function directionsUrl(destination: { latitude?: number | null; longitude?: number | null; text: string }): string {
  const target =
    destination.latitude != null && destination.longitude != null
      ? `${destination.latitude},${destination.longitude}`
      : destination.text;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}
