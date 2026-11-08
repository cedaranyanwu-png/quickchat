import React, { useEffect, useState } from 'react';
import { adminRequest } from '../../api';

const fmt = (v) => v ? new Date(v).toLocaleString() : '—';

export default function ModerationPanel({ can }) {
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async (nextPage = page) => {
    setError('');
    try {
      const data = await adminRequest(`/admin/moderation/posts?page=${nextPage}&limit=20&search=${encodeURIComponent(search)}`);
      setPosts(data.posts || []);
      setPagination(data.pagination || null);
      setPage(nextPage);
    } catch (e) { setError(e.message || 'Unable to load moderation queue.'); }
  };

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const removePost = async () => {
    if (!selected || !reason.trim()) return setError('Enter the moderation reason.');
    if (!window.confirm('Remove this post from QuickChat? This action deletes the post record.')) return;
    setBusy(selected.id); setError('');
    try {
      await adminRequest(`/admin/moderation/posts/${selected.id}`, { method: 'DELETE', body: { reason: reason.trim() } });
      setNotice('Post removed and moderation action recorded.');
      setSelected(null); setReason('');
      await load(page);
    } catch (e) { setError(e.message || 'Post removal failed.'); }
    finally { setBusy(null); }
  };

  return <section>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-black text-slate-900">Post moderation</h2><p className="mt-1 text-sm text-slate-500">Review published posts and remove content that violates QuickChat policies or terms.</p></div>
      <div className="flex gap-2 w-full sm:w-auto"><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} placeholder="Search post or username" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 sm:w-64" /><button onClick={() => load(1)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Search</button></div>
    </div>
    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
    {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</div>}
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Post</th><th className="px-4 py-4">Author</th><th className="px-4 py-4">Engagement</th><th className="px-4 py-4">Visibility</th><th className="px-4 py-4">Created</th><th className="px-4 py-4 text-right">Action</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{posts.map(post => <tr key={post.id} className="hover:bg-slate-50/60">
        <td className="max-w-[360px] px-5 py-4"><p className="line-clamp-2 font-semibold text-slate-800">{post.body || '[Media post]'}</p><p className="mt-1 text-[10px] text-slate-400">#{post.id} · {post.kind || 'text'}</p></td>
        <td className="px-4 py-4"><p className="font-bold text-slate-800">{post.fullname || post.username}</p><p className="text-[11px] text-slate-500">{post.username}</p></td>
        <td className="px-4 py-4 text-[11px] font-semibold text-slate-500">{post.likes || 0} likes · {post.comments || 0} comments · {post.reposts || 0} reposts</td>
        <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold capitalize text-slate-600">{post.visibility || 'public'}</span></td>
        <td className="px-4 py-4 text-[11px] text-slate-500">{fmt(post.created_at)}</td>
        <td className="px-4 py-4 text-right"><button onClick={() => { setSelected(post); setReason(''); }} className="grid ml-auto h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-700" title="Post actions"><i className="fa-solid fa-ellipsis" /></button></td>
      </tr>)}</tbody></table></div>
      {!posts.length && <p className="p-10 text-center text-sm text-slate-400">No posts found.</p>}
      {pagination && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} posts</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => load(page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button><button disabled={page >= pagination.pages} onClick={() => load(page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button></div></div>}
    </div>
    {selected && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}>
      <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-700">Post actions</p><h3 className="mt-1 font-black text-slate-900">Post #{selected.id}</h3><p className="text-xs text-slate-500">{selected.username} · {fmt(selected.created_at)}</p></div><button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100"><i className="fa-solid fa-xmark" /></button></div>
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-wrap">{selected.body || '[Media post]'}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-500"><div className="rounded-lg bg-slate-50 p-2">{selected.likes || 0}<br/>Likes</div><div className="rounded-lg bg-slate-50 p-2">{selected.comments || 0}<br/>Comments</div><div className="rounded-lg bg-slate-50 p-2">{selected.reposts || 0}<br/>Reposts</div></div>
        {can('posts.remove') && <label className="mt-4 block text-xs font-bold text-slate-700">Removal reason<textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="Which policy or term does this violate?" /></label>}
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Close</button>{can('posts.remove') && <button disabled={busy === selected.id || !reason.trim()} onClick={removePost} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === selected.id ? 'Removing…' : 'Remove post'}</button>}</div>
      </section>
    </div>}
  </section>;
}
