import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';
import LiveStudio from '../components/LiveStudio';
import LiveWatch from '../components/LiveWatch';

const LABELS = {
  welcome: 'Welcome bonus',
  purchase: 'Points top-up',
  gift_sent: 'Gift sent',
  gift_received: 'Gift received',
  gift_refund: 'Gift refunded',
};

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function Live() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  if (sessionId) {
    return <LiveWatch sessionId={sessionId} onExit={() => navigate('/live', { replace: true })} />;
  }

  return <LiveHub />;
}

function LiveHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTitle, setStudioTitle] = useState('');
  const [askTitle, setAskTitle] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState('');
  const [showPacks, setShowPacks] = useState(false);
  const [convertPoints, setConvertPoints] = useState('100');
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [rewardBusy, setRewardBusy] = useState('');
  const [referralLink, setReferralLink] = useState('');

  const loadWallet = useCallback(async () => {
    try {
      const result = await apiRequest('/live/wallet');
      setWallet(result);
      setReferralLink(result.referralLink || '');
    } catch (walletError) {
      setError(walletError.message);
    }
  }, []);

  const loadSessions = useCallback(async (initial = false) => {
    try {
      const result = await apiRequest('/live/sessions');
      setSessions(result.sessions || []);
      setError('');
    } catch (requestError) {
      if (initial) setError(requestError.message);
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiRequest('/profile/me').then((result) => setProfile(result.profile)).catch(() => {});
    loadWallet();
    loadSessions(true);
    const timer = setInterval(() => loadSessions(false), 10_000);
    return () => clearInterval(timer);
  }, [loadSessions, loadWallet]);

  // Flutterwave returns here after a points purchase.
  useEffect(() => {
    const result = searchParams.get('points');
    if (!result) return;
    if (result === 'success') {
      setNotice('Your points top-up was successful.');
      loadWallet();
    } else if (result === 'failed') {
      setError('That points payment did not complete. No points were added.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('points');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadWallet]);

  const startTopUp = async (pack) => {
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


  const convertRewards = async (event) => {
    event.preventDefault();
    setRewardBusy('convert'); setError(''); setNotice('');
    try {
      const result = await apiRequest('/rewards/convert', { method: 'POST', body: { points: Number(convertPoints) } });
      setNotice(result.message || 'Reward points converted.');
      await loadWallet();
    } catch (requestError) { setError(requestError.message); }
    finally { setRewardBusy(''); }
  };

  const requestWithdrawal = async (event) => {
    event.preventDefault();
    setRewardBusy('withdraw'); setError(''); setNotice('');
    try {
      const result = await apiRequest('/rewards/withdrawals', { method: 'POST', body: { amount: Number(withdrawAmount) } });
      setNotice(result.message || 'Withdrawal request submitted.');
      await loadWallet();
    } catch (requestError) { setError(requestError.message); }
    finally { setRewardBusy(''); }
  };

  const openStudio = () => {
    setStudioTitle('');
    setAskTitle(true);
  };

  const beginStream = () => {
    setAskTitle(false);
    setStudioOpen(true);
  };

  const finishStudio = () => {
    setStudioOpen(false);
    loadSessions(true);
    loadWallet();
  };

  const transactions = wallet?.transactions || [];

  return (
    <div className="mx-auto max-w-4xl pb-24 lg:pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Live</h1>
          <p className="text-xs text-slate-500">Watch creators live, send hearts and gifts</p>
        </div>
        <button type="button" onClick={openStudio} className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-red-700">
          <i className="fa-solid fa-tower-broadcast" />Go live
        </button>
      </header>

      {notice && <p className="mx-4 mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">{notice}</p>}
      {error && <p className="mx-4 mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}

      <section className="m-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-4 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Gift wallet</p>
            <p className="mt-1 text-2xl font-extrabold">
              <i className="fa-solid fa-coins mr-2 text-amber-300" />
              {Number(wallet?.balance || 0).toLocaleString()}
              <span className="ml-1 text-sm font-bold text-white/50">pts</span>
            </p>
            <p className="mt-1 text-[11px] text-white/50">Gifts you receive from viewers are added here.</p>
          </div>
          <button type="button" onClick={() => setShowPacks((value) => !value)} className="rounded-full bg-white/10 px-3 py-2 text-[11px] font-bold text-white hover:bg-white/20">
            <i className="fa-solid fa-plus mr-1" />Buy points
          </button>
        </div>

        {showPacks && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {wallet?.topUpAvailable ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(wallet.pointPacks || []).map((pack) => (
                  <button
                    key={pack.key}
                    type="button"
                    onClick={() => startTopUp(pack)}
                    disabled={Boolean(topUpBusy)}
                    className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-2.5 text-left transition hover:bg-amber-400/20 disabled:opacity-60"
                  >
                    <span className="block text-sm font-extrabold text-amber-200">{pack.points.toLocaleString()} pts</span>
                    <span className="block text-[10px] text-white/60">{topUpBusy === pack.key ? 'Opening…' : `₦${Number(pack.amount).toLocaleString('en-NG')}`}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-4 text-amber-200">
                To sell points, add the Flutterwave keys
                {wallet?.missingConfig?.length ? ` (${wallet.missingConfig.join(', ')})` : ''} to <code>server/.env</code> and restart the API.
                {wallet?.welcomePoints > 0 ? ` New wallets start with ${wallet.welcomePoints} welcome points.` : ''}
              </p>
            )}
            {transactions.length > 0 && (
              <div className="mt-3 space-y-1">
                {transactions.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-[11px] text-white/60">
                    <span>{LABELS[entry.kind] || entry.kind}</span>
                    <span className={entry.amount > 0 ? 'font-bold text-emerald-300' : 'font-bold text-white/70'}>
                      {entry.amount > 0 ? '+' : ''}{Number(entry.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>


      <section className="mx-4 mb-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">Creator & referral rewards</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{Number(wallet?.rewardPoints || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">reward pts</span></p>
            <p className="text-[11px] text-slate-500">100 reward points = ₦1 · Purchased points are separate.</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-slate-400">Withdrawable</p>
            <p className="text-lg font-extrabold text-emerald-700">₦{Number(wallet?.cashBalance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <form onSubmit={convertRewards} className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <input type="number" min="100" step="100" value={convertPoints} onChange={(event) => setConvertPoints(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800" aria-label="Reward points to convert" />
          <button type="submit" disabled={Boolean(rewardBusy)} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{rewardBusy === 'convert' ? 'Converting…' : 'Convert to ₦'}</button>
        </form>
        <form onSubmit={requestWithdrawal} className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <input type="number" min="100" step="1" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800" aria-label="Withdrawal amount in naira" />
          <button type="submit" disabled={Boolean(rewardBusy)} className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{rewardBusy === 'withdraw' ? 'Submitting…' : 'Request withdrawal'}</button>
        </form>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Withdrawals require a verified payout bank account and admin review. Minimum request: ₦100.</p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-blue-900">Invite friends · Earn 10 reward points each</p>
            <p className="truncate text-[10px] text-blue-700">{referralLink || 'Your referral link loads with your wallet.'}</p>
          </div>
          <button type="button" onClick={() => {
            const userId = JSON.parse(localStorage.getItem('user') || '{}').id || '';
            const link = referralLink || (window.location.origin + '/register?ref=QC' + userId);
            navigator.clipboard?.writeText(link).then(() => setNotice('Referral link copied.')).catch(() => setError('Could not copy the referral link.'));
          }} className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white">Copy link</button>
        </div>
      </section>
      <section className="m-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          <h2 className="text-sm font-extrabold text-slate-900">Live now</h2>
          <span className="text-xs text-slate-400">{sessions.length}</span>
        </div>

        {loading && <p className="py-10 text-center text-sm text-slate-500">Finding live streams…</p>}

        {!loading && sessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
              <i className="fa-solid fa-tower-broadcast" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">No one is live right now</h3>
            <p className="mt-1 text-xs text-slate-500">Start your own stream and your followers will get a notification.</p>
            <button type="button" onClick={openStudio} className="mt-4 rounded-full bg-red-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-red-700">Go live</button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => navigate(`/live/${session.id}`)}
                className="group relative overflow-hidden rounded-2xl bg-slate-900 p-4 text-left text-white shadow-sm transition hover:shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/25 via-transparent to-blue-600/20" />
                <div className="relative flex items-center gap-3">
                  <div className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-red-500">
                    {session.host?.picture
                      ? <img src={session.host.picture} alt="" className="h-full w-full object-cover" />
                      : <Avatar name={session.host?.name} size={56} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-extrabold">{session.host?.name}</p>
                      {session.isMine && <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">Yours</span>}
                    </div>
                    <p className="truncate text-[11px] text-white/60">{session.title}</p>
                    <p className="mt-1 flex items-center gap-3 text-[10px] font-bold text-white/70">
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5">LIVE · {formatDuration(session.durationSeconds)}</span>
                      <span><i className="fa-solid fa-eye mr-1" />{session.viewers}</span>
                      <span><i className="fa-solid fa-heart mr-1 text-rose-400" />{session.likes}</span>
                    </p>
                  </div>
                  <i className="fa-solid fa-play text-white/50 transition group-hover:text-white" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="m-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">How live gifts work</h2>
        <ol className="mt-2 space-y-1.5 text-xs leading-5 text-slate-500">
          <li><strong className="text-slate-700">1.</strong> Buy points once, then send gifts while someone is live.</li>
          <li><strong className="text-slate-700">2.</strong> The creator receives the gift points in their wallet instantly.</li>
          <li><strong className="text-slate-700">3.</strong> Your live recording is posted as a replay when you end the stream.</li>
        </ol>
      </section>

      {askTitle && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-base font-extrabold text-slate-900">Go live</h2>
            <p className="mt-1 text-xs text-slate-500">Add a title, then allow camera access. Followers get notified immediately.</p>
            <input
              autoFocus
              value={studioTitle}
              onChange={(event) => setStudioTitle(event.target.value.slice(0, 120))}
              placeholder="What are you going live about?"
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setAskTitle(false)} className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={beginStream} className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-red-700">Start live</button>
            </div>
          </div>
        </div>
      )}

      {studioOpen && (
        <LiveStudio
          caption={studioTitle}
          profile={profile}
          onCancel={finishStudio}
          onPosted={finishStudio}
        />
      )}
    </div>
  );
}
