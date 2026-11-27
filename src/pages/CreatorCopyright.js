import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api';
import CreatorSidebar from '../components/CreatorSidebar';

const dateLabel = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
};

export default function CreatorCopyright() {
  const [assets, setAssets] = useState([]);
  const [available, setAvailable] = useState([]);
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [protectedData, availableData] = await Promise.all([
      apiRequest('/creator/copyright'),
      apiRequest('/creator/copyright/available'),
    ]);
    setAssets(protectedData.assets || []);
    setMatches(protectedData.matches || []);
    setAvailable(availableData.items || []);
  }, []);

  useEffect(() => { load().catch((e) => setError(e.message || 'Could not load Copyright Guard.')); }, [load]);

  const run = async (key, action) => {
    setBusy(key); setError(''); setNotice('');
    try {
      const result = await action();
      setNotice(result.message || 'Copyright Guard updated.');
      await load();
    } catch (e) { setError(e.message || 'The request could not be completed.'); }
    finally { setBusy(''); }
  };

  const protect = (postId) => run('protect-' + postId, () =>
    apiRequest('/creator/copyright/protect/' + postId, { method: 'POST', body: {} })
  );

  const scan = (assetId) => run('scan-' + assetId, () =>
    apiRequest('/creator/copyright/scan/' + assetId, { method: 'POST', body: {} })
  );

  const decide = (matchId, action) => run('action-' + matchId, () =>
    apiRequest('/creator/copyright/matches/' + matchId + '/action', { method: 'POST', body: { action } })
  );

  return <div className="min-h-screen bg-slate-50">
    <CreatorSidebar />
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 lg:ml-64 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-700">Creator tools / JEV AI</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Copyright Guard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Register your published work, scan public post captions for substantial text reuse, and review possible matches detected by JEV.</p>
        </div>
        <button type="button" onClick={() => load().catch((e) => setError(e.message))} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><i className="fa-solid fa-rotate mr-2"/>Refresh</button>
      </div>

      {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Protected works</p><p className="mt-2 text-3xl font-black text-slate-950">{assets.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Possible matches</p><p className="mt-2 text-3xl font-black text-slate-950">{matches.filter((m) => !['dismissed'].includes(m.status)).length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">Awaiting review</p><p className="mt-2 text-3xl font-black text-slate-950">{matches.filter((m) => m.status === 'new').length}</p></div>
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-lg font-black text-slate-950">Register published content</h2><p className="mt-1 text-xs text-slate-500">Choose a post you own to add it to your protected-work list.</p></div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700">{available.length} available</span>
        </div>
        {!available.length ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">All your published posts are registered, or you have no published posts yet.</p> :
          <div className="mt-4 divide-y divide-slate-100">
            {available.map((post) => <div key={post.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{post.text || (post.kind + ' post')}</p><p className="mt-1 text-[11px] text-slate-400">Post #{post.id} · {dateLabel(post.createdAt)}</p></div>
              <button type="button" disabled={Boolean(busy)} onClick={() => protect(post.id)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'protect-' + post.id ? 'Registering…' : 'Protect work'}</button>
            </div>)}
          </div>}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Protected works</h2>
        <p className="mt-1 text-xs text-slate-500">Run a scan to compare your registered caption against recent public QuickChat post captions.</p>
        {!assets.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No protected works yet. Register one of your published posts above.</p> :
          <div className="mt-3 divide-y divide-slate-100">
            {assets.map((asset) => <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{asset.text || (asset.kind + ' post')}</p><p className="mt-1 text-[11px] text-slate-400">Post #{asset.postId} · Added {dateLabel(asset.createdAt)}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Registered fingerprint</p></div>
              <button type="button" disabled={Boolean(busy)} onClick={() => scan(asset.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-50"><i className="fa-solid fa-magnifying-glass mr-2"/>{busy === 'scan-' + asset.id ? 'Scanning…' : 'Scan public posts'}</button>
            </div>)}
          </div>}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Potential matches</h2>
        <p className="mt-1 text-xs text-slate-500">Review each result before reporting it. A match score is an AI signal, not a legal determination.</p>
        {!matches.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No possible matches have been detected yet.</p> :
          <div className="mt-3 space-y-3">
            {matches.map((match) => <article key={match.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="text-sm font-black text-slate-900">Possible match · @{match.username || 'creator'}</p><p className="mt-1 text-[11px] text-slate-400">Post #{match.postId} · {dateLabel(match.createdAt)}</p></div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">{Math.round(match.confidence * 100)}% JEV confidence</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{match.text}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{match.assessment}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status: {match.status}</p>
              {match.status === 'new' && <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(match.id, 'confirm')} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">This is my work</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(match.id, 'report')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Submit report</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(match.id, 'dismiss')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Dismiss</button>
              </div>}
            </article>)}
          </div>}
      </section>

      <aside className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-black text-amber-900"><i className="fa-solid fa-circle-info mr-2"/>Detection coverage</p>
        <p className="mt-1 text-xs leading-5 text-amber-900">This first release scans text captions on public posts and records exact normalized caption fingerprints. JEV's image input is currently experimental, and this feature does not yet perform image, video-frame, or audio fingerprint matching. Private posts are excluded. Do not treat an alert as proof of infringement.</p>
      </aside>
    </main>
  </div>;
}
