import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';

const CATEGORIES = ['For You', 'News', 'Technology', 'Business', 'Entertainment', 'Sports', 'Science', 'Education'];
const categoryValue = (value) => value === 'For You' ? '' : value;

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function normalizeDiscoverPost(row) {
  return {
    id: Number(row.id),
    authorId: Number(row.author_id),
    text: row.body || '',
    type: row.kind || 'text',
    category: row.category || null,
    sourceLink: row.source_link || null,
    media: parseJsonArray(row.media),
    videoId: row.video_id || null,
    hashtags: parseJsonArray(row.hashtags),
    targetInterests: parseJsonArray(row.target_interests),
    name: row.fullname || '',
    username: row.username || '',
    handle: '@' + String(row.username || '').replace(/^@/, ''),
    picture: row.avatar_url || row.picture || null,
    verified: Boolean(Number(row.verified || 0)),
    createdAt: row.created_at,
    time: formatDate(row.created_at),
    likes: Number(row.like_count || 0),
    replies: Number(row.reply_count || 0),
    shares: Number(row.share_count || 0),
    liked: Boolean(Number(row.liked || 0)),
    bookmarked: Boolean(Number(row.bookmarked || 0)),
    reposted: Boolean(Number(row.reposted || 0)),
    isAdult: Boolean(row.is_adult),
    isUnavailable: false,
    isPaywalled: false,
    isPromoted: false,
    isSponsored: false,
  };
}

function formatDate(value) {
  if (!value) return 'Recently published';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently published' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Discover({ openModal, openVideo, embedded = false }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState('For You');
  const [articles, setArticles] = useState([]);
  const [trendingPosts, setTrendingPosts] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busyArticle, setBusyArticle] = useState(null);
  const [discussionArticle, setDiscussionArticle] = useState(null);
  const [commentary, setCommentary] = useState('');
  const [discussionError, setDiscussionError] = useState('');

  const load = useCallback(async ({ nextPage = 1, append = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '12', page: String(nextPage) });
      if (categoryValue(category)) params.set('category', categoryValue(category));

      // RSS articles are the primary Explore feed. Community recommendations are
      // supplemental and must never prevent publisher articles from rendering.
      const [articleResult, discoverResult] = await Promise.allSettled([
        apiRequest('/rss/articles?' + params.toString()),
        apiRequest('/discover'),
      ]);

      if (articleResult.status === 'rejected') throw articleResult.reason;
      const articleData = articleResult.value || {};
      setArticles((current) => append ? [...current, ...(articleData.articles || [])] : (articleData.articles || []));
      setHasMore(Boolean(articleData.hasMore));
      setPage(nextPage);

      if (discoverResult.status === 'fulfilled' && discoverResult.value) {
        setTrendingPosts((discoverResult.value.trendingPosts || []).map(normalizeDiscoverPost));
        setPeople(discoverResult.value.people || []);
      }
    } catch (requestError) {
      setError(requestError.message || 'RSS articles could not load right now.');
      if (!append) setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { load({ nextPage: 1 }); }, [load]);

  const recordInteraction = async (articleId, action) => {
    try { await apiRequest('/rss/articles/' + articleId + '/interactions', { method: 'POST', body: { action } }); }
    catch { /* Interaction tracking must not block reading. */ }
  };

  const toggleSave = async (article) => {
    setBusyArticle(article.id);
    try {
      if (article.saved) {
        await apiRequest('/rss/articles/' + article.id + '/save', { method: 'DELETE' });
      } else {
        await apiRequest('/rss/articles/' + article.id + '/save', { method: 'POST' });
      }
      setArticles((current) => current.map((item) => item.id === article.id ? { ...item, saved: !article.saved } : item));
    } catch (requestError) {
      setError(requestError.message || 'Could not update your saved articles.');
    } finally { setBusyArticle(null); }
  };

  const shareArticle = async (article) => {
    await recordInteraction(article.id, 'share');
    try {
      if (navigator.share) await navigator.share({ title: article.title, text: article.excerpt, url: article.articleUrl });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(article.articleUrl);
        window.alert('Article link copied.');
      } else window.prompt('Copy this article link', article.articleUrl);
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') window.prompt('Copy this article link', article.articleUrl);
    }
  };

  const readArticle = async (article) => {
    await recordInteraction(article.id, 'click');
    window.open(article.articleUrl, '_blank', 'noopener,noreferrer');
  };

  const publishDiscussion = async (event) => {
    event.preventDefault();
    if (!discussionArticle || !commentary.trim()) return;
    setBusyArticle(discussionArticle.id);
    setDiscussionError('');
    try {
      const result = await apiRequest('/rss/articles/' + discussionArticle.id + '/discuss', {
        method: 'POST',
        body: { commentary: commentary.trim() },
      });
      setDiscussionArticle(null);
      setCommentary('');
      navigate('/home', { state: { focusPostId: result.postId } });
    } catch (requestError) {
      setDiscussionError(requestError.message || 'Could not start this discussion.');
    } finally { setBusyArticle(null); }
  };

  return (
    <div className={embedded ? "mx-auto min-h-0 max-w-none bg-transparent pb-6" : "mx-auto min-h-screen max-w-5xl bg-slate-50 pb-24 lg:pb-12"}>
      <header className={`${embedded ? "relative" : "sticky top-0"} z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">QuickChat</div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">RSS Feed</h1>
            <p className="mt-0.5 text-xs text-slate-500">Publisher articles selected around your interests.</p>
          </div>
          <button type="button" onClick={() => load({ nextPage: 1 })} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100" aria-label="Refresh recommendations">
            <i className="fa-solid fa-rotate" />
          </button>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="RSS feed categories">
          {CATEGORIES.map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={'whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition ' + (category === item ? 'bg-blue-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700')}>
              {item}
            </button>
          ))}
        </nav>
      </header>

      <main className="space-y-6 px-3 py-4 sm:px-5">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Articles picked for you</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">From publishers around Nigeria and the world</p>
            </div>
            <Link to="/saved-articles" className="text-xs font-bold text-blue-700 no-underline hover:underline">Saved articles</Link>
          </div>

          {loading && articles.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
            </div>
          )}

          {!loading && articles.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><i className="fa-solid fa-compass text-lg" /></div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">Your discovery feed is getting ready</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">There are no imported articles in this category yet. Try another topic or come back after publishers have synchronized.</p>
              <button type="button" onClick={() => setCategory('For You')} className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white">Show all topics</button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {articles.map((article) => (
              <article key={article.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
                {article.imageUrl && <button type="button" onClick={() => readArticle(article)} className="block h-40 w-full overflow-hidden bg-slate-100 text-left">
                  <img src={article.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
                </button>}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700"><i className="fa-solid fa-rss" /> Publisher article</span>
                    <span className="text-[10px] text-slate-400">{formatDate(article.publishedAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="truncate">{article.publisherName || article.publisher}</span>
                    <span className="text-slate-300">•</span>
                    <span>{article.category}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-extrabold leading-5 text-slate-900">{article.title}</h3>
                  {article.excerpt && <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{article.excerpt}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => readArticle(article)} className="rounded-full bg-blue-700 px-3.5 py-2 text-[11px] font-bold text-white hover:bg-blue-800">Read original <i className="fa-solid fa-arrow-up-right-from-square ml-1" /></button>
                    <button type="button" onClick={() => toggleSave(article)} disabled={busyArticle === article.id} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label={article.saved ? 'Remove saved article' : 'Save article'} title={article.saved ? 'Saved' : 'Save article'}>
                      <i className={article.saved ? 'fa-solid fa-bookmark text-blue-700' : 'fa-regular fa-bookmark'} />
                    </button>
                    <button type="button" onClick={() => shareArticle(article)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Share article"><i className="fa-solid fa-share-nodes" /></button>
                    <button type="button" onClick={() => { setDiscussionArticle(article); setCommentary(''); setDiscussionError(''); }} className="ml-auto rounded-full bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-200">Discuss <i className="fa-solid fa-comments ml-1" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {hasMore && <div className="mt-4 text-center"><button type="button" disabled={loading} onClick={() => load({ nextPage: page + 1, append: true })} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50">{loading ? 'Loading…' : 'Load more articles'}</button></div>}
        </section>

        {trendingPosts.length > 0 && <section>
          <div className="mb-3"><h2 className="text-sm font-extrabold text-slate-900">Trending on QuickChat</h2><p className="mt-0.5 text-[11px] text-slate-500">Conversations created by the community</p></div>
          <div className="space-y-3">{trendingPosts.slice(0, 4).map((post) => <PostCard key={post.id} post={post} openModal={openModal} openVideo={openVideo} />)}</div>
        </section>}

        {people.length > 0 && <section>
          <div className="mb-3"><h2 className="text-sm font-extrabold text-slate-900">Creators to discover</h2><p className="mt-0.5 text-[11px] text-slate-500">People sharing ideas across your interests</p></div>
          <div className="grid gap-2 sm:grid-cols-2">{people.map((person) => <div key={person.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <Avatar name={person.fullname || person.name || person.username} picture={person.avatar_url || person.picture} size={42} />
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-900">{person.fullname || person.name}</div><div className="truncate text-[11px] text-slate-500">@{String(person.username || '').replace(/^@/, '')}</div></div>
            <button type="button" onClick={() => navigate('/profile/' + person.username)} className="rounded-full border border-blue-200 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50">View</button>
          </div>)}</div>
        </section>}
      </main>

      {discussionArticle && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="rss-discuss-title" onClick={() => setDiscussionArticle(null)}>
        <form onSubmit={publishDiscussion} onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Start a conversation</div><h2 id="rss-discuss-title" className="mt-1 text-base font-extrabold text-slate-900">Discuss this article</h2></div><button type="button" onClick={() => setDiscussionArticle(null)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600" aria-label="Close"><i className="fa-solid fa-xmark" /></button></div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold text-slate-900">{discussionArticle.title}</div><div className="mt-1 text-[11px] text-slate-500">{discussionArticle.publisherName || discussionArticle.publisher}</div><a href={discussionArticle.articleUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-blue-700">{discussionArticle.articleUrl}</a></div>
          <label className="mt-4 block text-xs font-bold text-slate-800">Your take</label>
          <textarea value={commentary} onChange={(event) => setCommentary(event.target.value)} rows={4} maxLength={3000} placeholder="What do you think about this story?" className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" required />
          {discussionError && <p role="alert" className="mt-2 text-xs text-red-600">{discussionError}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDiscussionArticle(null)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="submit" disabled={!commentary.trim() || busyArticle === discussionArticle.id} className="rounded-full bg-blue-700 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{busyArticle === discussionArticle.id ? 'Publishing…' : 'Publish discussion'}</button></div>
        </form>
      </div>}
    </div>
  );
}
