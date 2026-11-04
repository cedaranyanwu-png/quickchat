import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../api';

// --- Comments -------------------------------------------------------------

export function LiveComments({ comments, className = '', isHost = false }) {
  const scrollRef = useRef(null);
  const count = comments.length;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }
  }, [count]);

  return (
    <div
      ref={scrollRef}
      className={`qc-no-scrollbar max-h-[42vh] space-y-2 overflow-y-auto pr-1 pointer-events-auto ${className}`}
      aria-live="polite"
      aria-label="Live comments"
    >
      {comments.map((comment, index) => {
        const isCommentHost = comment.isHost || comment.user?.isHost;
        const commentColor = isCommentHost
          ? 'text-amber-300'
          : ['text-cyan-300', 'text-pink-300', 'text-emerald-300', 'text-violet-300', 'text-sky-300'][
              Math.abs((comment.user?.name || '').charCodeAt(0) || 0) % 5
            ];

        return (
          <div
            key={comment.id || `c-${index}`}
            className="qc-live-comment flex items-start gap-2 max-w-[94%] self-start"
          >
            <div className="inline-flex items-center gap-2 rounded-2xl bg-black/60 px-3 py-1.5 shadow-lg backdrop-blur-md border border-white/10">
              <span className="grid h-6 w-6 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-[10px] font-extrabold text-white ring-1 ring-white/20">
                {comment.user?.picture ? (
                  <img src={comment.user.picture} alt="" className="h-full w-full object-cover" />
                ) : (
                  (comment.user?.name || '?').slice(0, 1).toUpperCase()
                )}
              </span>
              <p className="min-w-0 break-words text-[13px] leading-5 text-white">
                <span className={`mr-1.5 font-extrabold ${commentColor}`}>
                  {comment.user?.name || 'Viewer'}
                </span>
                {isCommentHost && (
                  <span className="mr-1.5 rounded-full bg-amber-500/25 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-300 border border-amber-500/30">
                    HOST
                  </span>
                )}
                {comment.isGift && (
                  <span className="mr-1.5 rounded-full bg-pink-500/30 px-1.5 py-0.2 text-[9px] font-extrabold text-pink-200">
                    GIFT
                  </span>
                )}
                <span className="text-white/95 font-medium [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                  {comment.text}
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Gift banner ----------------------------------------------------------

export function GiftBanner({ gift, onDone }) {
  useEffect(() => {
    if (!gift) return undefined;
    const timer = setTimeout(() => onDone?.(), 3400);
    return () => clearTimeout(timer);
  }, [gift, onDone]);

  if (!gift) return null;
  return (
    <div
      key={gift.id}
      className="qc-live-gift-pop pointer-events-none flex items-center gap-3 self-start rounded-full bg-gradient-to-r from-amber-500 via-pink-600 to-purple-600 p-1.5 pr-4 shadow-2xl backdrop-blur-md border border-amber-300/40"
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-2xl shadow-inner">
        {gift.emoji}
      </div>
      <div className="flex flex-col">
        <span className="text-[12px] font-extrabold text-white leading-tight">
          {gift.sender?.name || 'Someone'} <span className="font-normal text-white/90">sent</span> {gift.name}
        </span>
        <span className="text-[11px] font-extrabold text-amber-200">
          🪙 +{Number(gift.points || 0).toLocaleString()} points
        </span>
      </div>
    </div>
  );
}

// --- Floating hearts ------------------------------------------------------

export function HeartRain({ burst }) {
  const [hearts, setHearts] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!burst?.count) return undefined;
    const emojis = ['❤️', '💖', '💗', '🔥', '✨', '💜', '💙', '⭐'];
    const created = Array.from({ length: Math.min(burst.count, 10) }, (_, index) => {
      seq.current += 1;
      return {
        id: `${burst.id}-${seq.current}`,
        left: 70 + Math.random() * 22, // float up mostly from the right side near the heart button
        drift: `${Math.round((Math.random() - 0.4) * 80)}px`,
        delay: index * 60,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        size: 22 + Math.round(Math.random() * 16),
      };
    });
    setHearts((current) => [...current, ...created].slice(-50));
    const timer = setTimeout(() => {
      setHearts((current) => current.filter((heart) => !created.some((entry) => entry.id === heart.id)));
    }, 2800);
    return () => clearTimeout(timer);
  }, [burst?.id, burst?.count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {hearts.map((heart) => (
        <span
          key={heart.id}
          className="qc-live-heart"
          style={{
            left: `${heart.left}%`,
            '--qc-drift': heart.drift,
            animationDelay: `${heart.delay}ms`,
            fontSize: `${heart.size}px`,
          }}
        >
          {heart.emoji}
        </span>
      ))}
    </div>
  );
}

// --- Quick Gift Bar (1-Tap Gifting) ----------------------------------------

export function QuickGiftBar({ wallet, onSendQuickGift, onOpenFullTray }) {
  const quickGifts = [
    { key: 'rose', name: 'Rose', emoji: '🌹', points: 10 },
    { key: 'coffee', name: 'Coffee', emoji: '☕', points: 50 },
    { key: 'heart', name: 'Heart', emoji: '💖', points: 100 },
    { key: 'rocket', name: 'Rocket', emoji: '🚀', points: 500 },
    { key: 'crown', name: 'Crown', emoji: '👑', points: 1000 },
  ];

  const balance = Number(wallet?.balance || 0);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto qc-no-scrollbar py-1">
      {quickGifts.map((gift) => {
        const canAfford = balance >= gift.points;
        return (
          <button
            key={gift.key}
            type="button"
            onClick={() => onSendQuickGift(gift)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-md backdrop-blur-md transition active:scale-90 ${
              canAfford
                ? 'bg-black/60 border border-white/20 text-white hover:bg-black/80 hover:border-amber-400'
                : 'bg-black/40 border border-white/10 text-white/60 hover:bg-black/60'
            }`}
            title={`Send ${gift.name} (${gift.points} pts)`}
          >
            <span className="text-base">{gift.emoji}</span>
            <span className={canAfford ? 'text-amber-300' : 'text-white/50'}>
              {gift.points}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onOpenFullTray}
        className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-pink-600 px-3 py-1 text-[11px] font-extrabold text-white shadow-md hover:brightness-110 active:scale-95"
      >
        <i className="fa-solid fa-gift text-xs" />
        <span>More</span>
      </button>
    </div>
  );
}

// --- Gift tray ------------------------------------------------------------

function formatAmount(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}` : amount;
}

export function GiftTray({ open, sessionId, hostName, onClose, onSent }) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPacks, setShowPacks] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    setNotice('');
    apiRequest('/live/wallet')
      .then((result) => { if (active) setWallet(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const balance = Number(wallet?.balance || 0);

  const sendGift = async (gift) => {
    if (sending) return;
    setError('');
    setNotice('');
    if (balance < gift.points) {
      setShowPacks(true);
      setError(`You need ${(gift.points - balance).toLocaleString()} more points for ${gift.name}.`);
      return;
    }
    setSending(gift.key);
    try {
      const result = await apiRequest(`/live/sessions/${sessionId}/gifts`, {
        method: 'POST',
        body: { giftKey: gift.key },
      });
      setWallet((current) => (current ? { ...current, balance: result.balance } : current));
      onSent?.(result.gift, result.balance);
      onClose?.();
    } catch (requestError) {
      if (requestError.message.toLowerCase().includes('enough points')) setShowPacks(true);
      setError(requestError.message);
    } finally {
      setSending('');
    }
  };

  const buyPoints = async (pack) => {
    setTopUpBusy(pack.key);
    setError('');
    try {
      const result = await apiRequest('/live/wallet/topup', {
        method: 'POST',
        body: { packKey: pack.key },
      });
      window.location.assign(result.checkoutUrl);
    } catch (requestError) {
      setError(requestError.message);
      setTopUpBusy('');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-md rounded-t-3xl bg-slate-950/95 p-4 text-white shadow-2xl ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Send a gift"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold">Send a gift</h2>
            <p className="text-[11px] text-white/60">Support {hostName || 'this creator'} with points</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Close gift tray">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2">
          <span className="text-[11px] font-semibold text-white/60">Your balance</span>
          <span className="text-sm font-extrabold text-amber-300">
            <i className="fa-solid fa-coins mr-1.5" />{balance.toLocaleString()} pts
          </span>
        </div>

        {loading && <p className="mt-6 text-center text-xs text-white/60"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Loading gifts…</p>}

        {!loading && wallet && (
          <>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {(wallet.gifts || []).map((gift) => {
                const affordable = balance >= gift.points;
                return (
                  <button
                    key={gift.key}
                    type="button"
                    onClick={() => sendGift(gift)}
                    disabled={Boolean(sending)}
                    className={`flex flex-col items-center gap-0.5 rounded-2xl border p-2 transition active:scale-95 disabled:opacity-60 ${affordable ? 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10' : 'border-white/5 bg-white/[0.03]'}`}
                  >
                    <span className="text-2xl">{gift.emoji}</span>
                    <span className="text-[10px] font-bold">{gift.name}</span>
                    <span className={`text-[10px] ${affordable ? 'text-amber-300' : 'text-white/40'}`}>{gift.points.toLocaleString()} pts</span>
                    {sending === gift.key && <i className="fa-solid fa-circle-notch fa-spin text-[9px] text-white/60" />}
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={() => setShowPacks((value) => !value)} className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] font-bold text-white/80 hover:bg-white/10">
              <span><i className="fa-solid fa-plus mr-1.5" />Buy points</span>
              <i className={`fa-solid fa-chevron-${showPacks ? 'up' : 'down'} text-[9px]`} />
            </button>

            {showPacks && (
              <div className="mt-2 space-y-2">
                {wallet.topUpAvailable ? (
                  <div className="grid grid-cols-2 gap-2">
                    {(wallet.pointPacks || []).map((pack) => (
                      <button
                        key={pack.key}
                        type="button"
                        onClick={() => buyPoints(pack)}
                        disabled={Boolean(topUpBusy)}
                        className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-2 text-left transition hover:bg-amber-400/20 disabled:opacity-60"
                      >
                        <span className="block text-sm font-extrabold text-amber-200">{pack.points.toLocaleString()} pts</span>
                        <span className="block text-[10px] text-white/60">{topUpBusy === pack.key ? 'Opening checkout…' : formatAmount(pack.amount)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] leading-4 text-amber-200">
                    Points top-ups are not enabled yet. An administrator must add the Flutterwave keys{wallet.missingConfig?.length ? ` (${wallet.missingConfig.join(', ')})` : ''} in <code>server/.env</code>.
                  </p>
                )}
                {wallet.welcomePoints > 0 && (
                  <p className="text-[10px] leading-4 text-white/45">New wallets include a {wallet.welcomePoints.toLocaleString()} point welcome bonus.</p>
                )}
              </div>
            )}
          </>
        )}

        {notice && <p className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-[11px] text-emerald-200">{notice}</p>}
        {error && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-[11px] text-red-200" role="alert">{error}</p>}
      </div>
    </div>
  );
}

// --- End card -------------------------------------------------------------

export function LiveEndedCard({ session, onClose, headline = 'Live ended' }) {
  const host = session?.host;
  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/90 p-6 text-center text-white backdrop-blur">
      <div className="w-full max-w-sm">
        <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-white/10 ring-4 ring-white/10">
          {host?.picture
            ? <img src={host.picture} alt="" className="h-full w-full object-cover" />
            : <i className="fa-solid fa-tower-broadcast text-2xl text-white/70" />}
        </div>
        <h2 className="mt-4 text-lg font-extrabold">{headline}</h2>
        <p className="mt-1 text-xs text-white/60">
          {host?.name ? `${host.name}'s stream has finished.` : 'This stream has finished.'}
        </p>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-900 hover:bg-white/90">
          Back to live
        </button>
      </div>
    </div>
  );
}
