import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AdultContentContext = createContext(null);

export function getAgeConsentIdentity() {
  try {
    const user = JSON.parse(window.localStorage.getItem('user') || '{}');
    return String(user.id || user.username || 'anonymous');
  } catch (_error) {
    return 'anonymous';
  }
}

export function AdultContentProvider({ identity, children }) {
  const storageKey = `quickchat:age-confirmed:18:${identity || 'anonymous'}`;
  const [confirmed, setConfirmed] = useState(() => {
    try { return window.localStorage.getItem(storageKey) === 'yes'; } catch (_error) { return false; }
  });

  useEffect(() => {
    try { setConfirmed(window.localStorage.getItem(storageKey) === 'yes'); } catch (_error) { setConfirmed(false); }
    const syncConsent = (event) => {
      if (event.key === storageKey) setConfirmed(event.newValue === 'yes');
    };
    window.addEventListener('storage', syncConsent);
    return () => window.removeEventListener('storage', syncConsent);
  }, [storageKey]);

  const confirmAdultAge = useCallback(() => {
    try { window.localStorage.setItem(storageKey, 'yes'); } catch (_error) { /* In-memory confirmation remains available for this page. */ }
    setConfirmed(true);
  }, [storageKey]);

  return (
    <AdultContentContext.Provider value={{ confirmed, confirmAdultAge }}>
      {children}
    </AdultContentContext.Provider>
  );
}

export function useAdultContentConsent() {
  return useContext(AdultContentContext) || { confirmed: false, confirmAdultAge: () => {} };
}

export default function AdultContentGate({ isAdult, children, className = '', as: Element = 'div' }) {
  const { confirmed, confirmAdultAge } = useAdultContentConsent();
  const blurred = Boolean(isAdult && !confirmed);

  if (!blurred) return <Element className={className}>{children}</Element>;

  return (
    <Element className="relative isolate overflow-hidden rounded-xl">
      <div className={`${className} pointer-events-none select-none blur-xl`.trim()} aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4 text-center text-white backdrop-blur-sm" role="group" aria-label="18+ content is hidden">
        <div className="max-w-sm">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-white/40 text-sm font-extrabold">18+</span>
          <h2 className="mt-2 text-base font-extrabold">Adult content</h2>
          <p className="mt-1 text-xs leading-5 text-white/90">Confirm that you are 18 or older to view adult content.</p>
          <button type="button" onClick={confirmAdultAge} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900 hover:bg-slate-100">
            I’m 18 or older · Show adult content
          </button>
        </div>
      </div>
    </Element>
  );
}
