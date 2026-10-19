/*
 * Service worker for device notifications (Android Chrome can only show them through one).
 * It caches nothing; it only opens the right page when a notification is tapped.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/account', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});
