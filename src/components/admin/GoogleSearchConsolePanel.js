import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

function formatDate(value) {
  if (!value) return 'Not reported';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not reported' : date.toLocaleString();
}

export default function GoogleSearchConsolePanel() {
  const [status, setStatus] = useState(null);
  const [sitemaps, setSitemaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminRequest('/admin/google-search-console/status');
      setStatus(result);
      if (result.connected) {
        const sitemapResult = await adminRequest('/admin/google-search-console/sitemaps');
        setSitemaps(sitemapResult.sitemaps || []);
      } else {
        setSitemaps([]);
      }
    } catch (err) {
      setError(err.message || 'Unable to check Google Search Console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await adminRequest('/admin/google-search-console/submit-sitemap', { method: 'POST', body: {} });
      setMessage(result.message || 'Sitemap submitted.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Sitemap submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-extrabold text-slate-900">Google Search Console · sitemap submission</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Connect QuickChat's existing XML sitemap to Google. This submits the sitemap URL; Google controls crawling and indexing.</p></div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${status?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{loading ? 'Checking…' : status?.connected ? 'Connected' : 'Not connected'}</span>
    </div>
    {status?.propertyUrl && <div className="rounded-xl bg-white p-3 text-xs"><div className="font-bold text-slate-700">Search Console property</div><div className="mt-1 break-all text-slate-600">{status.propertyUrl}</div></div>}
    {status?.sitemapUrl && <div className="rounded-xl bg-white p-3 text-xs"><div className="font-bold text-slate-700">Sitemap URL</div><div className="mt-1 break-all text-slate-600">{status.sitemapUrl}</div></div>}
    {status?.message && <p className="text-xs leading-5 text-slate-600">{status.message}</p>}
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={refresh} disabled={loading} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">Refresh status</button>
      <button type="button" onClick={submit} disabled={loading || submitting || !status?.connected} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit sitemap to Google'}</button>
    </div>
    {sitemaps.length > 0 && <div className="space-y-2"><h4 className="text-xs font-extrabold text-slate-800">Sitemaps known to Google</h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Sitemap</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last submitted</th><th className="px-3 py-2">Discovered URLs</th></tr></thead><tbody>
        {sitemaps.map((item) => <tr key={item.path} className="border-t border-slate-100"><td className="max-w-xs break-all px-3 py-2 font-medium text-slate-700">{item.path}</td><td className="px-3 py-2">{item.isPending ? 'Pending' : item.errors ? `${item.errors} errors` : 'Submitted'}</td><td className="whitespace-nowrap px-3 py-2">{formatDate(item.lastSubmitted)}</td><td className="px-3 py-2">{Number(item.contents?.reduce((sum, content) => sum + Number(content.indexed || 0), 0) || 0).toLocaleString()}</td></tr>)}
      </tbody></table></div>
    </div>}
    <p className="text-[11px] leading-5 text-slate-500">Submitting a sitemap is a discovery hint, not a guarantee that Google will index every URL. Keep public pages crawlable and avoid submitting private or authenticated URLs.</p>
  </section>;
}
