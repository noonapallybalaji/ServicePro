/*
 * Notifications on the customer's device (the system notification tray). The browser asks the
 * customer once, and only when they tap "Turn on": never on page load. Shown through the service
 * worker, because Android Chrome can't show them any other way.
 */

export type DevicePermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function devicePermission(): DevicePermission {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission;
}

/** iPhone/iPad Safari only allows web notifications once the site is added to the Home Screen. */
export function needsHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !installed;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function worker(): Promise<ServiceWorkerRegistration | null> {
  registration ??= navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null);
  return registration;
}

/** Asks the browser for permission (call from a tap). Resolves to the customer's answer. */
export async function requestDevicePermission(): Promise<DevicePermission> {
  if (devicePermission() === 'unsupported') return 'unsupported';
  const answer = await Notification.requestPermission();
  if (answer === 'granted') {
    await worker();
    await showDeviceNotification({ id: 'welcome', title: 'Notifications are on', body: "We'll let you know here when your booking changes.", url: '/account' });
  }
  return answer;
}

export async function showDeviceNotification({ id, title, body, url }: { id: string; title: string; body: string; url: string }) {
  if (devicePermission() !== 'granted') return;
  const options: NotificationOptions = { body, tag: id, icon: '/logo.png', badge: '/favicon-32.png', data: { url } };
  const sw = await worker();
  if (sw) {
    await sw.showNotification(title, options);
  } else {
    new Notification(title, options); // desktop browsers without a service worker
  }
}

/** Registers the worker on load once permission was already given, so taps on notifications work. */
export function resumeDeviceNotifications() {
  if (devicePermission() === 'granted') void worker();
}
