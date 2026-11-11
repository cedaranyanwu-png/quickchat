import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest, uploadMedia } from '../api';
import CreatorSidebar from '../components/CreatorSidebar';

const EMPTY = { text: '', category: '', hashtags: '', scheduledAt: '', visibility: 'public', destination: 'profile', communityId: '', media: [], targetInterests: [] };
const toIso = (v) => { if (!v) return ''; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : ''; };
const formatDate = (v) => { try { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); } catch (_) { return v; } };

export default function CreatorContentLibrary() {
  const [searchParams] = useSearchParams();
  const requestedDestination = ['profile', 'community', 'page', 'channel'].includes(searchParams.get('destination')) ? searchParams.get('destination') : 'profile';
  const requestedCommunityId = searchParams.get('communityId') || '';
  const [form, setForm] = useState(() => ({ ...EMPTY, destination: requestedDestination, communityId: requestedCommunityId }));
  const [items, setItems] = useState([]);
  const [spaces, setSpaces] = useState({ communities: [], pages: [], channels: [] });
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaKind, setMediaKind] = useState('image');
  const [previews, setPreviews] = useState([]);

  const load = useCallback(async () => {
    const [data, entityData] = await Promise.all([
      apiRequest('/creator/content-library'),
      apiRequest('/creator-studio/entities')
    ]);
    setItems(data.items || []);
    const nextSpaces = { communities: entityData.communities || [], pages: entityData.pages || [], channels: entityData.channels || [] };
    setSpaces(nextSpaces);
    if (requestedCommunityId) {
      const match = Object.entries(nextSpaces).find(([, rows]) => rows.some((space) => String(space.platformId) === String(requestedCommunityId)));
      if (match) setForm((current) => ({ ...current, destination: match[0] === 'pages' ? 'page' : match[0] === 'channels' ? 'channel' : 'community', communityId: requestedCommunityId }));
    }
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!requestedCommunityId || requestedDestination === 'profile') return;
    setForm((current) => ({ ...current, destination: requestedDestination, communityId: requestedCommunityId }));
  }, [requestedDestination, requestedCommunityId]);


  const chooseMediaKind = (kind) => { setMediaKind(kind); setForm((current) => ({ ...current, media: [] })); setPreviews([]); };
  const addMedia = async (event) => {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length) return;
    const isVideo = mediaKind === 'video';
    if (isVideo && (files.length !== 1 || !files[0].type.startsWith('video/'))) return setError('Choose one video file.');
    if (!isVideo && files.some((file) => !file.type.startsWith('image/'))) return setError('Choose image files only.');
    if (mediaKind === 'carousel' && form.media.length + files.length > 10) return setError('A carousel can contain up to 10 images.');
    if (mediaKind === 'image' && form.media.length + files.length > 1) return setError('Choose Carousel for multiple images.');
    setMediaBusy(true); setError(''); setNotice('');
    const uploaded = []; const localPreviews = [];
    try {
      for (const file of files) {
        const result = await uploadMedia(file);
        uploaded.push({ ...result, type: isVideo ? 'video' : 'image' });
        localPreviews.push({ previewUrl: URL.createObjectURL(file), type: isVideo ? 'video' : 'image', name: file.name });
      }
      setForm((current) => ({ ...current, media: [...current.media, ...uploaded] }));
      setPreviews((current) => [...current, ...localPreviews]);
      setNotice('Media uploaded and ready to analyze or publish.');
    } catch (e) { setError(e.message || 'Media upload failed.'); }
    finally { setMediaBusy(false); }
  };
  const removeMedia = (index) => { setForm((current) => ({ ...current, media: current.media.filter((_, i) => i !== index) })); setPreviews((current) => current.filter((_, i) => i !== index)); };
  const moveMedia = (index, direction) => {
    const target = index + direction; if (target < 0 || target >= form.media.length) return;
    setForm((current) => { const media = [...current.media]; [media[index], media[target]] = [media[target], media[index]]; return { ...current, media }; });
    setPreviews((current) => { const list = [...current]; [list[index], list[target]] = [list[target], list[index]]; return list; });
  };

  const publishAnalyzedNow = async () => {
    if (!analysis) return setError('Analyze this post before publishing it immediately.');
    setBusy(true); setNotice(''); setError('');
    try {
      const result = await apiRequest('/creator/content-library/publish-now', { method: 'POST', body: { ...form, hashtags: form.hashtags.split(/[,\s]+/).filter(Boolean) } });
      setNotice(result.message);
      setForm((current) => ({ ...EMPTY, destination: current.destination, communityId: current.communityId }));
      setPreviews([]); setMediaKind('image'); setAnalysis(null);
      await load();
    } catch (e) { setError(e.message || 'Could not publish post.'); } finally { setBusy(false); }
  };

  const analyze = async () => {
    setBusy(true); setNotice(''); setError('');
    try {
      const result = await apiRequest('/creator/content-library/analyze', { method: 'POST', body: { text: form.text, hashtags: form.hashtags.split(/[,\s]+/).filter(Boolean) } });
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
      setForm((current) => ({ ...EMPTY, destination: current.destination, communityId: current.communityId })); setPreviews([]); setMediaKind('image'); setAnalysis(null); setNotice(result.message);
    } catch (e) { setError(e.message || 'Could not schedule post.'); } finally { setBusy(false); }
  };

  const cancel = async (id) => {
    try { await apiRequest('/creator/content-library/'+id+'/cancel', { method: 'POST', body: {} }); setItems((p) => p.map((x) => x.id === id ? { ...x, status: 'cancelled' } : x)); }
    catch (e) { setError(e.message); }
  };

  const destinationKey = form.destination === 'page' ? 'pages' : form.destination === 'channel' ? 'channels' : 'communities';
  const destinationSpaces = spaces[destinationKey] || [];

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
          <div><h1 className="text-xl font-black text-slate-950">Create content</h1><p className="mt-1 text-xs leading-5 text-slate-500">Analyze your post, then publish immediately or choose an optional schedule.</p>{form.destination !== 'profile' && <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800"><i className={`fa-solid ${form.destination === 'page' ? 'fa-flag' : form.destination === 'channel' ? 'fa-tower-broadcast' : 'fa-users'}`} />Publishing to {destinationSpaces.find((space) => String(space.platformId) === String(form.communityId))?.name || `selected ${form.destination}`}</p>}</div>

          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">Post format</p>
            <div className="grid grid-cols-3 gap-2">
              {['image', 'video', 'carousel'].map((kind) => <button key={kind} type="button" onClick={() => chooseMediaKind(kind)} className={"rounded-xl border px-3 py-3 text-xs font-bold " + (mediaKind === kind ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>
                <i className={"fa-solid " + (kind === 'image' ? 'fa-image' : kind === 'video' ? 'fa-video' : 'fa-images') + " mb-1 block text-base"}/>{kind === 'image' ? 'Single image' : kind === 'video' ? 'Video' : 'Carousel'}
              </button>)}
            </div>
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
              <i className="fa-solid fa-cloud-arrow-up text-xl text-blue-600"/>
              <span className="mt-2 text-xs font-bold text-slate-700">{mediaBusy ? 'Uploading media…' : mediaKind === 'video' ? 'Choose a video' : mediaKind === 'carousel' ? 'Choose up to 10 images' : 'Choose one image'}</span>
              <span className="mt-1 text-[10px] text-slate-500">{mediaKind === 'video' ? 'MP4, WebM or MOV · up to 500 MB' : 'JPG, PNG, GIF or WebP · up to 15 MB each'}</span>
              <input type="file" accept={mediaKind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'} multiple={mediaKind === 'carousel'} onChange={addMedia} disabled={mediaBusy || (mediaKind !== 'carousel' && form.media.length >= 1) || (mediaKind === 'carousel' && form.media.length >= 10)} className="sr-only"/>
            </label>
            {previews.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {previews.map((item, index) => <div key={item.previewUrl} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                {item.type === 'video' ? <video src={item.previewUrl} controls className="h-32 w-full object-contain"/> : <img src={item.previewUrl} alt={item.name} className="h-32 w-full object-cover"/>}
                {mediaKind === 'carousel' && <span className="absolute left-2 top-2 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-white">Slide {index + 1}</span>}
                <div className="absolute right-1 top-1 flex gap-1"><button type="button" onClick={() => moveMedia(index, -1)} disabled={index === 0} className="rounded-md bg-white/90 px-2 py-1 text-xs">←</button><button type="button" onClick={() => moveMedia(index, 1)} disabled={index === previews.length - 1} className="rounded-md bg-white/90 px-2 py-1 text-xs">→</button><button type="button" onClick={() => removeMedia(index)} className="rounded-md bg-rose-600 px-2 py-1 text-xs text-white">×</button></div>
              </div>)}
            </div>}
            {mediaKind === 'carousel' && <p className="mt-2 text-[10px] text-slate-500">Use the arrows to arrange slides. Viewers can swipe through the images.</p>}
          </div>
          <textarea required={!form.media.length} value={form.text} onChange={(e)=>setForm({...form,text:e.target.value})} rows="8" maxLength="5000" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-600" placeholder="Write your caption or post…"/>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Topic/category<select value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">Auto-detect</option>{['Technology','Programming','Artificial Intelligence','Business','Entrepreneurship','Education','Comedy','Music','Gaming','Sports','Fashion','Science','Digital Marketing','Design','Photography','Entertainment','Health and Fitness','Finance'].map(x=><option key={x}>{x}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Schedule for later (optional)<input type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0,16)} value={form.scheduledAt} onChange={(e)=>setForm({...form,scheduledAt:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/><span className="mt-1 block text-[10px] font-normal text-slate-400">Leave empty to publish now after analysis.</span></label>
          </div>
          <label className="block text-xs font-bold text-slate-600">Hashtags<input value={form.hashtags} onChange={(e)=>setForm({...form,hashtags:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="ai, programming, quickchat"/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Destination<select value={form.destination} onChange={(e)=>setForm({...form,destination:e.target.value,communityId:''})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="profile">My profile</option><option value="page">Creator page</option><option value="community">Community</option><option value="channel">Channel</option></select></label>
            <label className="text-xs font-bold text-slate-600">Visibility<select value={form.visibility} onChange={(e)=>setForm({...form,visibility:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="public">Public</option><option value="fans">Fans only</option><option value="premium">Premium</option></select></label>
          {form.destination !== 'profile' && <label className="block text-xs font-bold text-slate-600">{form.destination === 'page' ? 'Choose page' : form.destination === 'channel' ? 'Choose channel' : 'Choose community'}<select required value={form.communityId} onChange={(e)=>setForm({...form,communityId:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">Select a destination</option>{destinationSpaces.map((space)=><option key={space.platformId} value={space.platformId}>{space.name}</option>)}</select>{destinationSpaces.length === 0 && <span className="mt-1 block text-[10px] font-normal text-amber-700">Create a {form.destination} in Creator Studio first.</span>}</label>}

          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><strong>Recommendation preparation:</strong> analyze first so topics, interests, keywords and audience signals are ready before immediate or scheduled publication.</div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || mediaBusy || (!form.text.trim() && !form.media.length)} onClick={analyze} className="rounded-xl border border-blue-200 px-4 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-50"><i className="fa-solid fa-wand-magic-sparkles mr-2"/>Analyze post</button><button type="button" disabled={busy || mediaBusy || !analysis} onClick={publishAnalyzedNow} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"><i className="fa-solid fa-paper-plane mr-2"/>{busy ? 'Publishing…' : 'Publish now'}</button><button type="submit" disabled={busy || mediaBusy || !form.scheduledAt} className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Working…' : 'Schedule for later'}</button></div>
        </form>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-950">Pre-publication intelligence</h2>{analysis ? <div className="mt-3 space-y-3"><div><p className="text-[10px] font-black uppercase text-slate-400">Topics</p><div className="mt-1 flex flex-wrap gap-1.5">{analysis.topics.map(x=><span key={x} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{x}</span>)}</div></div><div><p className="text-[10px] font-black uppercase text-slate-400">Keywords</p><p className="mt-1 text-xs text-slate-600">{analysis.keywords.join(', ') || 'None detected'}</p></div><div><p className="text-[10px] font-black uppercase text-slate-400">Likely audience</p><p className="mt-1 text-xs text-slate-600">{analysis.audiences.join(', ') || 'General audience'}</p></div><div><p className="text-[10px] font-black uppercase text-slate-400">Interests</p><p className="mt-1 text-xs text-slate-600">{analysis.interests.join(', ') || 'None detected'}</p></div></div> : <p className="mt-3 text-xs leading-5 text-slate-500">Scheduling also analyzes automatically, so the creator cannot accidentally skip recommendation preparation.</p>}</section>
          <section className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Pipeline</p><ol className="mt-3 space-y-3 text-xs leading-5 text-slate-300"><li><strong className="text-white">1.</strong> Write or upload content.</li><li><strong className="text-white">2.</strong> Analyze the post.</li><li><strong className="text-white">3.</strong> Store recommendation signals.</li><li><strong className="text-white">4.</strong> Publish now or schedule it.</li><li><strong className="text-white">5.</strong> Feed ranking reads the prepared signals.</li></ol></section>
        </aside>
      </div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-950">Scheduled queue</h2><p className="mt-1 text-xs text-slate-500">Stored on the server. Closing the browser will not stop publication.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{items.filter(i=>i.status==='scheduled').length} scheduled</span></div>
        <div className="mt-4 space-y-3">{items.length ? items.map(item=><article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-1.5">{(item.topics||[]).map(x=><span key={x} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{x}</span>)}<span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{item.status}</span></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{item.text || 'Media post'}</p><p className="mt-2 text-[11px] text-slate-500">{item.status==='scheduled' ? 'Publishes '+formatDate(item.scheduledAt) : item.publishedPostId ? 'Published post #'+item.publishedPostId : 'Updated '+formatDate(item.updatedAt)}</p><p className="mt-1 text-[10px] text-emerald-700">{item.analysisStatus==='ready' ? '✓ Recommendation intelligence ready' : 'Analysis pending'}</p></div>{item.status==='scheduled' && <div className="flex shrink-0 gap-2"><button onClick={()=>publishNow(item.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">Publish now</button><button onClick={()=>cancel(item.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700">Cancel</button></div>}</div></article>) : <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">No scheduled content yet.</div>}</div>
      </section>
    </div>
  </main></div>;
}
