import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';
import CreatorSidebar from '../components/CreatorSidebar';

const EMPTY = { text: '', category: '', hashtags: '', scheduledAt: '', visibility: 'public', destination: 'profile', media: [], targetInterests: [] };
const toIso = (v) => { if (!v) return ''; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : ''; };
const formatDate = (v) => { try { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); } catch (_) { return v; } };

export default function CreatorContentLibrary() {
  const [form, setForm] = useState(EMPTY);
  const [items, setItems] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => { const data = await apiRequest('/creator/content-library'); setItems(data.items || []); }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const analyze = async () => {
    setBusy(true); setNotice(''); setError('');
    try {
      const result = await apiRequest('/creator/content-library/analyze', { method: 'POST', body: { text: form.text, hashtags: form.hashtags.split(/[,s]+/).filter(Boolean) } });
      setAnalysis(result);
      setNotice('Content analyzed. Recommendation intelligence is ready.');
    } catch (e) { setError(e.message || 'Analysis failed.'); } finally { setBusy(false); }
  };

  const schedule = async (event) => {
    event.preventDefault(); setBusy(true); setNotice(''); setError('');
    try {
      const result = await apiRequest('/creator/content-library/schedule', {
        method: 'POST',
        body: { ...form, hashtags: form.hashtags.split(/[,s]+/).filter(Boolean), scheduledAt: toIso(form.scheduledAt) }
      });
      setItems((prev) => [...prev, result.item]);
      setForm(EMPTY); setAnalysis(null); setNotice(result.message);
    } catch (e) { setError(e.message || 'Could not schedule post.'); } finally { setBusy(false); }
  };

  const cancel = async (id) => {
    try { await apiRequest('/creator/content-library/'+id+'/cancel', { method: 'POST', body: {} }); setItems((p) => p.map((x) => x.id === id ? { ...x, status: 'cancelled' } : x)); }
    catch (e) { setError(e.message); }
  };

  const publishNow = async (id) => {
    try { const result = await apiRequest('/creator/content-library/'+id+'/publish-now', { method: 'POST', body: {} }); setNotice(result.message); await load(); }
    catch (e) { setError(e.message); }
  };

  return <div className="min-h-screen bg-slate-50"><CreatorSidebar/><main className="min-h-screen bg-slate-50 lg:ml-64">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <div><Link to="/creator" className="text-sm font-black text-slate-950 no-underline">QUICKCHAT CREATOR</Link><p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-blue-700">Content Library</p></div>
      <Link to="/creator" className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 no-underline">Creator dashboard</Link>
    </div></header>
    <div className="mx-auto max-w-6xl px-4 py-6">
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <form onSubmit={schedule} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><h1 className="text-xl font-black text-slate-950">Schedule content</h1><p className="mt-1 text-xs leading-5 text-slate-500">QuickChat analyzes the post now, stores the signals, and publishes it automatically later.</p></div>
          <textarea required={!form.media.length} value={form.text} onChange={(e)=>setForm({...form,text:e.target.value})} rows="8" maxLength="5000" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-600" placeholder="Write your caption or post…"/>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Topic/category<select value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">Auto-detect</option>{['Technology','Programming','Artificial Intelligence','Business','Entrepreneurship','Education','Comedy','Music','Gaming','Sports','Fashion','Science','Digital Marketing','Design','Photography','Entertainment','Health and Fitness','Finance'].map(x=><option key={x}>{x}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Publish at<input required type="datetime-local" value={form.scheduledAt} onChange={(e)=>setForm({...form,scheduledAt:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/></label>
          </div>
          <label className="block text-xs font-bold text-slate-600">Hashtags<input value={form.hashtags} onChange={(e)=>setForm({...form,hashtags:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="ai, programming, quickchat"/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Destination<select value={form.destination} onChange={(e)=>setForm({...form,destination:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="profile">My profile</option><option value="page">Creator page</option><option value="community">Community</option><option value="channel">Channel</option></select></label>
            <label className="text-xs font-bold text-slate-600">Visibility<select value={form.visibility} onChange={(e)=>setForm({...form,visibility:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="public">Public</option><option value="fans">Fans only</option><option value="premium">Premium</option></select></label>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><strong>Recommendation preparation:</strong> topics, interests, keywords and audience signals are generated before publication and saved with the scheduled content.</div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={analyze} className="rounded-xl border border-blue-200 px-4 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-50"><i className="fa-solid fa-wand-magic-sparkles mr-2"/>Analyze now</button><button disabled={busy} className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Working…' : 'Schedule post'}</button></div>
        </form>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-950">Pre-publication intelligence</h2>{analysis ? <div className="mt-3 space-y-3"><div><p className="text-[10px] font-black uppercase text-slate-400">Topics</p><div className="mt-1 flex flex-wrap gap-1.5">{analysis.topics.map(x=><span key={x} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{x}</span>)}</div></div><div><p className="text-[10px] font-black uppercase text-slate-400">Keywords</p><p className="mt-1 text-xs text-slate-600">{analysis.keywords.join(', ') || 'None detected'}</p></div><div><p className="text-[10px] font-black uppercase text-slate-400">Likely audience</p><p className="mt-1 text-xs text-slate-600">{analysis.audiences.join(', ') || 'General audience'}</p></div><div><p className="text-[10px] font-black uppercase text-slate-400">Interests</p><p className="mt-1 text-xs text-slate-600">{analysis.interests.join(', ') || 'None detected'}</p></div></div> : <p className="mt-3 text-xs leading-5 text-slate-500">Scheduling also analyzes automatically, so the creator cannot accidentally skip recommendation preparation.</p>}</section>
          <section className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Pipeline</p><ol className="mt-3 space-y-3 text-xs leading-5 text-slate-300"><li><strong className="text-white">1.</strong> Schedule.</li><li><strong className="text-white">2.</strong> Classify immediately.</li><li><strong className="text-white">3.</strong> Store recommendation signals.</li><li><strong className="text-white">4.</strong> Publish automatically.</li><li><strong className="text-white">5.</strong> Normal feed ranking reads the prepared signals.</li></ol></section>
        </aside>
      </div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-950">Scheduled queue</h2><p className="mt-1 text-xs text-slate-500">Stored on the server. Closing the browser will not stop publication.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{items.filter(i=>i.status==='scheduled').length} scheduled</span></div>
        <div className="mt-4 space-y-3">{items.length ? items.map(item=><article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-1.5">{(item.topics||[]).map(x=><span key={x} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{x}</span>)}<span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{item.status}</span></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{item.text || 'Media post'}</p><p className="mt-2 text-[11px] text-slate-500">{item.status==='scheduled' ? 'Publishes '+formatDate(item.scheduledAt) : item.publishedPostId ? 'Published post #'+item.publishedPostId : 'Updated '+formatDate(item.updatedAt)}</p><p className="mt-1 text-[10px] text-emerald-700">{item.analysisStatus==='ready' ? '✓ Recommendation intelligence ready' : 'Analysis pending'}</p></div>{item.status==='scheduled' && <div className="flex shrink-0 gap-2"><button onClick={()=>publishNow(item.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">Publish now</button><button onClick={()=>cancel(item.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700">Cancel</button></div>}</div></article>) : <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">No scheduled content yet.</div>}</div>
      </section>
    </div>
  </main></div>;
}
