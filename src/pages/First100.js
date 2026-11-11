import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL, apiRequest } from '../api';

export default function First100() {
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const load = () => fetch(API_BASE_URL + '/growth/first-100').then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load the campaign.'))).then(setCampaign).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  const join = async () => {
    setError(''); setNotice('');
    if (!localStorage.getItem('token')) {
      const ref = new URLSearchParams(window.location.search).get('ref');
      navigate(ref ? '/register?ref=' + encodeURIComponent(ref) : '/register'); return;
    }
    setBusy(true);
    try {
      const result = await apiRequest('/growth/first-100/join', { method: 'POST', body: { source: new URLSearchParams(window.location.search).get('source') || 'first100_page' } });
      setReferralLink(result.referralLink || ''); setNotice(result.message || 'You are now part of the First 100.'); load();
    } catch (err) { setError(err.message || 'Could not join the First 100.'); } finally { setBusy(false); }
  };
  const share = async () => {
    if (!referralLink) { setNotice('Join the First 100 first to unlock your personal invite link.'); return; }
    try {
      if (navigator.share) await navigator.share({ title: 'Join QuickChat First 100', text: 'I am one of the first 100 QuickChat members. Join me:', url: referralLink });
      else { await navigator.clipboard.writeText(referralLink); setNotice('Your invite link was copied.'); }
    } catch (_error) {}
  };
  const joined = Number(campaign?.joined || 0);
  const progress = Math.min(100, (joined / 100) * 100);
  return <main className="min-h-screen bg-slate-950 text-white">
    <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute -left-32 -top-24 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" /><div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" /></div>
    <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="flex items-center justify-between"><Link to="/" className="flex items-center gap-2 text-white no-underline"><img src="/favicon/logo.png" alt="QuickChat" className="h-9 w-9 rounded-xl" /><span className="font-black tracking-tight">QuickChat</span></Link><Link to="/login" className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-slate-200 no-underline hover:bg-white/10">Sign in</Link></nav>
      <section className="grid gap-10 pb-16 pt-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-300"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> First 100</div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">Be among the first people shaping <span className="text-blue-400">QuickChat.</span></h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">We are opening a small founding group before the next growth push. Join early, test the product, meet creators and help decide what QuickChat becomes.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button onClick={join} disabled={busy || campaign?.full} className="rounded-full bg-blue-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Joining…' : campaign?.full ? 'First 100 filled' : 'Join the First 100'}</button><button onClick={share} className="rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/10">Invite a friend</button></div>
          {notice && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs font-semibold text-emerald-200">{notice}</p>}{error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</p>}
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-white/[.06] p-5 shadow-2xl backdrop-blur-xl sm:p-7"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Founding group</p><p className="mt-1 text-4xl font-black">{joined}<span className="text-xl text-slate-500"> / 100</span></p></div><div className="rounded-full bg-blue-500/10 px-3 py-1.5 text-[10px] font-black text-blue-300">{campaign?.remaining ?? 100} places left</div></div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: progress + '%' }} /></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">{[['fa-user-astronaut','Founding member status','Get a visible early-member identity inside QuickChat.'],['fa-wand-magic-sparkles','Early feature access','Test new creator, rewards and community features first.'],['fa-bullhorn','Creator opportunities','Early creators can be selected for platform spotlights.'],['fa-people-group','Bring your people','Get a personal invite link so your audience can join with you.']].map(([icon,title,body]) => <div key={title} className="rounded-2xl border border-white/10 bg-black/10 p-4"><i className={'fa-solid ' + icon + ' text-blue-300'} /><p className="mt-3 text-xs font-black">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{body}</p></div>)}</div>
        </div>
      </section>
      <section className="border-t border-white/10 py-12"><div className="grid gap-5 sm:grid-cols-3">{[['01','Join','Create or sign in to your QuickChat account.'],['02','Use it','Complete your profile and actually use the platform.'],['03','Bring one','Share your personal invite link with one person who would use QuickChat.']].map(([step,title,body]) => <div key={step} className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><span className="text-xs font-black text-blue-400">{step}</span><h2 className="mt-2 text-sm font-black">{title}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{body}</p></div>)}</div></section>
      <footer className="border-t border-white/10 py-6 text-center text-[10px] font-semibold text-slate-500">QuickChat First 100 · Early access program</footer>
    </div>
  </main>;
}