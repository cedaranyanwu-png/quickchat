import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

const EMPTY = { id: '', type: 'native', title: '', description: '', imageUrl: '', destinationUrl: '', scriptCode: '', placement: 'both', active: true };

function validWebUrl(value, required = false) {
  if (!value && !required) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export default function AdminAdsPanel() {
  const [ads, setAds] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminRequest('/admin/ads');
      setAds(result.ads || []);
    } catch (err) { setError(err.message || 'Unable to load managed advertisements.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm(EMPTY); setEditingId(null); };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!form.title.trim()) return setError('Enter an ad title.');
    if (form.type === 'script' && !form.scriptCode.trim()) return setError('Paste the advertising network JavaScript snippet.');
    if (form.type !== 'script' && !validWebUrl(form.destinationUrl, true)) return setError('Destination must be a valid http:// or https:// URL.');
    if (form.type !== 'script' && !validWebUrl(form.imageUrl)) return setError('Image URL must be a valid http:// or https:// URL.');
    if (form.type === 'native' && !form.description.trim()) return setError('Native ads need a description.');
    const entry = {
      ...form,
      id: editingId || (`ad-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
      title: form.title.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl.trim(),
      destinationUrl: form.destinationUrl.trim(),
      scriptCode: form.type === 'script' ? form.scriptCode : '',
    };
    setSaving(true);
    try {
      const next = editingId
        ? ads.map((item) => item.id === editingId ? entry : item)
        : [entry, ...ads];
      const result = await adminRequest('/admin/ads', { method: 'PUT', body: { ads: next } });
      setAds(result.ads || next);
      reset();
      setNotice(editingId ? 'Advertisement updated.' : 'Advertisement added to QuickChat.');
    } catch (err) { setError(err.message || 'Unable to save this advertisement.'); }
    finally { setSaving(false); }
  };

  const edit = (ad) => {
    setEditingId(ad.id);
    setForm({ ...EMPTY, ...ad });
    setNotice(''); setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this advertisement from all QuickChat feed placements?')) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/ads', { method: 'PUT', body: { ads: ads.filter((item) => item.id !== id) } });
      setAds(result.ads || []);
      if (editingId === id) reset();
      setNotice('Advertisement removed.');
    } catch (err) { setError(err.message || 'Unable to remove this advertisement.'); }
    finally { setSaving(false); }
  };

  const toggle = async (ad) => {
    const next = ads.map((item) => item.id === ad.id ? { ...item, active: !item.active } : item);
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/ads', { method: 'PUT', body: { ads: next } });
      setAds(result.ads || next);
      setNotice(ad.active ? 'Advertisement paused.' : 'Advertisement activated.');
    } catch (err) { setError(err.message || 'Unable to update advertisement status.'); }
    finally { setSaving(false); }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-black text-slate-900">Ad placements</h2>
        <p className="mt-1 text-sm text-slate-500">Manage external ad destinations and native feed-card advertisements. Changes appear in Home and Explore without editing the app code.</p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-extrabold text-slate-900">{editingId ? 'Edit advertisement' : 'Add advertisement'}</h3><p className="mt-1 text-xs text-slate-500">Use a normal destination URL, a styled native feed ad, or paste a third-party Native Banner snippet.</p></div>
            {editingId && <button type="button" onClick={reset} className="text-xs font-bold text-slate-500 hover:text-slate-900">Cancel edit</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Ad format
              <select value={form.type} onChange={(e) => update('type', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                <option value="link">External ad link</option><option value="native">Native feed ad</option><option value="script">Native Banner / JavaScript</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">Feed placement
              <select value={form.placement} onChange={(e) => update('placement', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                <option value="both">Home and Explore</option><option value="home">Home only</option><option value="explore">Explore only</option>
              </select>
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold text-slate-700">Ad title
            <input value={form.title} onChange={(e) => update('title', e.target.value)} maxLength={120} required placeholder="e.g. Discover our new service" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" />
          </label>
          {form.type !== 'script' && <>
          <label className="mt-3 block text-xs font-bold text-slate-700">Description {form.type === 'native' ? '(required)' : '(optional)'}
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} maxLength={500} rows={3} placeholder="Short copy shown inside the feed card" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-700">Destination URL
            <input type="url" value={form.destinationUrl} onChange={(e) => update('destinationUrl', e.target.value)} required placeholder="https://advertiser.example/offer" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-700">Creative image URL (optional)
            <input type="url" value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder="https://cdn.example.com/ad-image.jpg" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" />
          </label>
          </>}
          {form.type === 'script' && <label className="mt-3 block text-xs font-bold text-slate-700">Native Banner / Advertising JavaScript snippet
            <textarea value={form.scriptCode} onChange={(e) => update('scriptCode', e.target.value)} maxLength={50000} rows={10} spellCheck={false} autoComplete="off" placeholder={'Paste the complete Native Banner snippet, including its &lt;script&gt; and container &lt;div&gt;...'} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-xs leading-5 text-emerald-300 outline-none focus:border-blue-500" />
            <span className="mt-1 block text-[11px] font-normal leading-5 text-slate-500">Up to 50,000 characters. The snippet runs inside an isolated responsive ad frame and keeps its original script/container pairing.</span>
          </label>
          <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={Boolean(form.active)} onChange={(e) => update('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-700" /> Publish this advertisement</label>
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={saving} className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to app'}</button>
            <button type="button" onClick={reset} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-600">Clear form</button>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">Native Banner snippets run inside an isolated responsive iframe so the third-party script can initialize while remaining separated from the main QuickChat page. Link and native ads continue to accept HTTP(S) destinations.</p>
        </form>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-extrabold text-slate-900">Native feed preview</h3>
            <p className="mt-1 text-xs text-slate-500">This is the card style users see between regular posts.</p>
            <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-blue-700"><i className="fa-solid fa-bullhorn" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-900">QuickChat Ads</p><p className="text-[10px] text-slate-400">Sponsored</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-700">Ad</span></div>
              <h4 className="mt-3 text-sm font-extrabold text-slate-900">{form.title || 'Your ad headline appears here'}</h4>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{form.description || 'Your short advertising message will appear here, inside a familiar QuickChat feed card.'}</p>
              {form.imageUrl && <img src={form.imageUrl} alt="Ad preview" className="mt-3 max-h-52 w-full rounded-xl border border-slate-100 object-cover" />}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[10px] font-semibold text-slate-400">Sponsored content</span><span className="rounded-full bg-blue-700 px-3 py-2 text-[10px] font-bold text-white">Learn more <i className="fa-solid fa-arrow-up-right-from-square ml-1" /></span></div>
            </article>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><strong>Feed layout protection:</strong> third-party snippets execute inside a sandboxed iframe without access to the main QuickChat DOM. Ad scripts may still open advertiser links in a new tab.</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-extrabold text-slate-900">Saved advertisements</h3><p className="mt-1 text-xs text-slate-500">{ads.length} configured placement{ads.length === 1 ? '' : 's'}</p></div><button onClick={load} disabled={loading || saving} className="text-xs font-bold text-blue-700">Refresh</button></div>
        {loading ? <p className="p-8 text-center text-sm text-slate-400">Loading ads…</p> : ads.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">No ads configured yet.</p> : <div className="divide-y divide-slate-100">{ads.map((ad) => <div key={ad.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">{ad.imageUrl ? <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" /> : <i className="fa-solid fa-bullhorn" />}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-900">{ad.title}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-600">{ad.type}</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${ad.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{ad.active ? 'Active' : 'Paused'}</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{ad.destinationUrl}</p><p className="mt-1 text-[10px] text-slate-400">Placement: {ad.placement}</p></div>
          <div className="flex gap-2"><button disabled={saving} onClick={() => toggle(ad)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">{ad.active ? 'Pause' : 'Activate'}</button><button disabled={saving} onClick={() => edit(ad)} className="rounded-lg border border-blue-100 px-3 py-2 text-[10px] font-bold text-blue-700">Edit</button><button disabled={saving} onClick={() => remove(ad.id)} className="rounded-lg border border-rose-100 px-3 py-2 text-[10px] font-bold text-rose-700">Remove</button></div>
        </div>)}</div>}
      </div>
    </section>
  );
}
