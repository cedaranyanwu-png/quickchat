import React, { useEffect, useState } from 'react';

function isStandalone() {
  return (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    window.navigator?.standalone === true;
}

export default function PWAInstallCard() {
  const [promptEvent, setPromptEvent] = useState(() => window.__quickchatDeferredInstallPrompt || null);
  const [installed, setInstalled] = useState(isStandalone());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const syncPrompt = () => setPromptEvent(window.__quickchatDeferredInstallPrompt || null);
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setMessage('QuickChat has been installed on this device.');
    };
    window.addEventListener('quickchat:pwa-install-available', syncPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('quickchat:pwa-install-available', syncPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    setBusy(true);
    setMessage('');
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') setMessage('QuickChat is being added to your device.');
      window.__quickchatDeferredInstallPrompt = null;
      setPromptEvent(null);
    } catch (_error) {
      setMessage('Installation is not available right now. Use your browser menu to install QuickChat.');
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
            Install QuickChat on your phone for an app icon and a full-screen app experience. The app shell can open offline; messaging, feeds and calls still need internet.
          </p>
        </div>
      </div>
      {installed ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">QuickChat is installed on this device.</p>
      ) : promptEvent ? (
        <button type="button" onClick={install} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60">
          <i className="fa-solid fa-download" />{busy ? 'Opening install…' : 'Install QuickChat'}
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-blue-100 bg-white px-3 py-3 text-xs leading-5 text-slate-600">
          <strong className="block text-slate-800">Install from your browser</strong>
          Android (Chrome): open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.<br />
          iPhone (Safari): tap <b>Share</b>, then <b>Add to Home Screen</b>.
        </div>
      )}
      {message && <p role="status" className="mt-3 text-xs text-blue-700">{message}</p>}
    </section>
  );
}
