import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export default function TrafficVisitsPanel() {
  const [result, setResult] = useState({ visits: [], total: 0, page: 1, limit: 50 });
  const [ip, setIp] = useState('');
  const [path, setPath] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(nextPage), limit: '50' });
      if (ip.trim()) query.set('ip', ip.trim());
      if (path.trim()) query.set('path', path.trim());
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const data = await adminRequest('/admin/traffic/visits?' + query.toString());
      setResult(data);
      setPage(nextPage);
    } catch (err) {
      setError(err.message || 'Unable to load visitor activity.');
    } finally {
      setLoading(false);
    }
  }, [ip, path, from, to]);

  useEffect(() => { load(1); }, []); // Initial load only; filters are applied explicitly.

  const pages = Math.max(1, Math.ceil(Number(result.total || 0) / 50));
  const clearFilters = () => {
    setIp(''); setPath(''); setFrom(''); setTo('');
    setResult({ visits: [], total: 0, page: 1, limit: 50 });
    setPage(1);
    setTimeout(() => adminRequest('/admin/traffic/visits?page=1&limit=50').then(setResult).catch((err) => setError(err.message || 'Unable to load visitor activity.')), 0);
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-extrabold text-slate-900">QuickChat visitor activity</h3>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">A separate record is stored for each page navigation. Repeat visits from the same IP remain separate rows with their own timestamps. This is first-party website traffic, not Google Search Console visitor data.</p>
      </div>
      <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{Number(result.total || 0).toLocaleString()} visits</div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-[11px] font-bold text-slate-600">IP address
        <input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="Search IP" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-800" />
      </label>
      <label className="text-[11px] font-bold text-slate-600">Page path
        <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/explore" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-800" />
      </label>
      <label className="text-[11px] font-bold text-slate-600">From date
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
      </label>
      <label className="text-[11px] font-bold text-slate-600">To date
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => load(1)} disabled={loading} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? 'Loading…' : 'Apply filters'}</button>
      <button type="button" onClick={clearFilters} disabled={loading} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">Clear filters</button>
      <button type="button" onClick={() => load(page)} disabled={loading} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">Refresh</button>
    </div>
    {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr>
          <th className="whitespace-nowrap px-3 py-3">Timestamp</th><th className="px-3 py-3">IP address</th>
          <th className="px-3 py-3">Device</th><th className="px-3 py-3">Browser / OS</th>
          <th className="px-3 py-3">Network / ISP</th><th className="px-3 py-3">Page</th>
          <th className="px-3 py-3">Referrer</th><th className="px-3 py-3">Traffic flag</th>
        </tr></thead>
        <tbody>
          {result.visits.map((visit) => <tr key={visit.id} className="border-t border-slate-100 align-top">
            <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{formatTimestamp(visit.timestamp)}</td>
            <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-slate-900">{visit.ip}</td>
            <td className="px-3 py-3 text-slate-700">{visit.device}</td>
            <td className="px-3 py-3 text-slate-700">{visit.browser}<div className="text-[10px] text-slate-500">{visit.operatingSystem}</div></td>
            <td className="px-3 py-3 text-slate-500">{visit.networkProvider || 'Not available'}</td>
            <td className="max-w-xs break-all px-3 py-3 font-medium text-blue-700">{visit.page}</td>
            <td className="max-w-xs break-all px-3 py-3 text-slate-500">{visit.referrer || 'Direct / unknown'}</td>
            <td className="px-3 py-3">{visit.isBot ? <span className="font-bold text-amber-700">Flagged ({visit.botScore})</span> : <span className="text-emerald-700">Normal</span>}</td>
          </tr>)}
          {!loading && result.visits.length === 0 && <tr><td colSpan="8" className="px-3 py-8 text-center text-slate-500">No page visits match these filters yet.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>Page {page} of {pages} · newest visits first</span>
      <div className="flex gap-2">
        <button type="button" onClick={() => load(Math.max(1, page - 1))} disabled={loading || page <= 1} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button>
        <button type="button" onClick={() => load(Math.min(pages, page + 1))} disabled={loading || page >= pages} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button>
      </div>
    </div>
    <p className="text-[11px] leading-5 text-slate-500">IP addresses are visible only inside this permission-protected admin view. Network/ISP is marked unavailable because QuickChat does not currently use a verified ASN/IP intelligence provider; no carrier is guessed from an IP address.</p>
  </section>;
}
