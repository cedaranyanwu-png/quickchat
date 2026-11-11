import React, { useEffect, useState } from 'react';
import { adminRequest } from '../../api';

const n = (v) => Number(v || 0).toLocaleString();
const date = (v) => v ? new Date(v).toLocaleString() : '—';

export default function AdminAcquisitionPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminRequest('/admin/growth/attribution').then(setData).catch((e) => setError(e.message || 'Could not load acquisition analytics.')); }, []);
  if (error) return <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-slate-500">Loading acquisition analytics…</p>;
  return <section className="space-y-5">
    <header><h2 className="text-lg font-black text-slate-900">Signup source analytics</h2><p className="mt-1 text-sm text-slate-500">See the recorded source, campaign, referral owner and landing page for new registrations.</p></header>
    <div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-bold text-white/60">Total attributed signups</p><p className="mt-2 text-4xl font-black">{n(data.total)}</p><p className="mt-1 text-xs text-white/50">Attribution records captured after this feature is deployed.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4"><h3 className="font-extrabold text-slate-900">Users by source</h3></div>{data.sources.map((row)=><div key={row.source} className="flex justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-0"><span className="font-semibold capitalize text-slate-700">{row.source}</span><strong>{n(row.users)}</strong></div>)}{!data.sources.length&&<p className="p-5 text-xs text-slate-500">No attribution records yet.</p>}</div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4"><h3 className="font-extrabold text-slate-900">Campaign breakdown</h3></div>{data.campaigns.map((row,i)=><div key={i} className="flex justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0"><span className="min-w-0"><strong className="block truncate text-slate-800">{row.campaign}</strong><span className="text-xs text-slate-500">{row.source}</span></span><strong>{n(row.users)}</strong></div>)}{!data.campaigns.length&&<p className="p-5 text-xs text-slate-500">No tagged campaigns yet.</p>}</div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4"><h3 className="font-extrabold text-slate-900">Latest attributed registrations</h3><p className="mt-1 text-xs text-slate-500">Up to 100 latest records.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">New user</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Campaign / medium</th><th className="px-4 py-3">Referrer ID</th><th className="px-4 py-3">Landing page</th><th className="px-4 py-3">Registered</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recent.map((row)=><tr key={row.user_id}><td className="px-4 py-3"><strong className="block text-slate-800">{row.fullname || row.username || 'QuickChat user'}</strong><span className="text-slate-500">{row.email || row.username || '—'}</span></td><td className="px-4 py-3 font-semibold capitalize">{row.source}</td><td className="px-4 py-3">{row.campaign || '—'}<span className="block text-slate-400">{row.medium || '—'}</span></td><td className="px-4 py-3">{row.referrer_id || '—'}</td><td className="px-4 py-3">{row.landing_path || '—'}</td><td className="px-4 py-3 text-slate-500">{date(row.created_at)}</td></tr>)}</tbody></table></div>{!data.recent.length&&<p className="p-6 text-center text-sm text-slate-500">No new signups have been attributed yet.</p>}</div>
  </section>;
}
