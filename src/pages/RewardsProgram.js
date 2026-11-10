import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';

const money = (value) => '₦' + Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

export default function RewardsProgram() {
  const [data, setData] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [convertAmount, setConvertAmount] = useState('100');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [wallet, payout] = await Promise.all([apiRequest('/rewards-program/me'), apiRequest('/rewards-program/withdrawals')]);
    setData(wallet); setWithdrawals(payout.withdrawals || []);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const run = async (key, fn) => {
    setBusy(key); setError(''); setNotice('');
    try { const result = await fn(); setNotice(result.message || 'Updated.'); await load(); }
    catch (e) { setError(e.message || 'Request failed.'); }
    finally { setBusy(''); }
  };
  const claim = () => run('daily', () => apiRequest('/rewards-program/daily-claim', { method: 'POST' }));
  const convertStars = () => run('stars', () => apiRequest('/rewards-program/convert-stars', { method: 'POST' }));
  const convertPoints = (e) => { e.preventDefault(); run('points', () => apiRequest('/rewards-program/convert-points', { method: 'POST', body: { points: Number(convertAmount) } })); };
  const withdraw = (e) => { e.preventDefault(); run('withdraw', () => apiRequest('/rewards-program/withdrawals', { method: 'POST', body: { amount: Number(withdrawAmount) } })); };
  const copy = async () => { try { await navigator.clipboard.writeText(data.referralLink); setNotice('Referral link copied.'); } catch { setError('Could not copy the referral link.'); } };
  if (!data) return <div className="mx-auto max-w-4xl p-8 text-sm text-slate-500">Loading rewards…</div>;
  const progress = Math.min(100, data.stars >= 100 ? 100 : data.stars);
  return <div className="mx-auto max-w-4xl px-4 pb-24 pt-5">
    <header className="mb-5"><p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">QuickChat loyalty programme</p><h1 className="mt-1 text-2xl font-black text-slate-950">Rewards &amp; tasks</h1><p className="mt-1 text-sm text-slate-500">Return regularly, invite real people and complete tasks to earn rewards.</p></header>
    {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-xs font-bold text-white/60">Your Stars</p><p className="mt-2 text-3xl font-black">⭐ {data.stars}</p><p className="mt-1 text-xs text-white/60">100 Stars = 100 Points</p></article>
      <article className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-bold text-blue-700">Reward Points</p><p className="mt-2 text-3xl font-black text-slate-950">{data.points}</p><p className="mt-1 text-xs text-slate-500">100 Points = ₦1,000</p></article>
      <article className="rounded-2xl border border-emerald-100 bg-white p-4"><p className="text-xs font-bold text-emerald-700">Withdrawable</p><p className="mt-2 text-3xl font-black text-emerald-700">{money(data.cashBalance)}</p><p className="mt-1 text-xs text-slate-500">After points conversion</p></article>
    </section>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">Daily return reward</h2><p className="mt-1 text-xs text-slate-500">Claim one Star per calendar day (Nigeria time).</p></div><button onClick={claim} disabled={busy==='daily'||data.lastClaimDay===data.today} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{data.lastClaimDay===data.today?'Claimed today':busy==='daily'?'Claiming…':'Claim 1 Star'}</button></div>
      <div className="mt-4 flex items-center justify-between text-xs font-semibold text-slate-600"><span>{progress}/100 Stars</span><span>{100-progress} to next conversion</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{width:progress+'%'}} /></div>
      <button onClick={convertStars} disabled={busy==='stars'||data.stars<100} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">{busy==='stars'?'Converting…':'Convert available Stars to Points'}</button>
    </section>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-extrabold text-slate-900">Earn more points</h2><div className="mt-3 space-y-3">{data.tasks.map(task=><div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-bold text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.description} · +{task.points} points</p></div><button disabled={Boolean(task.completed)||busy==='task'+task.id} onClick={()=>run('task'+task.id,()=>apiRequest('/rewards-program/tasks/'+task.id+'/complete',{method:'POST'}))} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{task.completed?'Completed':'Complete'}</button></div>)}</div></section>
    <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4"><h2 className="font-extrabold text-blue-950">Invite friends</h2><p className="mt-1 text-sm text-blue-800">Earn 20 Points when your invited friend verifies their email and returns to QuickChat.</p><div className="mt-3 flex gap-2"><input readOnly value={data.referralLink} className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700"/><button onClick={copy} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Copy</button></div><p className="mt-2 text-xs text-blue-800">Qualified referrals: {data.referrals}</p></section>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-extrabold text-slate-900">Convert points to cash</h2><p className="mt-1 text-xs text-slate-500">100 points = ₦1,000. Conversion is in blocks of 100 points.</p><form onSubmit={convertPoints} className="mt-3 flex gap-2"><input type="number" min="100" step="100" max={data.points} value={convertAmount} onChange={e=>setConvertAmount(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button disabled={busy==='points'||data.points<100} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{busy==='points'?'Converting…':'Convert'}</button></form></section>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-extrabold text-slate-900">Withdraw earnings</h2><Link to="/settings/wallet" className="text-xs font-bold text-blue-700">Payout settings</Link></div><form onSubmit={withdraw} className="mt-3 flex gap-2"><input type="number" min="100" step="1" value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)} placeholder="Amount in ₦" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button disabled={busy==='withdraw'} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Request</button></form><p className="mt-2 text-[11px] text-slate-500">Minimum withdrawal ₦100. Requests require a verified payout account and admin review.</p>{withdrawals.map(w=><p key={w.id} className="mt-2 flex justify-between text-xs text-slate-600"><span>{money(w.amount)}</span><strong className="capitalize">{w.status}</strong></p>)}</section>
  </div>;
}
