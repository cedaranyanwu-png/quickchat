import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';

const Metric = ({ label, value, icon }) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold">{label}</span><i className={\`fa-solid \${icon} text-blue-600\`} /></div><p className="mt-3 text-2xl font-black text-slate-950">{Number(value || 0).toLocaleString()}</p></div>;

const SPACE_TYPES = [
  { key: 'community', label: 'Community', icon: 'fa-users', hint: 'Build a space where members can discuss a shared interest.' },
  { key: 'page', label: 'Page', icon: 'fa-flag', hint: 'Create a public identity for a brand, project or creator initiative.' },
  { key: 'channel', label: 'Channel', icon: 'fa-tower-broadcast', hint: 'Create a publishing channel for updates and announcements.' },
];

const emptySpace = { name: '', category: '', description: '' };

export default function CreatorStudio() {
  const [data, setData] = useState(null);
  const [spaces, setSpaces] = useState({ communities: [], pages: [], channels: [] });
  const [activeType, setActiveType] = useState('community');
  const [form, setForm] = useState(emptySpace);
  const [activation, setActivation] = useState({ creatorName: '', niche: '', bio: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await apiRequest('/creator-studio/me');
    setData(result);
    if (result.creator) setActivation({ creatorName: result.creator.creator_name || '', niche: result.creator.niche || '', bio: result.creator.bio || '' });
    if (result.isCreator) {
      const entityData = await apiRequest('/creator-studio/entities');
      setSpaces({ communities: entityData.communities || [], pages: entityData.pages || [], channels: entityData.channels || [] });
    }
  }, []);

  useEffect(() => { load().catch((e) => setError(e.message || 'Could not load Creator Portal data.')); }, [load]);

  const activate = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const result = await apiRequest('/creator-studio/activate', { method: 'POST', body: activation });
      setNotice(result.message || 'Creator workspace activated.');
      await load();
    } catch (e) { setError(e.message || 'Could not save your creator profile.'); }
    finally { setSaving(false); }
  };

  const createSpace = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const result = await apiRequest('/creator-studio/entities/' + activeType, { method: 'POST', body: form });
      setSpaces((current) => ({ ...current, [activeType === 'community' ? 'communities' : activeType === 'page' ? 'pages' : 'channels']: [result.item, ...(current[activeType === 'community' ? 'communities' : activeType === 'page' ? 'pages' : 'channels'] || [])] }));
      setForm(emptySpace); setNotice(result.message || 'Creator space created.');
    } catch (e) { setError(e.message || 'Could not create this space.'); }
    finally { setSaving(false); }
  };

  const deleteSpace = async (type, item) => {
    if (!window.confirm(\`Delete "\${item.name}"? This cannot be undone.\`)) return;
    setError(''); setNotice('');
    try {
      await apiRequest(\`/creator-studio/entities/\${type}/\${item.id}\`, { method: 'DELETE' });
      const key = type === 'page' ? 'pages' : 'channels';
      setSpaces((current) => ({ ...current, [key]: current[key].filter((row) => row.id !== item.id) }));
      setNotice('Creator space deleted.');
    } catch (e) { setError(e.message || 'Could not delete this space.'); }
  };

  if (!data) return <div className="mx-auto max-w-6xl p-8 text-sm text-slate-500">Loading Creator workspace…</div>;

  if (!data.isCreator) return <div className="mx-auto max-w-6xl px-4 pb-20 pt-8">
    <section className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
      <form onSubmit={activate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-700">Creator Portal registration</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Create your creator workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Set up your creator identity here. Your details are saved to the Creator Portal database records and used to configure your workspace.</p>
        <div className="mt-6 space-y-4">
          <label className="block text-xs font-bold text-slate-700">Creator / brand name<input required maxLength="100" value={activation.creatorName} onChange={(e) => setActivation({ ...activation, creatorName: e.target.value })} placeholder="Your creator name" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <label className="block text-xs font-bold text-slate-700">Main content category<select required value={activation.niche} onChange={(e) => setActivation({ ...activation, niche: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal"><option value="">Choose your category</option>{['Technology','Education','Business','Entertainment','Music','Comedy','Gaming','Sports','Fashion','Lifestyle','News','Science','Design','Other'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="block text-xs font-bold text-slate-700">Creator description<textarea rows="4" maxLength="500" value={activation.bio} onChange={(e) => setActivation({ ...activation, bio: e.target.value })} placeholder="Tell your audience what you create…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
        </div>
        <button disabled={saving} className="mt-5 w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving workspace…' : 'Create Creator Workspace'}</button>
      </form>
      <aside className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-300">Your own workspace</p>
        <h2 className="mt-3 text-2xl font-black">Create more than posts.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">After setup, manage your publishing calendar, communities, creator pages and channels from this portal.</p>
        <div className="mt-6 space-y-4">{SPACE_TYPES.map((item) => <div key={item.key} className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-blue-300"><i className={\`fa-solid \${item.icon}\`}/></span><div><p className="text-sm font-bold">{item.label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.hint}</p></div></div>)}</div>
      </aside>
    </section>
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  </div>;

  const activeSpace = SPACE_TYPES.find((item) => item.key === activeType);
  const listKey = activeType === 'community' ? 'communities' : activeType === 'page' ? 'pages' : 'channels';
  const activeItems = spaces[listKey] || [];

  return <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:pb-10">
    <header className="mb-6 overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-300">Independent creator workspace</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Creator Studio</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Manage your creator identity, publishing, communities, pages and channels from this portal.</p></div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold">Workspace active</span></div>
      <div className="mt-6 flex flex-wrap gap-2"><Link to="/creator/content-library" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white no-underline hover:bg-blue-500"><i className="fa-solid fa-calendar-plus mr-2"/>Content Library</Link><a href="#creator-spaces" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white no-underline hover:bg-white/10">Manage spaces</a></div>
    </header>
    {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Followers" value={data.metrics?.followers} icon="fa-users"/>
      <Metric label="Published posts" value={data.metrics?.posts} icon="fa-file-lines"/>
      <Metric label="Invited signups" value={data.metrics?.trackedSignups} icon="fa-user-plus"/>
      <Metric label="Qualified referrals" value={data.metrics?.qualifiedReferrals} icon="fa-check-circle"/>
    </section>
    <section id="creator-spaces" className="mt-6 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Creator management</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">Create a space</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">{SPACE_TYPES.map((item) => <button key={item.key} type="button" onClick={() => { setActiveType(item.key); setForm(emptySpace); }} className={\`rounded-xl border p-3 text-center text-xs font-bold \${activeType === item.key ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}\`}><i className={\`fa-solid \${item.icon} mb-2 block text-base\`}/>{item.label}</button>)}</div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{activeSpace.hint}</p>
        <form onSubmit={createSpace} className="mt-4 space-y-3">
          <label className="block text-xs font-bold text-slate-700">{activeSpace.label} name<input required minLength="2" maxLength="120" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={\`Enter \${activeSpace.label.toLowerCase()} name\`} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <label className="block text-xs font-bold text-slate-700">Category<input maxLength="80" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Technology, Education, Music" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <label className="block text-xs font-bold text-slate-700">Description<textarea rows="4" maxLength="1500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this space about?" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <button disabled={saving} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : \`Create \${activeSpace.label}\`}</button>
        </form>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Your workspace records</p><h2 className="mt-1 text-lg font-black text-slate-950">Your {activeSpace.label.toLowerCase()}s</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{activeItems.length} total</span></div>
        <div className="mt-4 space-y-3">{activeItems.length ? activeItems.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-extrabold text-slate-900">{item.name}</h3><p className="mt-1 text-[11px] text-slate-500">/{item.slug}{item.category ? \` · \${item.category}\` : ''}</p><p className="mt-2 text-xs leading-5 text-slate-600">{item.description || 'No description added.'}</p></div>{activeType !== 'community' && <button type="button" onClick={() => deleteSpace(activeType, item)} className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700">Delete</button>}</div></article>) : <div className="rounded-xl bg-slate-50 p-8 text-center"><i className={\`fa-solid \${activeSpace.icon} text-2xl text-slate-300\`}/><p className="mt-3 text-sm font-bold text-slate-700">No {activeSpace.label.toLowerCase()}s yet</p><p className="mt-1 text-xs text-slate-500">Create your first one using the form.</p></div>}</div>
      </div>
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-950">Creator profile</h2><p className="mt-1 text-xs text-slate-500">{data.creator?.creator_name || data.profile?.fullName} · {data.creator?.niche || 'Creator'}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Saved to Creator Portal</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{data.creator?.bio || 'Add a short description to your creator profile.'}</p></section>
  </div>;
}
