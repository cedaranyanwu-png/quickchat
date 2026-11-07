import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest, resolveMediaUrl } from '../api';

const dateLabel = (value) => value ? new Date(value).toLocaleString() : '—';

export default function AdminModeration() {
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [policyKey, setPolicyKey] = useState('terms_violation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (nextPage = page, query = search, filter = status) => {
    setBusy(true); setError('');
    try {
      const data = await adminRequest(`/admin/moderation/posts?page=${nextPage}&limit=20&status=${filter}&search=${encodeURIComponent(query)}`);
      setPosts(data.posts || []); setPagination(data.pagination || { page: nextPage, pages: 1, total: 0, limit: 20 });
    } catch (err) { setError(err.message || 'Unable to load posts.'); }
    finally { setBusy(false); }
  }, [page, search, status]);

  useEffect(() => { load(page, search, status); }, [load, page, search, status]);

  const submitAction = async (event) => {
    event.preventDefault();
    if (!selected || !reason.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const endpoint = action === 'restore' ? 'restore' : 'remove';
      await adminRequest(`/admin/moderation/posts/${selected.id}/${endpoint}`, {
        method: 'POST', body: { reason, policyKey },
      });
      setNotice(action === 'restore' ? 'Post restored.' : 'Post removed from feeds.');
      setSelected(null); setAction(''); setReason('');
      await load(page, search, status);
    } catch (err) { setError(err.message || 'Moderation action failed.'); }
    finally { setBusy(false); }
  };

  const mediaItems = (post) => (post.media || []).map((item) => typeof item === 'string' ? { url: item, type: 'image' } : item).filter((item) => item?.url);

  return <section className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Trust & safety</p><h1 className="mt-1 text-2xl font-black text-slate-950">Post moderation</h1><p className="mt-1 text-sm text-slate-500">Review public content, inspect media and enforce platform policy.</p></div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{pagination.total.toLocaleString()} posts</div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} onKeyDown={(e) => e.key === 'Enter' && load(1, search, status)} placeholder="Search post, author or ID" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
      <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="active">Active posts</option><option value="removed">Removed posts</option><option value="all">All posts</option></select>
      <button onClick={() => load(1, search, status)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Search</button>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Post</th><th className="px-4 py-4">Author</th><th className="px-4 py-4">Published</th><th className="px-4 py-4">Status</th><th className="px-4 py-4 text-right">Review</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{posts.map((post) => <tr key={post.id} className="hover:bg-slate-50/70">
          <td className="max-w-[420px] px-5 py-4"><p className="line-clamp-2 text-sm text-slate-800">{post.body || 'Media post'}</p><p className="mt-1 text-[10px] text-slate-400">Post #{post.id} · {post.kind || 'text'}</p></td>
          <td className="px-4 py-4"><p className="font-bold text-slate-800">{post.fullname || post.username}</p><p className="text-xs text-slate-500">@{String(post.username || '').replace(/^@/, '')}</p></td>
          <td className="px-4 py-4 text-xs text-slate-500">{dateLabel(post.created_at)}</td>
          <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${post.moderation_status === 'removed' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{post.moderation_status === 'removed' ? 'Removed' : 'Active'}</span></td>
          <td className="px-4 py-4 text-right"><button onClick={() => { setSelected(post); setAction('view'); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">View post</button></td>
        </tr>)}</tbody>
      </table></div>
      {!posts.length && !busy && <p className="p-10 text-center text-sm text-slate-500">No posts match this filter.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><span>Page {pagination.page} of {pagination.pages} · {pagination.total.toLocaleString()} records</span><div className="flex gap-2"><button disabled={page <= 1 || busy} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button><button disabled={page >= pagination.pages || busy} onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button></div></div>
    </div>
    {selected && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setAction(''); } }}>
      <section role="dialog" aria-modal="true" aria-labelledby="moderation-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><div><h2 id="moderation-title" className="font-black text-slate-900">Post #{selected.id}</h2><p className="text-xs text-slate-500">{selected.fullname || selected.username} · {dateLabel(selected.created_at)}</p></div><button onClick={() => { setSelected(null); setAction(''); }} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><i className="fa-solid fa-xmark" /></button></header>
        <div className="space-y-4 p-5"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{selected.body || 'No text content.'}</p>
          {mediaItems(selected).map((media, i) => <div key={i} className="overflow-hidden rounded-xl bg-slate-100">{String(media.type || '').includes('video') ? <video src={resolveMediaUrl(media.url)} controls className="max-h-[420px] w-full" /> : <img src={resolveMediaUrl(media.url)} alt="Post attachment" className="max-h-[420px] w-full object-contain" />}</div>)}
          {selected.moderation_status === 'removed' && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800"><strong>Removal reason:</strong> {selected.moderation_reason || '—'} <span className="block mt-1">Policy: {selected.policy_key || '—'}</span></div>}
          {action === 'view' && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {selected.moderation_status !== 'removed' && <button onClick={() => { setAction('remove'); setReason(''); }} className="rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-bold text-white">Remove post</button>}
            {selected.moderation_status === 'removed' && <button onClick={() => { setAction('restore'); setReason(''); }} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">Restore post</button>}
          </div>}
          {(action === 'remove' || action === 'restore') && <form onSubmit={submitAction} className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="font-extrabold text-slate-900">{action === 'remove' ? 'Remove this post' : 'Restore this post'}</h3>
            {action === 'remove' && <label className="block text-xs font-bold text-slate-700">Policy category<select value={policyKey} onChange={(e) => setPolicyKey(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3"><option value="terms_violation">Terms of Service violation</option><option value="harassment">Harassment or bullying</option><option value="hate_speech">Hate speech</option><option value="spam">Spam or misleading content</option><option value="nudity">Sexual or explicit content</option><option value="violence">Violence or threats</option><option value="copyright">Copyright infringement</option><option value="scam">Fraud or scam</option><option value="other">Other policy violation</option></select></label>}
            <label className="block text-xs font-bold text-slate-700">{action === 'remove' ? 'Reason for removal' : 'Reason for restoration'}<textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} maxLength={2000} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="Document the policy decision..." /></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setAction('view')} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Cancel</button><button disabled={busy || !reason.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm action'}</button></div>
          </form>}
        </div>
      </section>
    </div>}
  </section>;
}
