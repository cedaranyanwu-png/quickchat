/* QuickChat PWA + Web Push service worker.
 * Private API responses, uploads, and live communication are deliberately
 * excluded from caches. Only the app shell and static same-origin assets persist.
 */
const SHELL_CACHE = 'quickchat-shell-v3';
const STATIC_CACHE = 'quickchat-static-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/offline.html',
  '/favicon/android-chrome-192x192.png', '/favicon/android-chrome-512x512.png'];

const ICON = '/favicon/android-chrome-192x192.png';
const BADGE = '/favicon/favicon-32x32.png';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(APP_SHELL.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (_error) { /* install can still complete if a nonessential icon is absent */ }
    }));

    // Pre-cache the hashed CRA JavaScript and CSS bundles during installation.
    // Without this step, the first offline launch could load index.html but
    // fail before React starts because the bundle had not yet been requested
    // under service-worker control.
    const indexResponse = await cache.match('/index.html');
    if (indexResponse) {
      const html = await indexResponse.clone().text();
      const assetPaths = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
        .map((match) => new URL(match[1], self.location.origin).pathname)
        .filter((path) => path.startsWith('/static/'));
      const staticCache = await caches.open(STATIC_CACHE);
      await Promise.all(assetPaths.map(async (path) => {
        try {
          const response = await fetch(path, { cache: 'reload' });
          if (response.ok && response.type === 'basic') await staticCache.put(path, response);
        } catch (_error) { /* a missing optional asset must not block worker install */ }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('quickchat-') && ![SHELL_CACHE, STATIC_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isPrivateOrDynamicRequest(url, request) {
  return request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname === '/sw.js';
}

async function cacheStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (isPrivateOrDynamicRequest(url, request)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch (_error) {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
        return new Response('QuickChat is offline. Reconnect to the internet and try again.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/favicon/') ||
      url.pathname === '/manifest.json' || url.pathname === '/logo192.png' ||
      url.pathname === '/logo512.png') {
    event.respondWith(
      cacheStaticAsset(request).catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response('', { status: 504 });
      })
    );
  }
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
