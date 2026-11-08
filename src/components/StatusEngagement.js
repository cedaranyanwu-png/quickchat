import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import Avatar from './Avatar';

export default function StatusEngagement({ status, isOwn, onStatusUpdate }) {
  const [liked, setLiked] = useState(Boolean(status.liked));
  const [likes, setLikes] = useState(Number(status.likes || 0));
  const [comments, setComments] = useState([]);
  const [viewers, setViewers] = useState([]);
  const [draft, setDraft] = useState('');
  const [panel, setPanel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLiked(Boolean(status.liked));
    setLikes(Number(status.likes || 0));
  }, [status.id, status.liked, status.likes]);

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiRequest('/statuses/' + status.id + '/likes', { method: liked ? 'DELETE' : 'POST' });
      setLiked(Boolean(result.liked));
      setLikes(Number(result.likes || 0));
      onStatusUpdate(status.id, { liked: Boolean(result.liked), likes: Number(result.likes || 0) });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openComments = async () => {
    setPanel('comments'); setError('');
    try { const result = await apiRequest('/statuses/' + status.id + '/comments'); setComments(result.comments || []); }
    catch (e) { setError(e.message); }
  };

  const openViewers = async () => {
    setPanel('viewers'); setError('');
    try { const result = await apiRequest('/statuses/' + status.id + '/viewers'); setViewers(result.viewers || []); }
    catch (e) { setError(e.message); }
  };

  const sendComment = async (event) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await apiRequest('/statuses/' + status.id + '/comments', { method: 'POST', body: { text: draft.trim() } });
      const result = await apiRequest('/statuses/' + status.id + '/comments');
      setComments(result.comments || []);
      onStatusUpdate(status.id, { comments: (Number(status.comments) || 0) + 1 });
      setDraft('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return <div className="relative z-30 flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950 px-4 py-3 text-white">
    <div className="flex items-center gap-4">
      <button type="button" disabled={busy} onClick={toggleLike} className="flex items-center gap-1.5 text-sm font-semibold" aria-label="Like status">
        <i className={(liked ? 'fa-solid text-pink-400' : 'fa-regular') + ' fa-heart'} /> {likes}
      </button>
      <button type="button" onClick={openComments} className="flex items-center gap-1.5 text-sm font-semibold">
        <i className="fa-regular fa-comment" /> {status.comments || 0}
      </button>
    </div>
    {isOwn && <button type="button" onClick={openViewers} className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">
      <i className="fa-solid fa-eye mr-1" /> {status.viewedCount || 0} viewers
    </button>}
    {panel && <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4" onClick={() => setPanel('')}>
      <section role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 sm:rounded-2xl">
        <header className="flex items-center justify-between border-b p-4"><strong>{panel === 'comments' ? 'Status comments' : 'Who viewed your status'}</strong><button type="button" onClick={() => setPanel('')} aria-label="Close">✕</button></header>
        {panel === 'comments' ? <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {comments.length ? comments.map((item) => <article key={item.id} className="flex gap-2"><Avatar name={item.fullname || item.username} picture={item.picture} size={34}/><div className="rounded-xl bg-slate-50 px-3 py-2"><strong className="text-xs">{item.fullname || item.username}</strong><p className="text-sm">{item.body}</p></div></article>) : <p className="py-8 text-center text-sm text-slate-400">No comments yet.</p>}
          </div>
          <form onSubmit={sendComment} className="flex gap-2 border-t p-3"><input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2 text-sm"/><button disabled={busy || !draft.trim()} className="rounded-full bg-blue-700 px-4 text-xs font-bold text-white">Send</button></form>
        </> : <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {viewers.length ? viewers.map((person) => <article key={person.id} className="flex items-center gap-3 px-2 py-2"><Avatar name={person.fullname || person.username} picture={person.picture} size={38}/><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.fullname || person.username}</strong><span className="text-xs text-slate-400">{person.username}</span></div><i title={person.liked ? 'Liked this status' : 'Viewed this status'} className={person.liked ? 'fa-solid fa-heart text-pink-500' : 'fa-regular fa-eye text-slate-400'}/></article>) : <p className="py-8 text-center text-sm text-slate-400">No viewers yet.</p>}
          <p className="px-2 pb-2 text-[11px] text-slate-400">Heart = liked · Eye = viewed without liking</p>
        </div>}
        {error && <p role="alert" className="px-4 pb-3 text-xs text-red-600">{error}</p>}
      </section>
    </div>}
  </div>;
}
