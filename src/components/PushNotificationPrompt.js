import React, { useState, useEffect } from 'react';
import { getPushStatus, enablePush } from '../push';

const DISMISS_KEY = 'quickchat_push_prompt_dismissed_at';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return;

      const status = await getPushStatus().catch(() => null);
      if (!mounted) return;
      if (status?.supported && status.permission === 'default' && !status.subscribed) {
        setShow(true);
      }
    };
    check();
    return () => { mounted = false; };
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    setError('');
    try {
      await enablePush();
      setSuccess(true);
      setTimeout(() => setShow(false), 3000);
    } catch (err) {
      setError(err?.message || 'Could not enable notifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="relative z-40 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 px-4 py-2.5 shadow-sm text-slate-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow">
            <i className="fa-solid fa-bell text-xs animate-bounce" />
          </span>
          <p className="font-semibold text-slate-800">
            {success ? (
              <span className="text-emerald-700 font-bold">
                <i className="fa-solid fa-circle-check mr-1.5" />
                Push notifications enabled! You'll receive alerts for messages and activity even when you are away.
              </span>
            ) : (
              <span>
                <strong>Stay updated:</strong> Turn on notifications so you never miss messages, mentions, or live streams when away.
              </span>
            )}
          </p>
        </div>

        {!success && (
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              type="button"
              onClick={handleEnable}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition"
            >
              {loading ? (
                <i className="fa-solid fa-circle-notch fa-spin" />
              ) : (
                <i className="fa-solid fa-bell" />
              )}
              Turn On
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200/60 transition"
              aria-label="Dismiss notification prompt"
            >
              Maybe later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

