import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { registerServiceWorker } from './push';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Keep the PWA worker current so new releases are discovered without asking
// users to clear their browser cache or manually reload QuickChat.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadScheduled = false;
  let lastUserActivity = Date.now();

  const markActivity = () => { lastUserActivity = Date.now(); };
  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, markActivity, { passive: true });
  });

  const canReloadQuietly = () => {
    if (document.visibilityState !== 'visible') return false;
    if (Date.now() - lastUserActivity < 12000) return false;
    if (document.querySelector('input:focus, textarea:focus, select:focus, [contenteditable="true"]:focus')) return false;
    if (Array.from(document.querySelectorAll('audio, video')).some((media) => !media.paused && !media.ended)) return false;
    return true;
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Do not reload on the first-ever installation; only reload an existing
    // tab when a newer worker takes control after a production deployment.
    if (!hadController || reloadScheduled) return;
    reloadScheduled = true;

    const waitForSafeRefresh = window.setInterval(() => {
      if (!canReloadQuietly()) return;
      window.clearInterval(waitForSafeRefresh);
      window.location.reload();
    }, 2000);
  });

  registerServiceWorker()
    .then((registration) => {
      if (!registration) return;
      registration.update().catch(() => {});
      // A short update interval makes releases appear promptly in long-lived tabs.
      window.setInterval(() => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      }, 60000);
    })
    .catch(() => {
      // The app remains usable if service workers are unavailable or blocked.
    });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
