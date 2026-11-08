import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';

const money = (amount, currency = 'NGN') => `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const POINT_LABELS = {
  welcome: 'Welcome points',
  purchase: 'Points top-up',
  gift_sent: 'Gift sent',
  gift_received: 'Gift received',
  gift_refund: 'Gift refunded',
  verification_bonus: 'Verification reward',
};

export default function Wallet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [pointsWallet, setPointsWallet] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPacks, setShowPacks] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState('');
  const [convertPoints, setConvertPoints] = useState('100');
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [rewardBusy, setRewardBusy] = useState('');

  const loadWallet = useCallback(async () => {
    const results = await Promise.all([
      apiRequest('/wallet/summary'),
      apiRequest('/live/wallet'),
      apiRequest('/rewards/withdrawals'),
    ]);
    setSummary(results[0]);
    setPointsWallet(results[1]);
    setWithdrawals(results[2].withdrawals || []);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadWallet()
      .catch((err) => { if (mounted) setError(err.message || 'Could not load your wallet.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [loadWallet]);

  useEffect(() => {
    const result = searchParams.get('points');
    if (!result) return;
    if (result === 'success') {
      setNotice('Your points top-up was successful. Your balance has been updated.');
      loadWallet().catch((err) => setError(err.message || 'Could not refresh your wallet.'));
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
    } catch (err) {
      setError(err.message || 'Could not start your points purchase.');
      setTopUpBusy('');
    }
  };

  const convertRewards = async (event) => {
    event.preventDefault();
    setRewardBusy('convert');
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/rewards/convert', {
        method: 'POST',
        body: { points: Number(convertPoints) },
      });
      setNotice(result.message || 'Eligible creator points converted.');
      await loadWallet();
    } catch (err) {
      setError(err.message || 'Could not convert creator points.');
    } finally {
      setRewardBusy('');
    }
  };

  const requestWithdrawal = async (event) => {
    event.preventDefault();
    setRewardBusy('withdraw');
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/rewards/withdrawals', {
        method: 'POST',
        body: { amount: Number(withdrawAmount) },
      });
      setNotice(result.message || 'Withdrawal request submitted.');
      await loadWallet();
    } catch (err) {
      setError(err.message || 'Could not submit withdrawal request.');
    } finally {
      setRewardBusy('');
    }
  };

  const copyReferralLink = () => {
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id || '';
    const link = pointsWallet?.referralLink || (window.location.origin + '/register?ref=QC' + userId);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => setNotice('Referral link copied.'))
        .catch(() => setError('Could not copy the referral link.'));
    } else {
      setError('Copy is not available in this browser.');
    }
  };

  const pointTransactions = pointsWallet?.transactions || [];
  const eligiblePoints = Number(pointsWallet?.convertibleRewardPoints || 0);
  const cashBalance = Number(pointsWallet?.cashBalance || 0);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 lg:pb-8">
      <header className="sticky top-0 z-10 mb-5 border-b border-slate-200 bg-white/95 py-4 backdrop-blur">
        <h1 className="text-xl font-extrabold text-slate-900">Wallet &amp; earnings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your points, creator rewards, conversions and withdrawals in one place.</p>
      </header>

      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading your wallet…</p> : (
        <>
          <section className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-5 text-white shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-white/60">Points balance</p>
                <p className="mt-1 text-3xl font-extrabold"><i className="fa-solid fa-coins mr-2 text-amber-300" />{Number(pointsWallet?.balance || 0).toLocaleString()} <span className="text-sm text-white/60">pts</span></p>
                <p className="mt-1 text-xs text-white/60">Use points for gifts and supported QuickChat features.</p>
              </div>
              <button type="button" onClick={() => setShowPacks((value) => !value)} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20">
                <i className="fa-solid fa-plus mr-1" />Buy points
              </button>
            </div>
            {showPacks && (
              <div className="mt-4 border-t border-white/10 pt-4">
                {pointsWallet?.topUpAvailable ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(pointsWallet.pointPacks || []).map((pack) => (
                      <button key={pack.key} type="button" onClick={() => startTopUp(pack)} disabled={Boolean(topUpBusy)} className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-left hover:bg-amber-400/20 disabled:opacity-60">
                        <span className="block text-sm font-extrabold text-amber-200">{Number(pack.points).toLocaleString()} pts</span>
                        <span className="mt-1 block text-[11px] text-white/70">{topUpBusy === pack.key ? 'Opening checkout…' : `₦${Number(pack.amount).toLocaleString('en-NG')}`}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-amber-200">Points top-up is temporarily unavailable. Please try again later.</p>
                )}
              </div>
            )}
          </section>

          <section className="mb-5 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Creator reward points</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">{Number(pointsWallet?.rewardPoints || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">total pts</span></p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Only points earned when another user spends points on your eligible monetized content can be converted. Verification bonuses, purchased points and referral rewards are not cashable.</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-right">
                <p className="text-[10px] font-bold uppercase text-emerald-700">Eligible to convert</p>
                <p className="text-xl font-extrabold text-emerald-800">{eligiblePoints.toLocaleString()} pts</p>
              </div>
            </div>

            <form onSubmit={convertRewards} className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <input type="number" min="100" max={eligiblePoints} step="100" value={convertPoints} onChange={(event) => setConvertPoints(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800" aria-label="Creator reward points to convert" />
              <button type="submit" disabled={Boolean(rewardBusy) || eligiblePoints < 100} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{rewardBusy === 'convert' ? 'Converting…' : 'Convert to naira'}</button>
            </form>
            <p className="mt-2 text-[11px] text-slate-500">Conversion rate: {Number(pointsWallet?.conversionRate?.points || 100)} eligible points = ₦1. Minimum conversion applies.</p>
          </section>

          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Withdrawable earnings</p>
                <p className="mt-1 text-2xl font-extrabold text-emerald-700">{money(cashBalance, '₦')}</p>
                <p className="mt-1 text-xs text-slate-500">Converted creator rewards available for payout.</p>
              </div>
              <i className="fa-solid fa-building-columns text-2xl text-emerald-600" />
            </div>
            <form onSubmit={requestWithdrawal} className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <input type="number" min="100" step="1" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800" aria-label="Withdrawal amount in naira" />
              <button type="submit" disabled={Boolean(rewardBusy)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{rewardBusy === 'withdraw' ? 'Submitting…' : 'Request withdrawal'}</button>
            </form>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">A verified payout bank account is required. Minimum withdrawal: ₦100. Requests are reviewed by an administrator.</p>
            {withdrawals.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
                {withdrawals.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="text-slate-600">₦{Number(item.amount).toLocaleString('en-NG')} · {new Date(item.created_at).toLocaleDateString()}</span>
                    <span className="font-bold capitalize text-slate-700">{item.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {pointsWallet?.referralLink && (
            <section className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-900">Invite friends · Earn {Number(pointsWallet.referralRewardPoints || 0)} reward points</p>
                <p className="mt-1 truncate text-xs text-blue-700">{pointsWallet.referralLink}</p>
              </div>
              <button type="button" onClick={copyReferralLink} className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Copy link</button>
            </section>
          )}

          <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-900">Points activity</h2>
              <p className="mt-1 text-xs text-slate-500">Purchases, gifts, verification bonuses and other point movements.</p>
            </div>
            {pointTransactions.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Your points transactions will appear here.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pointTransactions.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{POINT_LABELS[entry.kind] || String(entry.kind || 'Points activity').replaceAll('_', ' ')}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Date unavailable'}</p>
                    </div>
                    <span className={Number(entry.amount) >= 0 ? 'text-sm font-bold text-emerald-700' : 'text-sm font-bold text-slate-700'}>{Number(entry.amount) > 0 ? '+' : ''}{Number(entry.amount).toLocaleString()} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            {summary?.settlementNote || 'Creator cash sales and point-based creator rewards are tracked separately. Only eligible point earnings can be converted into withdrawable funds.'}
          </section>
          <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Cash creator sales summary">
            {(summary?.earnings || []).length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 sm:col-span-3">No verified cash creator-sale earnings yet.</div>
            ) : summary.earnings.map((item) => (
              <article key={item.currency} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Cash creator share · {item.currency}</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{money(item.creatorShare, item.currency)}</p>
                <p className="mt-3 text-xs text-slate-500">Gross {money(item.gross, item.currency)}</p>
                <p className="text-xs text-slate-500">Platform fee {money(item.platformFee, item.currency)}</p>
              </article>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-900">Recent cash creator transactions</h2>
            </div>
            {(summary?.transactions || []).length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Cash transactions will appear here after provider-verified creator sales.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.transactions.map((transaction) => (
                  <li key={transaction.reference} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{String(transaction.type || 'creator sale').replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-xs text-slate-500">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : 'Date unavailable'} · {transaction.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-700">+{money(transaction.creatorShare, transaction.currency)}</p>
                      <p className="text-xs text-slate-500">Gross {money(transaction.grossAmount, transaction.currency)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
