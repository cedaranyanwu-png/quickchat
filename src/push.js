import { apiRequest, loadRuntimeConfig } from './api';

// Browser push plumbing: the service worker shows notifications while the app
// is in the background or closed, and the API stores the subscription per user.

export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

function toUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

let registrationPromise = null;

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((error) => {
        registrationPromise = null;
        throw error;
      });
  }
  return registrationPromise;
}

export async function getPushStatus() {
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  const registration = await registerServiceWorker().catch(() => null);
  const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    endpoint: subscription?.endpoint || null,
  };
}

export async function enablePush() {
  if (!pushSupported()) {
    throw new Error('This browser does not support push notifications.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them in your browser settings, then try again.');
  }

  const config = await loadRuntimeConfig();
  const publicKey = (process.env.REACT_APP_VAPID_PUBLIC_KEY || '').trim() || config?.push?.publicKey || '';
  if (!publicKey) {
    throw new Error('Push is not configured on the server yet. Ask an administrator to enable VAPID keys.');
  }

  const registration = await registerServiceWorker();
  if (!registration) throw new Error('The notification worker could not start.');

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8Array(publicKey),
    });
  }

  await apiRequest('/push/subscriptions', {
    method: 'POST',
    body: { subscription: subscription.toJSON() },
  });
  return subscription;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const registration = await registerServiceWorker().catch(() => null);
  const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
  if (!subscription) return;
  await apiRequest('/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  }).catch(() => { });
  await subscription.unsubscribe().catch(() => { });
}

// Re-register on every sign-in: the server may have been reset or the user may
// have signed in on a new profile in the same browser.
export async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const registration = await registerServiceWorker().catch(() => null);
    let subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
    if (!subscription) {
      await enablePush();
    } else {
      await apiRequest('/push/subscriptions', {
        method: 'POST',
        body: { subscription: subscription.toJSON() },
      });
    }
  } catch (_error) {
    // Non-blocking sync attempt
  }
}

export function sendTestPush() {
  return apiRequest('/push/test', { method: 'POST' });
}

// Used when the tab is in the background but the browser has no push
// permission: the polled unread counts still produce a system notification.
export async function showLocalNotification(title, options = {}) {
  if (!pushSupported()) return;
  const registration = await registerServiceWorker().catch(() => null);
  if (!registration) return;
  await registration.showNotification(title, {
    icon: '/favicon/android-chrome-192x192.png',
    badge: '/favicon/favicon-32x32.png',
    ...options,
  }).catch(() => { });
}
