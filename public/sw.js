/* QuickChat service worker: receives web push messages and opens the right page. */
const ICON = '/favicon/android-chrome-192x192.png';
const BADGE = '/favicon/favicon-32x32.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function focusedClient() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => (
    windows.find((client) => client.focused || client.visibilityState === 'visible') || null
  ));
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { title: 'QuickChat', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil((async () => {
    // When a tab is visible the app already updates its own badges, so a
    // system notification would be noisy. Hidden or closed tabs still get one.
    const visible = await focusedClient();
    if (visible) return;

    await self.registration.showNotification(payload.title || 'QuickChat', {
      body: payload.body || 'You have new activity on QuickChat.',
      icon: payload.icon || ICON,
      badge: payload.badge || BADGE,
      tag: payload.tag || 'quickchat',
      renotify: true,
      data: { url: payload.url || '/home', type: payload.type || 'activity' },
      vibrate: [80, 40, 80],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/home', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(target); } catch (_error) { /* older browsers */ }
        }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
