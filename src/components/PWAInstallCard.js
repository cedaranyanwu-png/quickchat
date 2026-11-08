import React, { useEffect, useState } from 'react';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator?.standalone === true
  );
}

function getInstallPlatform() {
  const ua = window.navigator?.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function PWAInstallCard() {
  const [promptEvent, setPromptEvent] = useState(() => window.__quickchatDeferredInstallPrompt || null);
  const [standalone, setStandalone] = useState(isStandalone);
  const [installCompleted, setInstallCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const platform = getInstallPlatform();

  useEffect(() => {
    const syncPrompt = () => setPromptEvent(window.__quickchatDeferredInstallPrompt || null);
    const syncDisplayMode = () => setStandalone(isStandalone());
    const onInstalled = () => {
      // The browser event confirms installation, but it does not guarantee
      // that Android placed a shortcut on the home screen.
      setInstallCompleted(true);
      setPromptEvent(null);
      window.__quickchatDeferredInstallPrompt = null;
      setMessage('Chrome completed the installation. If you do not see the icon on your home screen, check your app drawer for QuickChat.');
    };
    window.addEventListener('quickchat:pwa-install-available', syncPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const media = window.matchMedia?.('(display-mode: standalone)');
    media?.addEventListener?.('change', syncDisplayMode);
    window.addEventListener('pageshow', syncDisplayMode);
    return () => {
      window.removeEventListener('quickchat:pwa-install-available', syncPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media?.removeEventListener?.('change', syncDisplayMode);
      window.removeEventListener('pageshow', syncDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!promptEvent || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const event = promptEvent;
      await event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === 'accepted') {
        setInstallCompleted(false);
        setMessage('Installation was accepted by your browser. Wait a moment, then look for QuickChat in your phone app drawer. You can add it to your home screen from there.');
      } else {
        setMessage('Installation was cancelled. You can install QuickChat later from your browser menu.');
      }
      window.__quickchatDeferredInstallPrompt = null;
      setPromptEvent(null);
    } catch (_error) {
      setMessage('The automatic installer could not open. Use the browser menu instructions below to install QuickChat.');
      window.__quickchatDeferredInstallPrompt = null;
      setPromptEvent(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-4 my-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-blue-700 text-white">
          <i className="fa-solid fa-mobile-screen-button" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">QuickChat app</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Install QuickChat as an app for a dedicated app window and launcher entry. Your feed, messages and calls still require an internet connection.
          </p>
        </div>
      </div>

      {standalone ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          QuickChat is open in its installed app mode on this device.
        </p>
      ) : (
        <>
          {promptEvent && (
            <button type="button" onClick={install} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60">
              <i className="fa-solid fa-download" />{busy ? 'Opening installer…' : 'Install QuickChat'}
            </button>
          )}

          <div className="mt-4 rounded-xl border border-blue-100 bg-white px-3 py-3 text-xs leading-5 text-slate-600">
            <strong className="block text-slate-800">Finish installation on your phone</strong>
            {platform === 'android' ? (
              <>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Open this page in <b>Google Chrome</b>, not an in-app browser.</li>
                  <li>Tap Chrome's three-dot menu in the top-right corner.</li>
                  <li>Choose <b>Install app</b>. If that option is unavailable, choose <b>Add to Home screen</b>, then confirm.</li>
                  <li>After installation, check your app drawer for <b>QuickChat</b>. Long-press its icon and choose <b>Add to Home</b> if you want it on your home screen.</li>
                </ol>
                <p className="mt-2 text-slate-500">If Chrome shows <b>Open</b> instead of Install app, the app may already be installed. Check the app drawer and search for QuickChat.</p>
              </>
            ) : platform === 'ios' ? (
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Open this page in <b>Safari</b>.</li>
                <li>Tap the <b>Share</b> icon.</li>
                <li>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</li>
              </ol>
            ) : (
              <p className="mt-2">Use your browser's install icon in the address bar or open the browser menu and choose <b>Install QuickChat</b>.</p>
            )}
          </div>
        </>
      )}

      {message && !standalone && (
        <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
          {message}
        </p>
      )}
      {installCompleted && !standalone && (
        <p className="mt-2 text-xs text-slate-500">The browser confirmed installation; this page is still running in the browser tab.</p>
      )}
    </section>
  );
}
