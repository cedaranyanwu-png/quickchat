import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';

export default function PostDetailModal({ post, src, type = 'image', onClose }) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!post?.id) { setLoading(false); return undefined; }
    apiRequest(`/posts/${post.id}/replies`)
      .then((result) => { if (active) setComments(result.replies || []); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [post?.id]);

  const sendComment = async (event) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || !post?.id || sending) return;
    setSending(true);
    setError('');
    try {
      await apiRequest(`/posts/${post.id}/replies`, { method: 'POST', body: { text } });
      const refreshed = await apiRequest(`/posts/${post.id}/replies`);
      setComments(refreshed.replies || []);
      setCommentText('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  };

  if (!post) return null;
  const isVideo = type === 'video';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Post details">
      <div className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(88vh,860px)] sm:flex-row sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close post" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
          <i className="fa-solid fa-xmark" />
        </button>
        <section className="flex min-h-0 flex-1 items-center justify-center bg-black sm:w-[58%] sm:flex-none">
          {isVideo
            ? <video src={src} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
            : <img src={src} alt="Post media" className="max-h-full max-w-full object-contain" />}
        </section>
        <aside className="flex min-h-0 flex-1 flex-col sm:w-[42%]">
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 pr-14">
            <Avatar name={post.name || post.fullName || post.username} picture={post.picture || post.avatar} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">{post.name || post.fullName || post.username || 'QuickChat user'} <VerifiedBadge verified={post.verified} /></div>
              <div className="truncate text-xs text-slate-500">{post.handle ? `@${String(post.handle).replace(/^@/, '')}` : post.username ? `@${String(post.username).replace(/^@/, '')}` : 'QuickChat'}</div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {post.text && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{post.text}</p>}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">Comments <span className="font-medium text-slate-400">({comments.length})</span></h3>
              {loading && <p className="py-5 text-center text-xs text-slate-400">Loading comments…</p>}
              {!loading && comments.length === 0 && <p className="py-5 text-center text-xs text-slate-400">No comments yet. Start the conversation.</p>}
              <div className="mt-3 space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-2.5">
                    <Avatar name={comment.fullname || comment.username || 'User'} picture={comment.picture || comment.avatar} size={30} />
                    <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-xs font-bold text-slate-900">{comment.fullname || comment.username || 'User'} <VerifiedBadge verified={comment.verified} /></div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{comment.body || comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
            </div>
          </div>
          <form onSubmit={sendComment} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add a comment…" aria-label="Write a comment" className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-600 focus:bg-white" />
            <button type="submit" disabled={!commentText.trim() || sending} className="rounded-full bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Sending…' : 'Post'}</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
