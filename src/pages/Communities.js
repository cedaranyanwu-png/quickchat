import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';

const COMMUNITY_CATEGORIES = ['Technology', 'Design', 'Business', 'Sports', 'Entertainment', 'News', 'Education', 'Lifestyle', 'Other'];

export default function Communities() {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState([]);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', description: '' });
  const [paidCommunity, setPaidCommunity] = useState(false);
  const [communityPrice, setCommunityPrice] = useState('3000.00');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [joiningId, setJoiningId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest(`/communities?q=${encodeURIComponent(query)}`);
      setCommunities(result.communities || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const toggleJoin = async (community) => {
    setJoiningId(community.id);
    setError('');
    try {
      if (community.isPaid && !community.joined) {
        const checkout = await apiRequest(`/payments/communities/${community.id}/checkout`, { method: 'POST', body: {} });
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      const result = await apiRequest(`/communities/${community.id}/join`, { method: community.joined ? 'DELETE' : 'POST' });
      setCommunities((current) => current.map((row) => row.id === community.id ? { ...row, joined: result.joined, members: Math.max(0, Number(row.members) + (result.joined ? 1 : -1)) } : row));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setJoiningId(null);
    }
  };

  const createCommunity = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest('/communities', { method: 'POST', body: { ...form, monthlyPrice: paidCommunity ? (communityPrice || '3000.00') : null } });
      setForm({ name: '', category: '', description: '' });
      setPaidCommunity(false);
      setCommunityPrice('3000.00');
      setFormOpen(false);
      await load();
      if (result.community?.id) navigate(`/communities/${result.community.id}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-4xl pb-20 lg:pb-0">
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-lg font-extrabold text-slate-900">QuickChat Spaces</h1><p className="mt-0.5 text-xs text-slate-500">Discover communities, creator pages and channels.</p></div>
        <button type="button" onClick={() => { setFormOpen((open) => !open); setError(''); }} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800" aria-expanded={formOpen}><i className={`fa-solid ${formOpen ? 'fa-xmark' : 'fa-plus'}`} />{formOpen ? 'Cancel' : 'Create community'}</button>
      </div>
      <label className="mt-4 block"><span className="sr-only">Search communities</span><div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3"><i className="fa-solid fa-magnifying-glass text-xs text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search communities or topics" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div></label>
    </header>

    {formOpen && <form onSubmit={createCommunity} className="border-b border-slate-200 bg-blue-50/40 p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><i className="fa-solid fa-users" /></span><div><h2 className="text-base font-extrabold text-slate-900">Start a community</h2><p className="mt-1 text-xs leading-5 text-slate-600">Give your space a clear name and let people know what they can share. You’ll join as its first member.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">Community name <span className="font-normal text-slate-400">{form.name.length}/100</span>
          <input required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Lagos Creators" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="text-xs font-bold text-slate-700">Topic
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"><option value="">Choose a topic</option>{COMMUNITY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-bold text-slate-700">Description <span className="font-normal text-slate-400">{form.description.length}/1,000</span>
        <textarea maxLength="1000" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What is this space for? What should members post?" className="mt-1 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      </label>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="flex cursor-pointer items-start gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={paidCommunity} onChange={(event) => setPaidCommunity(event.target.checked)} className="mt-0.5 accent-blue-700" />Make this a paid community</label>
        {paidCommunity && <><label className="mt-3 block max-w-xs text-xs font-bold text-slate-700">30-day pass price<div className="mt-1 flex items-center rounded-lg border border-slate-300"><span className="px-3 text-sm font-bold text-slate-500">₦</span><input type="number" min="3000" max="1000000" step="0.01" inputMode="decimal" value={communityPrice} onChange={(event) => setCommunityPrice(event.target.value)} className="min-w-0 flex-1 rounded-r-lg border-0 px-2 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-100" /></div></label><p className="mt-1 text-[11px] text-slate-500">Defaults to ₦3,000. Members renew manually every 30 days. Finish Flutterwave payout setup in Settings first.</p></>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500"><i className="fa-solid fa-circle-info mr-1 text-blue-600" />Communities are visible to QuickChat members.</p><button disabled={saving || !form.name.trim()} className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Creating…' : 'Create community'}</button></div>
    </form>}

    {error && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {loading && <p className="p-8 text-center text-sm text-slate-500">Finding communities…</p>}
    {!loading && !error && communities.map((community) => <article key={community.id} className="border-b border-slate-200 p-4 transition-colors hover:bg-slate-50 sm:px-5">
      <div className="flex gap-3">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className={`fa-solid ${community.spaceType === 'page' ? 'fa-flag' : community.spaceType === 'channel' ? 'fa-tower-broadcast' : 'fa-users'}`} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-extrabold text-slate-900">{community.name}</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold capitalize text-blue-700">{community.spaceType || 'community'}</span>{community.category && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{community.category}</span>}</div></div>
          <p className="mt-1 text-xs text-slate-500">{community.members} {community.members === 1 ? 'member' : 'members'}</p>
          {community.isPaid && <p className="mt-1 text-xs font-bold text-emerald-700">₦{Number(community.monthlyPrice).toLocaleString('en-NG')} per 30 days</p>}
          {community.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-700">{community.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={joiningId === community.id || (community.isPaid && community.joined)} onClick={() => toggleJoin(community)} className={`rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50 ${community.joined ? 'border border-slate-300 bg-white text-slate-700' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>{joiningId === community.id ? 'Opening checkout…' : community.isPaid ? community.joined ? 'Pass active' : 'Get 30-day pass' : community.spaceType === 'page' ? community.joined ? 'Following' : 'Follow page' : community.spaceType === 'channel' ? community.joined ? 'Following' : 'Follow channel' : community.joined ? 'Joined' : 'Join community'}</button>
            <Link to={`/communities/${community.id}`} className="rounded-full px-3 py-1.5 text-xs font-bold text-blue-700 no-underline hover:bg-blue-50">Open space <i className="fa-solid fa-arrow-right ml-1 text-[10px]" /></Link>
          </div>
        </div>
      </div>
    </article>)}
    {!loading && !error && communities.length === 0 && <div className="p-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><i className="fa-solid fa-users" /></span><h2 className="mt-3 text-sm font-bold text-slate-900">No communities found</h2><p className="mt-1 text-sm text-slate-500">Try a different search, or create a new community.</p></div>}
  </div>;
}
