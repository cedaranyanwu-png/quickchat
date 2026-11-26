import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

function formatDate(value) {
  if (!value) return 'Not reported';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not reported' : date.toLocaleString();
}
function number(value) { return Number(value || 0).toLocaleString(); }
function percent(value) { return (Number(value || 0) * 100).toFixed(2) + '%'; }
function position(value) { return Number(value || 0).toFixed(1); }

export default function GoogleSearchConsolePanel() {
  const [status, setStatus] = useState(null);
  const [sitemaps, setSitemaps] = useState([]);
  const [indexing, setIndexing] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [inspections, setInspections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);
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
        const [sitemapResult, indexingResult, analyticsResult] = await Promise.all([
          adminRequest('/admin/google-search-console/sitemaps'),
          adminRequest('/admin/google-search-console/indexing'),
          adminRequest('/admin/google-search-console/analytics?days=28'),
        ]);
        setSitemaps(sitemapResult.sitemaps || []);
        setIndexing(indexingResult);
        setAnalytics(analyticsResult);
      } else {
        setSitemaps([]);
        setIndexing(null);
        setAnalytics(null);
      }
    } catch (err) {
      setError(err.message || 'Unable to check Google Search Console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const inspectPages = async () => {
    setInspecting(true);
    setError('');
    try {
      const result = await adminRequest('/admin/google-search-console/inspect-pages', { method: 'POST', body: { limit: 25 } });
      setInspections(result);
    } catch (err) {
      setError(err.message || 'Unable to inspect sitemap pages.');
    } finally {
      setInspecting(false);
    }
  };

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

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-extrabold text-slate-900">Google Search Console · SEO dashboard</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Manage the QuickChat sitemap and view Google search performance, sitemap indexing totals and page-level indexing checks.</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${status?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{loading ? 'Checking…' : status?.connected ? 'Connected' : 'Not connected'}</span>
    </div>

    {status?.propertyUrl && <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl bg-white p-3 text-xs"><div className="font-bold text-slate-700">Search Console property</div><div className="mt-1 break-all text-slate-600">{status.propertyUrl}</div></div>
      <div className="rounded-xl bg-white p-3 text-xs"><div className="font-bold text-slate-700">QuickChat sitemap</div><div className="mt-1 break-all text-slate-600">{status.sitemapUrl}</div></div>
    </div>}

    {status?.message && <p className="text-xs leading-5 text-slate-600">{status.message}</p>}
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}

    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={refresh} disabled={loading} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">Refresh Google data</button>
      <button type="button" onClick={submit} disabled={loading || submitting || !status?.connected} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit sitemap to Google'}</button>
      <button type="button" onClick={inspectPages} disabled={loading || inspecting || !status?.connected} className="rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-xs font-extrabold text-blue-800 disabled:opacity-50">{inspecting ? 'Inspecting pages…' : 'Check page indexing'}</button>
    </div>

    {indexing?.totals && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">URLs submitted</div><div className="mt-1 text-2xl font-black text-slate-900">{number(indexing.totals.submitted)}</div><div className="mt-1 text-[11px] text-slate-500">Reported by Google from submitted sitemaps</div></div>
      <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">URLs indexed</div><div className="mt-1 text-2xl font-black text-emerald-700">{number(indexing.totals.indexed)}</div><div className="mt-1 text-[11px] text-slate-500">Indexed URLs reported in sitemap data</div></div>
      <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Index rate</div><div className="mt-1 text-2xl font-black text-blue-700">{indexing.totals.submitted ? percent(indexing.totals.indexed / indexing.totals.submitted) : '0.00%'}</div><div className="mt-1 text-[11px] text-slate-500">Indexed ÷ submitted</div></div>
      <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sitemaps</div><div className="mt-1 text-2xl font-black text-slate-900">{number(sitemaps.length)}</div><div className="mt-1 text-[11px] text-slate-500">Known by Google</div></div>
    </div>}

    {analytics && <div className="space-y-3">
      <div><h4 className="text-sm font-extrabold text-slate-900">Google Search performance · last {analytics.startDate} to {analytics.endDate}</h4><p className="mt-1 text-[11px] text-slate-500">These are searches in which Google returned QuickChat pages. A page appearing here has search performance data, which is stronger evidence of search visibility than sitemap discovery alone.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Clicks</div><div className="mt-1 text-2xl font-black text-slate-900">{number(analytics.totals.clicks)}</div></div>
        <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Impressions</div><div className="mt-1 text-2xl font-black text-slate-900">{number(analytics.totals.impressions)}</div></div>
        <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">CTR</div><div className="mt-1 text-2xl font-black text-blue-700">{percent(analytics.totals.ctr)}</div></div>
        <div className="rounded-xl bg-white p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Average position</div><div className="mt-1 text-2xl font-black text-blue-700">{position(analytics.totals.position)}</div></div>
      </div>
      {analytics.pages?.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Page appearing in Google Search</th><th className="px-3 py-2">Clicks</th><th className="px-3 py-2">Impressions</th><th className="px-3 py-2">CTR</th><th className="px-3 py-2">Position</th></tr></thead>
        <tbody>{analytics.pages.map((item) => <tr key={item.page} className="border-t border-slate-100"><td className="max-w-md break-all px-3 py-2 font-medium text-slate-700">{item.page}</td><td className="px-3 py-2">{number(item.clicks)}</td><td className="px-3 py-2">{number(item.impressions)}</td><td className="px-3 py-2">{percent(item.ctr)}</td><td className="px-3 py-2">{position(item.position)}</td></tr>)}</tbody></table>
      </div>}
    </div>}

    {sitemaps.length > 0 && <div className="space-y-2">
      <h4 className="text-sm font-extrabold text-slate-900">Sitemaps known to Google</h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Sitemap</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last submitted</th><th className="px-3 py-2">Submitted</th><th className="px-3 py-2">Indexed</th></tr></thead><tbody>
        {sitemaps.map((item) => <tr key={item.path} className="border-t border-slate-100"><td className="max-w-xs break-all px-3 py-2 font-medium text-slate-700">{item.path}</td><td className="px-3 py-2">{item.isPending ? 'Pending' : item.errors ? `${item.errors} errors` : 'Submitted'}</td><td className="whitespace-nowrap px-3 py-2">{formatDate(item.lastSubmitted)}</td><td className="px-3 py-2">{number(item.contents?.reduce((sum, content) => sum + Number(content.submitted || 0), 0))}</td><td className="px-3 py-2 font-bold text-emerald-700">{number(item.contents?.reduce((sum, content) => sum + Number(content.indexed || 0), 0))}</td></tr>)}
      </tbody></table></div>
    </div>}

    {inspections && <div className="space-y-3">
      <div><h4 className="text-sm font-extrabold text-slate-900">Page-level Google indexing checks</h4><p className="mt-1 text-[11px] text-slate-500">QuickChat inspected {inspections.checked} sitemap URLs. {inspections.indexed} returned Google's indexed verdict. This is a sampled inspection, not Google's complete index.</p></div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">URL</th><th className="px-3 py-2">Google verdict</th><th className="px-3 py-2">Coverage</th><th className="px-3 py-2">Last crawl</th></tr></thead><tbody>
        {inspections.urls.map((item) => <tr key={item.url} className="border-t border-slate-100"><td className="max-w-sm break-all px-3 py-2 font-medium text-slate-700">{item.url}</td><td className={`px-3 py-2 font-bold ${item.indexed ? 'text-emerald-700' : item.verdict === 'ERROR' ? 'text-rose-700' : 'text-amber-700'}`}>{item.indexed ? 'Indexed' : item.verdict === 'ERROR' ? 'Inspection error' : item.verdict}</td><td className="max-w-xs px-3 py-2">{item.coverageState}</td><td className="whitespace-nowrap px-3 py-2">{formatDate(item.lastCrawlTime)}</td></tr>)}
      </tbody></table></div>
    </div>}

    <p className="text-[11px] leading-5 text-slate-500">The sitemap indexed total comes from Google's sitemap data. Search Console does not provide a single API endpoint that exports Google's entire Index Coverage report, so the page-level checker uses Google's URL Inspection API on a limited sample. Search performance shows pages that have actually appeared in Google Search.</p>
  </section>;
}
