import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, apiRequest, resolveMediaUrl } from '../api';
import Avatar from './Avatar';
import ShareMenu from './ShareMenu';
import BoostModal from './BoostModal';
import AdultContentGate, { useAdultContentConsent } from './AdultContent';
import VerifiedBadge from './VerifiedBadge';

const FRESH_META_MS = 60_000;

function postTimestamp(value) {
  if (!value) return Number.NaN;
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  const withZone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  return new Date(withZone).getTime();
}

function isFreshPost(createdAt) {
  const timestamp = postTimestamp(createdAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < FRESH_META_MS;
}

export default function PostCard({ post, openModal, openVideo, onChange, onDismiss, readOnly = false, showShare = true }) {
  const navigate = useNavigate();
  const [item, setItem] = useState(post);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showPostMeta, setShowPostMeta] = useState(() => isFreshPost(post.createdAt));
  const [showMenu, setShowMenu] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState('');
  const [mediaIndex, setMediaIndex] = useState(0);
  const mediaTouchStartRef = useRef(null);
  const { confirmed: adultContentConfirmed } = useAdultContentConsent();

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  useEffect(() => {
    setItem(post);
    setMediaIndex(0);
  }, [post]);
  useEffect(() => { setItem(post); setMediaIndex(0); }, [post]);

  useEffect(() => {
    const timestamp = postTimestamp(item.createdAt);
    if (!Number.isFinite(timestamp)) {
      setShowPostMeta(false);
      return undefined;
    }
    const remaining = FRESH_META_MS - (Date.now() - timestamp);
    if (remaining <= 0) {
      setShowPostMeta(false);
      return undefined;
    }
    setShowPostMeta(true);
    const timer = setTimeout(() => setShowPostMeta(false), remaining);
    return () => clearTimeout(timer);
  }, [item.createdAt]);

  const update = (next) => {
    setItem(next);
    onChange?.(next);
  };

  const handleFeedback = async (action) => {
    setShowMenu(false);
    try {
      await apiRequest('/recommendations/feedback', {
        method: 'POST',
        body: {
          itemType: item.itemType || (item.isSponsored ? 'ad' : 'post'),
          itemId: item.id || item.campaignId,
          action,
          category: item.category || null,
        },
      });

      if (action === 'not_interested' || action === 'hide') {
        setFeedbackNotice(action === 'not_interested' ? 'Marked as not interested.' : 'Post hidden.');
        setTimeout(() => {
          onDismiss?.(item.id);
        }, 1200);
      } else if (action === 'show_more') {
        setFeedbackNotice('We will show you more posts like this!');
        setTimeout(() => setFeedbackNotice(''), 3000);
      }
    } catch (_err) {}
  };

  const toggleLike = async () => {
    try {
      setError('');
      const result = await apiRequest(`/posts/${item.id}/likes`, { method: item.liked ? 'DELETE' : 'POST' });
      update({ ...item, liked: result.liked, likes: result.likes });
    } catch (requestError) { setError(requestError.message); }
  };

  const toggleBookmark = async () => {
    try {
      setError('');
      const result = await apiRequest(`/posts/${item.id}/bookmark`, { method: item.bookmarked ? 'DELETE' : 'POST' });
      update({ ...item, bookmarked: result.bookmarked });
    } catch (requestError) { setError(requestError.message); }
  };

  const toggleRepost = async () => {
    try {
      setError('');
      const result = await apiRequest(`/posts/${item.id}/reposts`, { method: item.reposted ? 'DELETE' : 'POST' });
      update({ ...item, reposted: result.reposted, shares: result.shares });
    } catch (requestError) { setError(requestError.message); }
  };

  const toggleReplies = async () => {
    const nextOpen = !showReplies;
    setShowReplies(nextOpen);
    if (nextOpen && replies.length === 0) {
      try {
        const result = await apiRequest(`/posts/${item.id}/replies`);
        setReplies(result.replies || []);
      } catch (requestError) { setError(requestError.message); }
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!replyText.trim()) return;
    try {
      await apiRequest(`/posts/${item.id}/replies`, { method: 'POST', body: { text: replyText } });
      const refreshed = await apiRequest(`/posts/${item.id}/replies`);
      setReplies(refreshed.replies || []);
      setReplyText('');
      update({ ...item, replies: Number(item.replies || 0) + 1 });
    } catch (requestError) { setError(requestError.message); }
  };

  const buyAccess = async () => {
    if (readOnly) {
      setError('Sign in to unlock this post.');
      return;
    }
    setCheckoutLoading(true);
    setError('');
    try {
      const endpoint = item.paywallType === 'premium'
        ? `/payments/posts/${encodeURIComponent(item.id)}/checkout`
        : `/payments/creators/${encodeURIComponent(item.authorId)}/checkout`;
      const result = await apiRequest(endpoint, { method: 'POST', body: {} });
      window.location.assign(result.checkoutUrl);
    } catch (requestError) {
      setError(requestError.message);
      setCheckoutLoading(false);
    }
  };

  if (item.isUnavailable) return null;

  // --- Render Sponsored Advertisement ---
  if (item.itemType === 'ad' || item.isSponsored) {
    const clickUrl = `${API_BASE_URL}/ads/click/${item.campaignId || item.id}?token=${encodeURIComponent(item.clickToken || '')}`;
    return (
      <article className="flex gap-2 p-3 border-b border-slate-200 bg-blue-50/20 hover:bg-blue-50/40 transition-colors relative">
        <div className="self-start">
          <Avatar name={item.advertiser?.name || 'Sponsor'} picture={item.advertiser?.avatar} size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-bold text-sm text-slate-900">{item.advertiser?.name || 'Sponsored'}</span>
              {item.advertiser?.verified && <VerifiedBadge className="text-[11px]" />}
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-blue-800">Sponsored</span>
            </div>
            <div className="relative">
              <button onClick={() => setShowMenu((prev) => !prev)} className="text-slate-400 hover:text-slate-600 p-1">
                <i className="fa-solid fa-ellipsis text-xs" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-20 text-xs">
                  <button onClick={() => handleFeedback('not_interested')} className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50">
                    <i className="fa-solid fa-eye-slash text-slate-400" />
                    Not interested
                  </button>
                  <button onClick={() => handleFeedback('hide')} className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50">
                    <i className="fa-solid fa-ban text-slate-400" />
                    Hide this ad
                  </button>
                </div>
              )}
            </div>
          </div>

          <h4 className="mt-1 font-bold text-sm text-slate-900">{item.title}</h4>
          <p className="mt-0.5 text-xs text-slate-700 whitespace-pre-wrap">{item.description}</p>

          {item.creativeUrl && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 max-h-72 bg-black flex items-center justify-center">
              <img src={item.creativeUrl} alt={item.title} className="max-h-72 w-full object-cover" />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-[11px] text-slate-500 font-medium">
              <i className="fa-solid fa-arrow-up-right-from-square mr-1 text-[10px]" />
              {item.advertisedProduct || 'Promoted product or service'}
            </span>
            <a
              href={clickUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-800"
            >
              Learn More
              <i className="fa-solid fa-chevron-right text-[10px]" />
            </a>
          </div>

          {feedbackNotice && <p className="mt-2 text-xs font-semibold text-blue-700">{feedbackNotice}</p>}
        </div>
      </article>
    );
  }

  // --- Render Standard or Boosted Post ---
  const username = String(item.username || item.handle || '').replace(/^@/, '');
  const media = (Array.isArray(item.media) ? item.media : []).map((entry) => ({
    ...entry,
    url: resolveMediaUrl(entry?.url),
    thumbnailUrl: resolveMediaUrl(entry?.thumbnailUrl),
    type: String(entry?.type || entry?.mimeType || '').toLowerCase().startsWith('video') || /\\.(mp4|webm|mov)(?:[?#]|$)/i.test(String(entry?.url || '')) ? 'video' : 'image',
  })).filter((entry) => entry.url);
  const isAuthor = currentUser?.id && item.authorId && Number(currentUser.id) === Number(item.authorId);

  let sourceHost = '';
  if (item.sourceLink) {
    try { sourceHost = new URL(item.sourceLink).hostname.replace(/^www\./, ''); } catch { sourceHost = 'Original source'; }
  }
  const downloads = media.map((entry, index) => ({
    url: entry.url,
    type: entry.type,
    label: `Download ${entry.type || 'media'}${media.length > 1 ? ` ${index + 1}` : ''}`,
  }));
  const currentMedia = media[mediaIndex] || null;

  const openFocusedMedia = () => {
    if (!currentMedia) return;
    if (currentMedia.type === 'video') {
      if (item.videoId) openVideo?.(item.videoId);
      else openModal?.(currentMedia.url, 'video');
      return;
    }
    openModal?.(currentMedia.url);
  };

  const handlePostCardClick = (event) => {
    if (typeof window === 'undefined' || window.innerWidth < 1024) return;
    if (event.target.closest('button, a, input, textarea, select, video, form')) return;
    openFocusedMedia();
  };

  const handleMediaTouchStart = (event) => {
    const touch = event.touches[0];
    mediaTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleMediaTouchEnd = (event) => {
    const start = mediaTouchStartRef.current;
    mediaTouchStartRef.current = null;
    if (!start || media.length < 2) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    setMediaIndex((current) => dx < 0
      ? Math.min(current + 1, media.length - 1)
      : Math.max(current - 1, 0));
  };

  return (
    <article
      onClick={handlePostCardClick}
      className={`flex gap-2 p-3 border-b border-slate-200 hover:bg-slate-50 transition-colors relative ${item.isPromoted ? 'bg-amber-50/15' : ''} lg:cursor-pointer`}
    >
      <button onClick={() => !readOnly && username && navigate(`/profile/${username}`)} className="self-start border-0 bg-transparent p-0">
        <Avatar name={item.name} picture={item.picture} size={36} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => !readOnly && username && navigate(`/profile/${username}`)} className="font-bold text-sm text-slate-900 border-0 bg-transparent p-0 hover:underline">{item.name || 'User'}</button>
            <VerifiedBadge verified={item.verified} className="text-xs" />
            <span className="text-slate-500 text-xs">{item.handle || (username ? `@${username}` : '')} · {item.time}</span>
            {item.isPromoted && (
              <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-800">
                <i className="fa-solid fa-bolt mr-1 text-amber-600" />
                Promoted
              </span>
            )}
          </div>
          {!readOnly && (
            <div className="relative">
              <button type="button" onClick={() => setShowMenu((prev) => !prev)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Post options">
                <i className="fa-solid fa-ellipsis text-xs" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-xl z-20 text-xs">
                  <button onClick={() => handleFeedback('show_more')} className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50">
                    <i className="fa-regular fa-thumbs-up text-blue-600" />
                    Show more like this
                  </button>
                  <button onClick={() => handleFeedback('not_interested')} className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50">
                    <i className="fa-solid fa-eye-slash text-slate-400" />
                    Not interested
                  </button>
                  <button onClick={() => handleFeedback('hide')} className="flex w-full items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50">
                    <i className="fa-solid fa-ban text-slate-400" />
                    Hide this post
                  </button>
                  {isAuthor && (
                    <button onClick={() => { setShowMenu(false); setShowBoostModal(true); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-amber-700 font-bold hover:bg-amber-50">
                      <i className="fa-solid fa-rocket" />
                      Boost this post
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {item.recommendationReason && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-blue-600 font-medium">
            <i className="fa-solid fa-wand-magic-sparkles text-[9px]" />
            <span>{item.recommendationReason}</span>
          </div>
        )}

        {showPostMeta && (item.communityName || item.category) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.communityName && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"><i className="fa-solid fa-users mr-1" />{item.communityName}</span>}
            {item.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{item.category}</span>}
          </div>
        )}

        {item.isPaywalled ? (
          <section className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white text-blue-700">
                <i className={`fa-solid ${item.paywallType === 'fans' ? 'fa-star' : 'fa-lock'}`} />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">{item.paywallType === 'fans' ? 'For this creator’s fans' : 'Premium post'}</p>
                <p className="mt-1 text-xs text-slate-600">{item.paywallType === 'fans' ? 'Get a 30-day fan pass to read this post and other fans-only posts.' : 'Unlock this post with a one-time payment.'}</p>
                <p className="mt-2 text-xs font-bold text-slate-700">{item.priceCurrency || 'NGN'} {Number(item.priceAmount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            {!readOnly && (
              <button type="button" disabled={checkoutLoading} onClick={buyAccess} className="mt-3 rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                {checkoutLoading ? 'Opening checkout…' : item.paywallType === 'fans' ? 'Get 30-day fan pass' : 'Unlock post'}
              </button>
            )}
          </section>
        ) : (
          <AdultContentGate isAdult={item.isAdult}>
            {item.text && <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap break-words">{item.text}</p>}
            {item.linkedArticle?.url && <a href={item.linkedArticle.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 no-underline hover:border-blue-200">
              {item.linkedArticle.imageUrl && <img src={item.linkedArticle.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-24 w-24 flex-shrink-0 object-cover" />}
              <span className="min-w-0 flex-1 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-blue-700">Discussing an external article</span>
                <strong className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-900">{item.linkedArticle.title}</strong>
                <span className="mt-1 block truncate text-[10px] text-slate-500">{item.linkedArticle.publisher} · Read original <i className="fa-solid fa-arrow-up-right-from-square ml-1" /></span>
              </span>
            </a>}
            {showPostMeta && item.sourceLink && <a href={item.sourceLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"><i className="fa-solid fa-arrow-up-right-from-square" />Source: {sourceHost}</a>}
            {showPostMeta && item.hashtags?.length > 0 && <div className="mt-1 flex flex-wrap gap-x-2">{item.hashtags.map((tag) => <span key={tag} className="text-xs font-semibold text-blue-700">#{tag}</span>)}</div>}
            {media.length > 0 && (
              <div
                className="relative mt-2 overflow-hidden rounded-xl border border-slate-200 bg-black"
                onTouchStart={handleMediaTouchStart}
                onTouchEnd={handleMediaTouchEnd}
              >
                {currentMedia?.type === 'image' ? (
                  readOnly
                    ? <img src={currentMedia.url} alt={`Post attachment ${mediaIndex + 1}`} className="max-h-[460px] w-full object-cover" />
                    : <button type="button" onClick={openFocusedMedia} className="block w-full border-0 bg-transparent p-0">
                        <img src={currentMedia.url} alt={`Post attachment ${mediaIndex + 1}`} className="max-h-[460px] w-full object-cover" />
                      </button>
                ) : currentMedia?.embed ? (
                  <iframe src={currentMedia.url} title="Embedded video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="aspect-video w-full border-0 bg-black" />
                ) : currentMedia ? (
                  <button type="button" onClick={() => item.videoId ? openVideo?.(item.videoId) : openModal?.(currentMedia.url, 'video')} className="block w-full border-0 bg-black p-0">
                    <video src={currentMedia.url} poster={currentMedia.thumbnailUrl || undefined} muted playsInline preload="metadata" className="max-h-[460px] w-full object-contain" />
                    <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white">
                      <i className="fa-solid fa-play" />
                    </span>
                  </button>
                ) : null}

                {media.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setMediaIndex((current) => Math.max(0, current - 1)); }}
                      disabled={mediaIndex === 0}
                      aria-label="Previous media"
                      className="absolute left-2 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30"
                    ><i className="fa-solid fa-chevron-left text-xs" /></button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setMediaIndex((current) => Math.min(media.length - 1, current + 1)); }}
                      disabled={mediaIndex === media.length - 1}
                      aria-label="Next media"
                      className="absolute right-2 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30"
                    ><i className="fa-solid fa-chevron-right text-xs" /></button>
                    <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/45 px-2 py-1">
                      {media.map((entry, index) => (
                        <button
                          key={`${entry.url}-${index}`}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setMediaIndex(index); }}
                          aria-label={`Show media ${index + 1}`}
                          className={`h-1.5 rounded-full transition-all ${index === mediaIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                        />
                      ))}
                    </div>
                    <span className="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white">{mediaIndex + 1}/{media.length}</span>
                  </>
                )}
              </div>
            )}
            {!media.length && !readOnly && item.videoId && <button type="button" onClick={() => openVideo?.(item.videoId)} className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-blue-700">Open video</button>}
          </AdultContentGate>
        )}

        {(!readOnly || showShare) && (
          <div className="flex items-center justify-between max-w-lg mt-3 text-slate-500 text-xs">
            {!readOnly && <button onClick={toggleReplies} disabled={item.isAdult && !adultContentConfirmed} className="hover:text-blue-700 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50" aria-label="View replies"><i className="fa-regular fa-comment"></i>{item.replies || 0}</button>}
            {!readOnly && <button onClick={toggleRepost} className={`flex items-center gap-1 ${item.reposted ? 'text-emerald-700' : 'hover:text-emerald-600'}`} aria-label={item.reposted ? 'Undo repost' : 'Repost'}><i className="fa-solid fa-retweet"></i>{item.shares || 0}</button>}
            {!readOnly && <button onClick={toggleLike} className={`flex items-center gap-1 ${item.liked ? 'text-red-600' : 'hover:text-red-600'}`} aria-label={item.liked ? 'Unlike post' : 'Like post'}><i className={`${item.liked ? 'fa-solid' : 'fa-regular'} fa-heart`}></i>{item.likes || 0}</button>}
            {!readOnly && <button onClick={toggleBookmark} className={item.bookmarked ? 'text-blue-700' : 'hover:text-blue-700'} aria-label={item.bookmarked ? 'Remove bookmark' : 'Bookmark post'}><i className={`${item.bookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark`}></i></button>}
            {showShare && (!item.isAdult || adultContentConfirmed) && <ShareMenu path={`/share/post/${item.id}`} title={`Post by ${item.name || 'QuickChat user'}`} text={item.text || 'See this post on QuickChat'} downloads={downloads} />}
          </div>
        )}

        {showReplies && !readOnly && (!item.isAdult || adultContentConfirmed) && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            {replies.map((reply) => <p key={reply.id} className="text-xs text-slate-600 py-1"><strong className="text-slate-900">{reply.fullname || reply.username || 'User'} <VerifiedBadge verified={reply.verified} /></strong>{' '}{reply.body}</p>)}
            {replies.length > 0 && Number(item.replies || 0) > replies.length && <p className="py-1 text-[11px] text-slate-400">Showing the latest {replies.length} replies.</p>}
            <form onSubmit={sendReply} className="flex gap-2 mt-2">
              <input value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Write a reply" className="flex-1 border border-slate-200 rounded-full px-3 py-1.5 text-xs outline-none focus:border-blue-600" />
              <button className="px-3 py-1.5 bg-blue-700 text-white rounded-full text-xs font-bold">Reply</button>
            </form>
          </div>
        )}

        {feedbackNotice && <p className="text-xs text-blue-700 font-semibold mt-2">{feedbackNotice}</p>}
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <BoostModal
        isOpen={showBoostModal}
        onClose={() => setShowBoostModal(false)}
        post={item}
        onBoosted={() => update({ ...item, isPromoted: true })}
      />
    </article>
  );
}
