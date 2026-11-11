import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import CreatorStudio from './CreatorStudio';

export default function CreatorPortal() {
  const navigate = useNavigate();
  const signedIn = Boolean(localStorage.getItem('token'));
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ creatorName: '', niche: '', bio: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!signedIn) return;
    apiRequest('/creator-studio/me').then((data) => {
      setStatus(data);
      if (data.creator) setForm({ creatorName: data.creator.creator_name || '', niche: data.creator.niche || '', bio: data.creator.bio || '' });
    }).catch((e) => setError(e.message || 'Could not load your creator account.'));
  }, [signedIn]);

  if (!signedIn) return <main className="min-h-screen bg-slate-950 px-5 py-16 text-white"><div className="mx-auto max-w-5xl"><Link to="/" className="text-sm font-black text-blue-300 no-underline">QUICKCHAT</Link><p className="mt-16 text-xs font-black uppercase tracking-[.25em] text-blue-300">QuickChat Creator</p><h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Your creativity deserves its own space.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Create a creator identity, publish through Content Studio and understand how your audience grows. Your creator workspace connects to your real QuickChat posts, followers and account.</p><div className="mt-8 flex flex-wrap gap-3"><Link to="/login?next=%2Fcreator" className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white no-underline">Sign in to continue</Link><Link to="/register?next=%2Fcreator" className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white no-underline">Create a QuickChat account</Link></div><p className="mt-4 text-xs text-slate-400">Use your existing QuickChat account, or create a new account first. Your normal profile and creator workspace share one secure identity.</p></div></main>;

  if (!status) return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">Loading Creator Portal…</div>;
  if (status.isCreator) return <div className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b bg-white px-5 py-3"><Link to="/creator" className="font-black text-slate-900 no-underline">QUICKCHAT CREATOR</Link><Link to="/home" className="text-xs font-bold text-blue-700 no-underline">Open QuickChat</Link></header><CreatorStudio /></div>;

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest('/creator-studio/activate', { method: 'POST', body: form });
      const fresh = await apiRequest('/creator-studio/me');
      setStatus(fresh); setMessage('Creator account activated. Your existing QuickChat profile, posts and followers are connected.');
    } catch (e) { setError(e.message || 'Creator application could not be submitted.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b bg-white px-5 py-3"><Link to="/creator" className="font-black text-slate-900 no-underline">QUICKCHAT CREATOR</Link><Link to="/home" className="text-xs font-bold text-blue-700 no-underline">Back to QuickChat</Link></header><div className="mx-auto max-w-3xl px-4 py-10"><div className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-xs font-black uppercase tracking-widest text-blue-300">Creator application</p><h1 className="mt-3 text-3xl font-black">Set up your creator identity</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Apply using your current QuickChat login. Your existing profile, posts, followers and account credentials remain the same.</p></div><form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><label className="block text-sm font-bold text-slate-700">Creator or public name<input required maxLength="100" value={form.creatorName} onChange={e=>setForm({...form,creatorName:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal" placeholder="Your creator name"/></label><label className="block text-sm font-bold text-slate-700">Main content category<select required value={form.niche} onChange={e=>setForm({...form,niche:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"><option value="">Choose a category</option>{['Education','Entertainment','Technology','Comedy','Music','Gaming','Sports','Fashion','Lifestyle','Business','Art & Design','Other'].map(x=><option key={x}>{x}</option>)}</select></label><label className="block text-sm font-bold text-slate-700">Short creator bio<textarea rows="4" maxLength="500" value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal" placeholder="Tell your audience what you create…"/></label>{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}<button disabled={busy} className="w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{busy?'Setting up…':'Create Creator Account'}</button></form></div></main>;
}
