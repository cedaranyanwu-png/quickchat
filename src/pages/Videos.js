import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, uploadMedia } from '../api';
import Avatar from '../components/Avatar';
import ShareMenu from '../components/ShareMenu';
import './Videos.css';

export default function Videos({ openVideo }) {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [autoplayBlockedId, setAutoplayBlockedId] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [commentsVideoId, setCommentsVideoId] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const feedRef = useRef(null);
  const viewedIdsRef = useRef(new Set());

  // Prefer the dedicated video library, but also read public feed attachments.
  // This keeps a post video visible even if an older/migrated row is missing in videos.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [libraryResult, feedResult] = await Promise.allSettled([
        apiRequest('/videos?limit=100'),
        apiRequest('/explore?limit=100'),
      ]);

      const libraryVideos = libraryResult.status === 'fulfilled'
        ? (libraryResult.value.videos || [])
        : [];
      const feedPosts = feedResult.status === 'fulfilled'
        ? (feedResult.value.posts || [])
        : [];

      const knownUrls = new Set(libraryVideos.map((video) => String(video.videoUrl || '').trim()).filter(Boolean));
      const feedVideos = [];
      feedPosts.forEach((post) => {
        if (post.visibility !== 'public' || post.communityId) return;
        const attachments = Array.isArray(post.media) ? post.media : [];
        attachments.forEach((attachment, index) => {
          const url = String(attachment?.url || '').trim();
          const mediaType = String(attachment?.type || '').toLowerCase();
          const isVideo = mediaType.startsWith('video') || /\\.(mp4|webm|mov)(?:[?#]|$)/i.test(url);
          if (!isVideo || !url || knownUrls.has(url)) return;
          knownUrls.add(url);
          feedVideos.push({
            id: `feed-${post.id}-${index}`,
            postId: post.id,
            isFeedFallback: true,
            title: String(post.text || 'Video').slice(0, 180),
            description: post.text || '',
            videoUrl: url,
            thumbnail: attachment.thumbnailUrl || null,
            duration: '',
            views: 0,
            likes: 0,
            liked: false,
            creatorId: post.authorId,
            creator: post.name || 'QuickChat user',
            username: post.username || '',
            handle: post.handle || '',
            picture: post.picture || null,
            createdAt: post.createdAt,
          });
        });
      });

      if (libraryResult.status === 'rejected' && feedResult.status === 'rejected') {
        throw libraryResult.reason || feedResult.reason;
      }
      setVideos([...libraryVideos, ...feedVideos]);
      if (libraryResult.status === 'rejected') setError('Some saved videos could not be loaded. Showing videos found in the feed.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to load videos.');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Count a view once per visit, and keep the visible count in sync with the API response.
  const recordView = useCallback(async (id) => {
    const currentVideo = videos.find((video) => String(video.id) === String(id));
    if (!currentVideo || currentVideo.isFeedFallback) return;
    const key = String(id);
    if (viewedIdsRef.current.has(key)) return;
    viewedIdsRef.current.add(key);
    try {
      const result = await apiRequest(`/videos/${id}/views`, { method: 'POST' });
      setVideos((current) => current.map((video) => String(video.id) === key
        ? { ...video, views: result.views }
        : video));
    } catch (_) {
      // A view counter should never interrupt video playback if the network is unavailable.
    }
  }, [videos]);

  // Only the reel mostly visible in the mobile scroller plays; all other videos are paused.
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !videos.length || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const player = entry.target;
        const id = player.dataset.videoId;
        if (!id) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          recordView(id);
          // Muted inline playback is permitted by mobile browsers during automatic scrolling.
          player.muted = !soundEnabled;
          player.play()
            .then(() => setAutoplayBlockedId(null))
            .catch(() => setAutoplayBlockedId(id));
        } else {
          player.pause();
        }
      });
    }, { root: feed, threshold: [0.2, 0.65, 0.9] });

    feed.querySelectorAll('[data-video-id]').forEach((player) => observer.observe(player));
    return () => observer.disconnect();
  }, [videos, recordView, soundEnabled]);

  const publishVideo = async (event) => {
    event.preventDefault();
    if (!file) { setError('Choose a video file to upload.'); return; }
    setUploading(true);
    setError('');
    try {
      const upload = await uploadMedia(file);
      await apiRequest('/videos', {
        method: 'POST',
        body: { title: title.trim() || file.name, description, videoUrl: upload.url },
      });
      setFormOpen(false);
      setTitle('');
      setDescription('');
      setFile(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
    }
  };

  const showComments = async (videoId) => {
    const selectedVideo = videos.find((video) => String(video.id) === String(videoId));
    if (selectedVideo?.isFeedFallback) return;
    setCommentsVideoId(videoId);
    setComments([]);
    setCommentDraft('');
    setError('');
    setCommentsLoading(true);
    try {
      const result = await apiRequest(`/videos/${videoId}/comments`);
      setComments(result.comments || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const postComment = async (event) => {
    event.preventDefault();
    if (!commentsVideoId || !commentDraft.trim()) return;
    try {
      await apiRequest(`/videos/${commentsVideoId}/comments`, {
        method: 'POST',
        body: { text: commentDraft.trim() },
      });
      // Reload to include the author's current name and other server-owned comment fields.
      const result = await apiRequest(`/videos/${commentsVideoId}/comments`);
      setComments(result.comments || []);
      setCommentDraft('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const toggleLike = async (videoId) => {
    const current = videos.find((video) => String(video.id) === String(videoId));
    if (!current || current.isFeedFallback) return;
    try {
      const result = await apiRequest(`/videos/${videoId}/likes`, { method: current.liked ? 'DELETE' : 'POST' });
      setVideos((rows) => rows.map((video) => String(video.id) === String(videoId)
        ? { ...video, liked: result.liked, likes: result.likes }
        : video));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const togglePlayback = (event, videoId) => {
    const player = event.currentTarget.querySelector('video');
    if (!player) return;
    // A direct user gesture is allowed to enable audio on mobile browsers.
    setSoundEnabled(true);
    player.muted = false;
    if (player.paused) {
      player.play()
        .then(() => setAutoplayBlockedId(null))
        .catch(() => setAutoplayBlockedId(String(videoId)));
    } else {
      player.pause();
    }
  };

  const uploadForm = formOpen && <form className="videos-upload-form" onSubmit={publishVideo}>
    <div className="videos-upload-form-heading"><strong>Upload a video</strong><button type="button" onClick={() => setFormOpen(false)} aria-label="Close upload form">×</button></div>
    <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength="180" placeholder="Video title" />
    <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="5000" placeholder="Description" />
    <input required type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setFile(event.target.files?.[0] || null)} />
    {error && <p className="videos-inline-error">{error}</p>}
    <button disabled={uploading} type="submit">{uploading ? 'Uploading…' : 'Publish video'}</button>
  </form>;

  return <div className="videos-page">
    {/* On phones the route itself is the reel experience; no card tap or modal is needed. */}
    <section ref={feedRef} className="videos-reel-feed" aria-label="Videos">
      {videos.map((video) => <article key={video.id} className="videos-reel" onClick={(event) => togglePlayback(event, video.id)} onDoubleClick={(event) => { event.stopPropagation(); toggleLike(video.id); }}>
        <video
          data-video-id={String(video.id)}
          src={video.videoUrl}
          poster={video.thumbnail || undefined}
          muted={!soundEnabled}
          controls
          playsInline
          loop
          preload="metadata"
          aria-label={video.title}
        />
        <div className="videos-reel-shade" />
        <div className="videos-reel-caption">
          <div className="videos-reel-creator"><Avatar name={video.creator} picture={video.picture} size={38} /><strong>{video.creator}</strong><span>{video.handle}</span></div>
          <h1>{video.title}</h1>
          {video.description && <p>{video.description}</p>}
          <span className="videos-reel-views"><i className="fa-solid fa-eye" /> {video.views} views</span>
        </div>
        <div className="videos-reel-actions">
          {!video.isFeedFallback && <>
            <button type="button" aria-label={video.liked ? 'Unlike video' : 'Like video'} onClick={(event) => { event.stopPropagation(); toggleLike(video.id); }}>
              <i className={`fa-heart ${video.liked ? 'fa-solid text-red-400' : 'fa-regular'}`} /><span>{video.likes || 0}</span>
            </button>
            <button type="button" aria-label="View comments" onClick={(event) => { event.stopPropagation(); showComments(video.id); }}>
              <i className="fa-regular fa-comment" /><span>Comments</span>
            </button>
          </>}
          <ShareMenu path={video.isFeedFallback ? `/share/post/${video.postId}` : `/share/video/${video.id}`} title={video.title} text={video.description || video.title} downloads={[{ url: video.videoUrl, type: 'video', label: 'Download video' }]} downloadTextLabel="Download video details" buttonClassName="text-white hover:bg-white/10 hover:text-white" />
          <span><i className="fa-solid fa-eye" /><small>{video.views}</small></span>
        </div>
        {autoplayBlockedId === String(video.id) && <button type="button" className="videos-reel-play" aria-label="Play video" onClick={(event) => { event.stopPropagation(); const player = event.currentTarget.parentElement.querySelector('video'); setSoundEnabled(true); player.muted = false; player.play().then(() => setAutoplayBlockedId(null)).catch(() => {}); }}><i className="fa-solid fa-play" /></button>}
      </article>)}
      {!videos.length && <div className="videos-reel-empty">{loading ? 'Loading videos…' : error || 'No videos yet. Upload the first one.'}</div>}
    </section>

    {/* Keep simple controls above the reel so the video remains edge-to-edge on phones. */}
    <header className="videos-mobile-header">
      <button type="button" onClick={() => navigate('/home')} aria-label="Back to home"><i className="fa-solid fa-arrow-left" /></button>
      <strong>Videos</strong>
      <button type="button" onClick={() => setFormOpen(true)} aria-label="Upload video"><i className="fa-solid fa-plus" /></button>
    </header>

    {uploadForm}

    {/* Larger screens retain the familiar library grid and open the focused player on selection. */}
    <div className="videos-desktop-library">
      <div className="videos-desktop-heading"><h2>Videos</h2><button type="button" onClick={() => setFormOpen((open) => !open)}>{formOpen ? 'Cancel' : 'Upload video'}</button></div>
      {error && <p className="videos-error">{error}</p>}
      <div className="videos-desktop-grid">{videos.map((video) => <div key={video.id} className="videos-card-wrap">
        <button type="button" onClick={() => (video.isFeedFallback ? null : openVideo(video.id))} className="videos-card">
          <div className="videos-card-preview">
            {video.thumbnail
              ? <img src={video.thumbnail} alt="" />
              : <video src={video.videoUrl} muted playsInline preload="metadata" />}
            <span><i className="fa-solid fa-play" /></span>
          </div>
          <div className="videos-card-meta"><Avatar name={video.creator} picture={video.picture} size={34} /><span><strong>{video.title}</strong><small>{video.creator} · {video.views} views</small></span></div>
        </button>
        <div className="videos-card-share"><ShareMenu path={video.isFeedFallback ? `/share/post/${video.postId}` : `/share/video/${video.id}`} title={video.title} text={video.description || video.title} downloads={[{ url: video.videoUrl, type: 'video', label: 'Download video' }]} downloadTextLabel="Download video details" /></div>
      </div>)}</div>
      {!videos.length && !loading && !error && <p className="videos-desktop-empty">Videos uploaded by users will appear here.</p>}
    </div>

    {commentsVideoId && <div className="videos-comments-backdrop" onClick={() => setCommentsVideoId(null)}>
      <section className="videos-comments-panel" role="dialog" aria-modal="true" aria-label="Video comments" onClick={(event) => event.stopPropagation()}>
        <header><strong>Comments</strong><button type="button" onClick={() => setCommentsVideoId(null)} aria-label="Close comments">×</button></header>
        <div className="videos-comments-list">{commentsLoading ? <p>Loading comments…</p> : comments.length ? comments.map((item) => <article key={item.id}><strong>{item.fullname || item.username || 'User'}</strong><p>{item.body}</p></article>) : <p>No comments yet.</p>}</div>
        {error && <p className="videos-inline-error">{error}</p>}
        <form onSubmit={postComment}><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength="2000" placeholder="Add a comment" /><button type="submit">Send</button></form>
      </section>
    </div>}
  </div>;
}
