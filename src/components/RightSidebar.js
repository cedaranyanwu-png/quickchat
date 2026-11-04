import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from './Avatar';
import AdultContentGate from './AdultContent';

function parseMedia(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function noAutoplayUrl(value) {
  try {
    const url = new URL(value);
    if (/youtube(?:-nocookie)?\.com$/i.test(url.hostname) || /\.youtube(?:-nocookie)?\.com$/i.test(url.hostname)) {
      url.searchParams.set('autoplay', '0');
    }
    return url.href;
  } catch (_error) {
    return value;
  }
}

function PostMedia({ value, title }) {
  const media = parseMedia(value);
  if (!media.length) return null;
  const image = media.find((entry) => entry.type === 'image');

  return (
    <div className="mt-2 space-y-2">
      {media.map((entry, index) => entry.type === 'video'
        ? entry.embed
          ? <iframe
            key={`${entry.url}-${index}`}
            src={noAutoplayUrl(entry.url)}
            title={`${title || 'Post'} video`}
            loading="lazy"
            allow="encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video w-full rounded-lg border-0 bg-black"
          />
          : <video
            key={`${entry.url}-${index}`}
            src={entry.url}
            poster={entry.thumbnailUrl || image?.url || undefined}
            controls
            preload="none"
            playsInline
            className="max-h-40 w-full rounded-lg bg-black object-contain"
          />
        : <img
          key={`${entry.url}-${index}`}
          src={entry.url}
          alt=""
          loading="lazy"
          className="max-h-40 w-full rounded-lg object-cover"
        />)}
    </div>
  );
}

export default function RightSidebar() {
  const navigate = useNavigate();
  const [discover, setDiscover] = useState({ trending: [], trendingPosts: [], mediaPosts: [], people: [] });
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/discover')
      .then((result) => {
        if (active) {
          setDiscover({
            trending: result.trending || [],
            trendingPosts: result.trendingPosts || [],
            mediaPosts: result.mediaPosts || [],
            people: result.people || [],
          });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    navigate(`/explore?q=${encodeURIComponent(search)}`);
  };

  return (
    <aside className="flex h-screen w-[320px] flex-col bg-slate-50">
      <form onSubmit={submitSearch} className="sticky top-0 z-10 bg-slate-50 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <i className="fa-solid fa-magnifying-glass text-xs text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search QuickChat"
            className="w-full border-none bg-transparent text-xs outline-none"
          />
        </div>
      </form>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {discover.people.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-extrabold">People to discover</h3>
            {discover.people.map((person) => (
              <button
                key={person.id}
                onClick={() => navigate(`/profile/${person.username}`)}
                className="mb-3 flex w-full items-center gap-2 text-left last:mb-0"
              >
                <Avatar name={person.fullname} picture={person.avatar_url || person.picture} size={32} />
                <span className="min-w-0">
                  <strong className="block truncate text-xs">{person.fullname}</strong>
                  <small className="text-slate-500">@{String(person.username).replace(/^@/, '')}</small>
                </span>
              </button>
            ))}
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-extrabold">Trending posts</h3>
          {discover.trendingPosts.map((post) => (
            <AdultContentGate key={post.id} isAdult={post.is_adult} as="article" className="border-b border-slate-100 py-3 last:border-0">
              <button
                onClick={() => navigate(`/share/post/${post.id}`)}
                className="block w-full text-left hover:bg-slate-50"
              >
                <span className="block text-[11px] text-slate-500">
                  {post.category || 'Trending'} · {post.fullname || 'QuickChat user'}
                </span>
                <span className="mt-1 line-clamp-3 block break-words text-xs text-slate-800">
                  {post.body}
                </span>
              </button>
              <PostMedia value={post.media} title="Trending post" />
              <small className="mt-1 block text-slate-500">
                {Number(post.like_count || 0)} likes · {Number(post.reply_count || 0)} replies · {Number(post.share_count || 0)} shares
              </small>
            </AdultContentGate>
          ))}
          {discover.trendingPosts.length === 0 && (
            <p className="text-xs text-slate-500">Posts will appear here as people interact.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-extrabold">Photos &amp; videos</h3>
          {discover.mediaPosts.map((post) => (
            <AdultContentGate key={post.id} isAdult={post.is_adult} as="article" className="border-b border-slate-100 py-3 last:border-0">
              <button
                onClick={() => navigate(`/share/post/${post.id}`)}
                className="block w-full text-left hover:bg-slate-50"
              >
                <span className="block text-[11px] text-slate-500">
                  {post.category || 'From the community'} · {post.fullname || 'QuickChat user'}
                </span>
                <span className="mt-1 line-clamp-2 block break-words text-xs text-slate-800">
                  {post.body}
                </span>
              </button>
              <PostMedia value={post.media} title="Community post" />
            </AdultContentGate>
          ))}
          {discover.mediaPosts.length === 0 && (
            <p className="text-xs text-slate-500">Photos and videos shared by the community will appear here.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-extrabold">Trending topics</h3>
          {discover.trending.map((topic) => (
            <button
              key={topic.category}
              onClick={() => navigate(`/explore?q=${encodeURIComponent(topic.category)}`)}
              className="w-full border-b py-2 text-left last:border-0 hover:bg-slate-50"
            >
              <span className="block text-[11px] text-slate-500">Topic</span>
              <strong className="text-xs">{topic.category}</strong>
              <small className="block text-slate-500">{topic.post_count} posts</small>
            </button>
          ))}
          {discover.trending.length === 0 && (
            <p className="text-xs text-slate-500">Topics appear as people post.</p>
          )}
        </section>

        <footer className="flex flex-wrap gap-2 py-2 text-[10px] text-slate-500">
          <span>Terms</span><span>Privacy</span><span>About</span><span>Help</span>
          <span>© {new Date().getFullYear()} QuickChat</span>
        </footer>
      </div>
    </aside>
  );
}
