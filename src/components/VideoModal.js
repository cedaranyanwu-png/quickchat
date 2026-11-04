import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api';
import Avatar from './Avatar';

export default function VideoModal({ videoId, onClose }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(videoId);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [showMobileComments, setShowMobileComments] = useState(false);
  const reelFeedRef = useRef(null);
  const desktopVideoRef = useRef(null);
  const viewedIdsRef = useRef(new Set());
  const initialScrollRef = useRef(null);

  const activeVideo = videos.find((video) => String(video.id) === String(selectedId));
  const activeVideoId = activeVideo?.id;

  useEffect(() => {
    if (!videoId) return undefined;
    let active = true;
    setLoading(true);
    setVideos([]);
    setSelectedId(videoId);
    setComments([]);
    setComment('');
    setError('');
    setAutoplayBlocked(false);
    setShowMobileComments(false);
    initialScrollRef.current = null;
    viewedIdsRef.current.clear();

    // Load the database feed around the selected card so mobile can continue as a reel feed.
    const loadVideos = async () => {
      try {
        const result = await apiRequest('/videos');
        let rows = result.videos || [];
        if (!rows.some((video) => String(video.id) === String(videoId))) {
          const selected = await apiRequest(`/videos/${videoId}`);
          rows = [selected.video, ...rows];
        }
        if (active) { setVideos(rows); setLoading(false); }
      } catch (requestError) {
        if (active) { setError(requestError.message); setLoading(false); }
      }
    };
    loadVideos();
    return () => { active = false; };
  }, [videoId]);

  const recordView = useCallback((id) => {
    if (viewedIdsRef.current.has(String(id))) return;
    viewedIdsRef.current.add(String(id));
    apiRequest(`/videos/${id}/views`, { method: 'POST' })
      .then((result) => setVideos((current) => current.map((video) => String(video.id) === String(id) ? { ...video, views: result.views } : video)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!videoId || videos.length === 0 || initialScrollRef.current === String(videoId)) return;
    initialScrollRef.current = String(videoId);
    // Start at the video the user clicked; subsequent swipes stay in the same feed.
    requestAnimationFrame(() => {
      const target = Array.from(reelFeedRef.current?.children || []).find((element) => element.dataset.reelId === String(videoId));
      target?.scrollIntoView({ block: 'start' });
    });
  }, [videoId, videos]);

  useEffect(() => {
    if (!videoId || videos.length === 0 || !reelFeedRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const feed = reelFeedRef.current;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const element = entry.target;
        const id = element.dataset.reelId;
        const player = element.querySelector('video');
        if (!player || !id) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          setSelectedId(id);
          recordView(id);
          player.muted = true;
          const playAttempt = player.play();
          if (playAttempt?.then) {
            playAttempt.then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
          }
        } else {
          player.pause();
        }
      });
    }, { root: feed, threshold: [0.2, 0.65, 0.9] });

    feed.querySelectorAll('[data-reel-id]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [videoId, videos.length, recordView]);

  useEffect(() => {
    if (!activeVideoId) return undefined;
    let active = true;
    // Comments switch with the currently visible reel and are fetched from the API.
    apiRequest(`/videos/${activeVideoId}/comments`)
      .then((result) => { if (active) setComments(result.comments || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [activeVideoId]);

  useEffect(() => {
    if (!activeVideoId || !desktopVideoRef.current) return;
    const player = desktopVideoRef.current;
    player.muted = true;
    recordView(activeVideoId);
    player.play().catch(() => setAutoplayBlocked(true));
  }, [activeVideoId, recordView]);

  const addComment = async (event) => {
    event.preventDefault();
    if (!activeVideoId || !comment.trim()) return;
    try {
      await apiRequest(`/videos/${activeVideoId}/comments`, { method: 'POST', body: { text: comment } });
      const result = await apiRequest(`/videos/${activeVideoId}/comments`);
      setComments(result.comments || []);
      setComment('');
    } catch (requestError) { setError(requestError.message); }
  };

  const toggleReelPlayback = (event) => {
    const player = event.currentTarget.querySelector('video');
    if (!player) return;
    player.muted = true;
    if (player.paused) player.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    else player.pause();
  };

  if (!videoId) return null;
  const commentsPanel = <div className="border-t border-slate-200 pt-4"><h3 className="font-bold text-sm mb-3">Comments ({comments.length})</h3><div className="space-y-2 max-h-64 overflow-y-auto">{comments.map((item) => <div key={item.id} className="text-xs py-2 border-b border-slate-100"><strong>{item.fullname || item.username || 'User'}</strong><p className="text-slate-600 mt-1">{item.body}</p></div>)}</div>{comments.length === 0 && <p className="text-xs text-slate-500">No comments yet.</p>}<form onSubmit={addComment} className="flex gap-2 mt-3"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" className="flex-1 border rounded-full px-3 py-2 text-xs outline-none"/><button className="text-blue-700 text-xs font-bold">Send</button></form>{error && <p className="text-xs text-red-600 mt-2">{error}</p>}</div>;

  return <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true" aria-label="Video player">
    <button onClick={onClose} className="absolute top-3 right-3 z-[70] rounded-full bg-black/60 text-white w-10 h-10" aria-label="Close video"><i className="fa-solid fa-xmark"/></button>

    {/* Mobile uses a native full-height snap scroller; only the visible reel plays. */}
    <div ref={reelFeedRef} className="lg:hidden absolute inset-0 h-[100dvh] overflow-y-auto snap-y snap-mandatory overscroll-y-contain bg-black" style={{ scrollbarWidth: 'none' }}>
      {videos.map((video) => <section key={video.id} data-reel-id={video.id} className="relative h-[100dvh] min-h-[100svh] w-full snap-start snap-always overflow-hidden bg-black" onClick={toggleReelPlayback}>
        <video src={video.videoUrl} poster={video.thumbnail || undefined} muted playsInline loop preload="metadata" className="absolute inset-0 w-full h-full object-cover" aria-label={video.title}/>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/90 via-black/35 to-transparent"/>
        <div className="absolute left-4 right-16 bottom-8 text-white pointer-events-none">
          <div className="flex items-center gap-2 mb-3"><Avatar name={video.creator} picture={video.picture} size={38}/><span className="font-bold text-sm">{video.creator}</span><span className="text-xs text-white/75">{video.handle}</span></div>
          <h2 className="font-bold text-base">{video.title}</h2>
          {video.description && <p className="mt-1 text-sm text-white/90 line-clamp-3">{video.description}</p>}
          <p className="mt-2 text-xs text-white/75">{video.views} views</p>
        </div>
        <div className="absolute right-3 bottom-10 flex flex-col gap-5 items-center text-white">
          <button onClick={(event) => { event.stopPropagation(); setSelectedId(video.id); setShowMobileComments(true); }} className="flex flex-col items-center gap-1"><i className="fa-regular fa-comment text-2xl"/><span className="text-[10px]">{String(selectedId) === String(video.id) ? comments.length : ''}</span></button>
          <span className="flex flex-col items-center gap-1 text-xs"><i className="fa-solid fa-eye text-xl"/>{video.views}</span>
        </div>
        {autoplayBlocked && String(selectedId) === String(video.id) && <button onClick={(event) => { event.stopPropagation(); const player = event.currentTarget.parentElement.querySelector('video'); player.muted = true; player.play().then(() => setAutoplayBlocked(false)).catch(() => {}); }} className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 text-white"><i className="fa-solid fa-play text-xl"/></button>}
      </section>)}
      {videos.length === 0 && <div className="h-full grid place-items-center text-white p-6 text-center">{error || (loading ? 'Loading videos…' : 'No videos are available yet.')}</div>}
    </div>

    {/* Desktop keeps the focused player and its details beside it. */}
    <div className="hidden lg:flex absolute inset-0 p-6 items-stretch justify-center">
      {activeVideo ? <div className="w-full max-w-6xl bg-white rounded-2xl overflow-hidden flex"><div className="flex-1 bg-black flex items-center justify-center"><video ref={desktopVideoRef} key={activeVideo.id} src={activeVideo.videoUrl} poster={activeVideo.thumbnail || undefined} controls autoPlay muted playsInline loop className="max-h-full max-w-full"/></div><aside className="w-[360px] overflow-y-auto p-5"><div className="flex items-center gap-3"><Avatar name={activeVideo.creator} picture={activeVideo.picture} size={40}/><div><strong className="block text-sm">{activeVideo.creator}</strong><span className="text-xs text-slate-500">{activeVideo.handle}</span></div></div><h2 className="font-extrabold text-lg mt-4">{activeVideo.title}</h2><p className="text-xs text-slate-500 mt-1">{activeVideo.views} views</p><p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{activeVideo.description}</p>{commentsPanel}</aside></div> : <p className="text-white self-center">{error || (loading ? 'Loading video…' : 'No videos are available yet.')}</p>}
    </div>

    {showMobileComments && <div className="lg:hidden absolute inset-x-0 bottom-0 z-[65] max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}><div className="flex justify-between items-center mb-3"><strong>Comments</strong><button onClick={() => setShowMobileComments(false)} aria-label="Close comments"><i className="fa-solid fa-xmark"/></button></div>{commentsPanel}</div>}
  </div>;
}
