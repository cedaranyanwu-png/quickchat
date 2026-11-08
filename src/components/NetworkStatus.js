import React, { useEffect, useRef, useState } from 'react';

export default function NetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);
  const offlineRef = useRef(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    let restoredTimer;
    const handleOffline = () => {
      window.clearTimeout(restoredTimer);
      setShowRestored(false);
      offlineRef.current = true;
      setOnline(false);
    };
    const handleNetworkError = () => {
      window.clearTimeout(restoredTimer);
      setShowRestored(false);
      offlineRef.current = true;
      setOnline(false);
    };
    const handleNetworkRestored = () => {
      if (!offlineRef.current) return;
      offlineRef.current = false;
      setOnline(true);
      setShowRestored(true);
      window.clearTimeout(restoredTimer);
      restoredTimer = window.setTimeout(() => setShowRestored(false), 2800);
    };
    const handleOnline = () => {
      offlineRef.current = false;
      setOnline(true);
      setShowRestored(true);
      window.dispatchEvent(new Event('quickchat:online'));
      restoredTimer = window.setTimeout(() => setShowRestored(false), 2800);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('quickchat:network-error', handleNetworkError);
    window.addEventListener('quickchat:network-restored', handleNetworkRestored);
    return () => {
      window.clearTimeout(restoredTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('quickchat:network-error', handleNetworkError);
      window.removeEventListener('quickchat:network-restored', handleNetworkRestored);
    };
  }, []);

  if (online && !showRestored) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[10000] flex items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-lg ${online ? 'bg-emerald-600' : 'bg-slate-900'}`}
    >
      <i className={online ? 'fa-solid fa-wifi' : 'fa-solid fa-wifi-slash'} aria-hidden="true" />
      <span>{online ? "You're back online. QuickChat is reconnecting…" : "You're offline. QuickChat will reconnect automatically when internet returns."}</span>
    </div>
  );
}
