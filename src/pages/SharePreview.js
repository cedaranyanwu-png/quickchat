import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import ShareMenu from '../components/ShareMenu';
import AdultContentGate from '../components/AdultContent';

export default function SharePreview({ kind = 'post' }) {
  const { postId, videoId } = useParams();
  const id = kind === 'video' ? videoId : postId;
  const [content, setContent] = useState(null);
  const [linkedVideo, setLinkedVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setContent(null);
    setLinkedVideo(null);
    const resource = kind === 'video' ? 'videos' : 'posts';
    apiRequest(`/share/${resource}/${encodeURIComponent(id)}`)
      .then(async (result) => {
        const item = kind === 'video' ? result.video : result.post;
        if (!item) throw new Error('This link could not be found.');
        if (item.isUnavailable) throw new Error('This post is unavailable.');
        if (active) setContent(item);
        if (kind === 'post' && item.videoId) {
          try {
            const videoResult = await apiRequest(`/share/videos/${encodeURIComponent(item.videoId)}`);
            if (active) setLinkedVideo(videoResult.video || null);
          } catch (_videoError) {
            // The public post can still be viewed if a linked video has been removed.
          }
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, kind]);

  const title = kind === 'video' ? content?.title : `Post by ${content?.name || 'QuickChat user'}`;
  const previewPath = `/share/${kind}/${id}`;
  const mediaDownloads = kind === 'video'
    ? (content?.videoUrl ? [{ url: content.videoUrl, type: 'video', label: 'Download video' }] : [])
    : [
      ...(content?.media || []).map((entry, index) => ({ url: entry.url, type: entry.type, label: `Download ${entry.type || 'media'} ${index + 1}` })),
      ...(linkedVideo?.videoUrl ? [{ url: linkedVideo.videoUrl, type: 'video', label: 'Download video' }] : []),
    ];

  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Link to="/login" className="flex items-center gap-2 text-slate-900 no-underline">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white"><i className="fa-solid fa-comment-dots" /></span>
          <span><strong className="block text-sm">QuickChat</strong><small className="block text-xs text-slate-500">A post worth sharing</small></span>
        </Link>
        <div className="flex gap-2">
          <Link to="/login" className="rounded-full px-3 py-2 text-xs font-bold text-slate-600 no-underline hover:bg-slate-100">Log in</Link>
          <Link to="/register" className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-blue-800">Join QuickChat</Link>
        </div>
      </header>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading shared {kind}…</div>}
      {!loading && error && <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><i className="fa-regular fa-circle-question text-3xl text-slate-300" /><h1 className="mt-3 text-lg font-extrabold text-slate-900">This {kind} is unavailable</h1><p className="mt-1 text-sm text-slate-500">{error}</p><Link to="/home" className="mt-4 inline-flex rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white no-underline">Explore QuickChat</Link></section>}

      {!loading && !error && kind === 'post' && content && <>
        <AdultContentGate isAdult={content.isAdult} className="space-y-3">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared post</p>
          <ShareMenu path={previewPath} title={title} text={content.text || 'See this post on QuickChat'} downloads={mediaDownloads} />
        </div>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <PostCard post={content} readOnly showShare={false} />
          {linkedVideo && <div className="border-t border-slate-100 p-4">
            <video controls playsInline preload="metadata" poster={linkedVideo.thumbnail || undefined} src={linkedVideo.videoUrl} className="max-h-[65vh] w-full rounded-xl bg-black" />
            <p className="mt-3 text-sm font-bold text-slate-900">{linkedVideo.title}</p>
          </div>}
          <div className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500">Sign in to like, reply, repost, and bookmark this post.</div>
        </section>
        </AdultContentGate>
      </>}

      {!loading && !error && kind === 'video' && content && <>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared video</p>
          <ShareMenu path={previewPath} title={title} text={content.description || content.title} downloads={mediaDownloads} downloadTextLabel="Download video details" />
        </div>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <video controls playsInline preload="metadata" poster={content.thumbnail || undefined} src={content.videoUrl} className="max-h-[70vh] w-full bg-black" />
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3"><Avatar name={content.creator} picture={content.picture} size={40} /><div><strong className="block text-sm text-slate-900">{content.creator}</strong><span className="text-xs text-slate-500">{content.handle} · {content.views} views</span></div></div>
            <h1 className="mt-4 text-xl font-extrabold text-slate-900">{content.title}</h1>
            {content.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content.description}</p>}
            <div className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-500">Join QuickChat to comment and follow the creator.</div>
          </div>
        </article>
      </>}
    </div>
  </main>;
}
