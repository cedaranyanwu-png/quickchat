import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../api';

const emptyForm = { name: '', feedUrl: '', categories: 'News', region: 'International', enabled: false, syncIntervalMinutes: 15 };

export default function RSSAdmin() {
  const [sources, setSources] = useState([]);
  const [publisherEnabled, setPublisherEnabled] = useState(false);
  const [togglingPublisher, setTogglingPublisher] = useState(false);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sourceResult, logResult] = await Promise.all([
        adminRequest('/admin/rss/sources'),
        adminRequest('/admin/rss/logs?limit=30'),
      ]);
      const statusResult = await adminRequest('/admin/rss/status');
      setPublisherEnabled(Boolean(statusResult.enabled));
      setSources(sourceResult.sources || []);
      setLogs(logResult.logs || []);
    } catch (requestError) {
      setError(requestError.message || 'Could not load RSS administration.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const testFeed = async () => {
    setTesting(true);
    setError('');
    setNotice('');
    setTestResult(null);
    try {
      const result = await adminRequest('/admin/rss/sources/test', { method: 'POST', body: { feedUrl: form.feedUrl.trim() } });
      setTestResult(result);
      setNotice(`Feed verified. ${result.itemCount} items found.`);
    } catch (requestError) { setError(requestError.message || 'Feed test failed.'); }
    finally { setTesting(false); }
  };

  const addSource = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await adminRequest('/admin/rss/sources', {
        method: 'POST',
        body: {
          ...form,
          categories: form.categories.split(',').map((item) => item.trim()).filter(Boolean),
          syncIntervalMinutes: Number(form.syncIntervalMinutes),
        },
      });
      setForm(emptyForm);
      setTestResult(null);
      setNotice('RSS publisher added.');
      await load();
    } catch (requestError) { setError(requestError.message || 'Could not add this publisher.'); }
    finally { setSaving(false); }
  };

  const syncSource = async (source) => {
    setError('');
    setNotice(`Synchronizing ${source.name}…`);
    try {
      const result = await adminRequest(`/admin/rss/sources/${source.id}/sync`, { method: 'POST', body: {} });
      setNotice(`Sync complete: ${result.imported || 0} new articles, ${result.duplicates || 0} duplicates.`);
      await load();
    } catch (requestError) { setError(requestError.message || 'Publisher synchronization failed.'); }
  };

  const toggleSource = async (source) => {
    setError('');
    try {
      await adminRequest(`/admin/rss/sources/${source.id}`, {
        method: 'PATCH',
        body: { enabled: !Number(source.enabled) },
      });
      setNotice(`${source.name} ${Number(source.enabled) ? 'disabled' : 'enabled'}.`);
      await load();
    } catch (requestError) { setError(requestError.message || 'Could not update publisher.'); }
  };

  const disableSource = async (source) => {
    if (!window.confirm(`Disable automatic importing from ${source.name}?`)) return;
    try {
      await adminRequest(`/admin/rss/sources/${source.id}`, { method: 'DELETE' });
      setNotice(`${source.name} disabled.`);
      await load();
    } catch (requestError) { setError(requestError.message || 'Could not disable publisher.'); }
  };

  return <div className="mx-auto min-h-screen max-w-5xl space-y-5 bg-slate-50 px-4 py-5 pb-24">
    <header><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">QuickChat administration</p><h1 className="mt-1 text-xl font-extrabold text-slate-900">RSS publisher management</h1><p className="mt-1 text-xs text-slate-500">Control whether RSS articles appear for every QuickChat user. Feed imports are manual and admin-controlled.</p></header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{notice}</div>}
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0"><h2 className="text-sm font-extrabold text-slate-900">Platform-wide RSS visibility</h2><p className="mt-1 text-xs text-slate-500">When enabled, the RSS Feed tab becomes visible to all users. When disabled, it is hidden across QuickChat.</p></div>
      <button type="button" disabled={togglingPublisher || loading} onClick={async () => {
        setTogglingPublisher(true); setError(''); setNotice('');
        try {
          const result = await adminRequest('/admin/rss/status', { method: 'PUT', body: { enabled: !publisherEnabled } });
          setPublisherEnabled(Boolean(result.enabled));
          setNotice(result.enabled ? 'RSS publisher is now visible to all users.' : 'RSS publisher has been hidden from all users.');
        } catch (requestError) { setError(requestError.message || 'Could not update RSS visibility.'); }
        finally { setTogglingPublisher(false); }
      }} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50 ${publisherEnabled ? 'bg-emerald-600' : 'bg-slate-700'}`}>
        {togglingPublisher ? 'Saving…' : publisherEnabled ? 'Enabled · Turn off' : 'Disabled · Turn on'}
      </button>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-extrabold text-slate-900">Add a publisher</h2>
      <form onSubmit={addSource} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">Publisher name<input required maxLength={150} value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="BBC Technology" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400" /></label>
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">RSS / Atom feed URL<input required type="url" value={form.feedUrl} onChange={(event) => { updateForm('feedUrl', event.target.value); setTestResult(null); }} placeholder="https://example.com/feed.xml" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400" /></label>
        <label className="text-xs font-semibold text-slate-700">Categories (comma separated)<input value={form.categories} onChange={(event) => updateForm('categories', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400" /></label>
        <label className="text-xs font-semibold text-slate-700">Region<select value={form.region} onChange={(event) => updateForm('region', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"><option>Nigeria</option><option>International</option><option>Africa</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Sync interval (minutes)<input type="number" min="10" max="60" value={form.syncIntervalMinutes} onChange={(event) => updateForm('syncIntervalMinutes', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 sm:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(event) => updateForm('enabled', event.target.checked)} />Enable after adding</label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="button" onClick={testFeed} disabled={testing || !form.feedUrl.trim()} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">{testing ? 'Testing…' : 'Test feed'}</button>
          <button type="submit" disabled={saving || !form.name.trim() || !form.feedUrl.trim()} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? 'Adding…' : 'Add publisher'}</button>
        </div>
        {testResult && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 sm:col-span-2"><strong>{testResult.publisher || form.name}</strong> · {testResult.itemCount} feed items detected{testResult.sampleTitles?.length > 0 && <ul className="mt-2 list-disc pl-5">{testResult.sampleTitles.map((title) => <li key={title}>{title}</li>)}</ul>}</div>}
      </form>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-extrabold text-slate-900">Publishers</h2><p className="mt-1 text-[11px] text-slate-500">{sources.length} configured sources</p></div><button type="button" onClick={load} className="text-xs font-bold text-blue-700"><i className="fa-solid fa-rotate mr-1" />Refresh</button></div>
      {loading ? <p className="py-8 text-center text-xs text-slate-500">Loading publishers…</p> : sources.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No RSS publishers configured.</p> : <div className="mt-3 divide-y divide-slate-100">{sources.map((source) => <div key={source.id} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong className="truncate text-sm text-slate-900">{source.name}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${Number(source.enabled) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{Number(source.enabled) ? 'Enabled' : 'Disabled'}</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{source.feed_url}</p><p className="mt-1 text-[10px] text-slate-400">{source.articleCount || 0} articles · Last sync: {source.last_sync_at ? new Date(source.last_sync_at).toLocaleString() : 'Never'}{source.last_error ? ` · Error: ${source.last_error}` : ''}</p></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => syncSource(source)} disabled={!publisherEnabled || !Number(source.enabled)} className="rounded-full border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-40">Sync now</button><button type="button" onClick={() => toggleSource(source)} className="rounded-full border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">{Number(source.enabled) ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => disableSource(source)} className="rounded-full px-2 py-2 text-[11px] font-bold text-red-600 hover:bg-red-50">Remove</button></div>
      </div>)}</div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-extrabold text-slate-900">Recent synchronization logs</h2>
      {logs.length === 0 ? <p className="py-5 text-xs text-slate-500">No synchronization activity recorded yet.</p> : <div className="mt-3 space-y-2">{logs.map((log) => <div key={log.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-50 p-3"><div><div className="text-xs font-bold text-slate-800">Source #{log.source_id} · {log.status}</div><p className="mt-1 text-[11px] text-slate-500">{log.imported_count || 0} imported · {log.duplicate_count || 0} duplicates · {log.fetched_count || 0} fetched</p>{log.error_message && <p className="mt-1 text-[11px] text-red-600">{log.error_message}</p>}</div><time className="text-[10px] text-slate-400">{log.started_at ? new Date(log.started_at).toLocaleString() : ''}</time></div>)}</div>}
    </section>
  </div>;
}
