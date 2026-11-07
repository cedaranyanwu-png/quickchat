import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';
import AdFeedSlot from '../components/AdFeedSlot';
import Avatar from '../components/Avatar';
import FeedDiscovery from '../components/FeedDiscovery';
import LiveNowStrip from '../components/LiveNowStrip';
import StatusStrip from '../components/StatusStrip';
import PostCard from '../components/PostCard';
import { INTEREST_OPTIONS } from '../interest-options';

const LIVE_FEED_POLL_MS = 2000;

export default function Home({ refreshKey, openModal, onOpenPost, openVideo }) {
  const [activeTab, setActiveTab] = useState('All');
  const [posts, setPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [discovery, setDiscovery] = useState({ people: [], communities: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasLoadedFeed = useRef(false);
  const feedTabs = [
    { value: 'All', label: 'All' },
    { value: 'Following', label: 'Following' },
    ...(profile?.interests || []).map((interest) => ({
      value: interest,
      label: INTEREST_OPTIONS.find(([key]) => key === interest)?.[1] || interest,
    })),
  ];

  const loadFeed = useCallback(async ({ live = false } = {}) => {
    if (!live && !hasLoadedFeed.current) setLoading(true);
    try {
      // Feed posts and the composer identity both come from the authenticated API.
      // A profile lookup should never prevent the Home feed from rendering.
      // Load the feed first, then treat profile data as optional decoration.
      const updatesQuery = live ? '&live=1&limit=30' : '';
      const feed = await apiRequest(`/home?tab=${encodeURIComponent(activeTab)}${updatesQuery}`);
      const incoming = feed.posts || [];
      if (live) {
        setPosts((current) => mergeLivePosts(current, incoming));
      } else {
        const boostedPeople = (feed.boostedAccounts || []).map((acc) => ({ ...acc, isPromoted: true }));
        setPosts(incoming);
        setDiscovery({
          people: [...boostedPeople, ...(feed.suggestedUsers || [])].slice(0, 6),
          communities: feed.suggestedCommunities || [],
        });
      }
      setError('');
      if (!live || !hasLoadedFeed.current) {
        try {
          const account = await apiRequest('/profile/me');
          setProfile(account.profile || null);
        } catch (_profileError) {
          setProfile(null);
        }
      }
      hasLoadedFeed.current = true;
    } catch (requestError) {
      if (!live) setError(requestError.message);
    } finally {
      if (!live) setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    let timer;
    const poll = async () => {
      await loadFeed({ live: true });
      if (active) timer = setTimeout(poll, LIVE_FEED_POLL_MS);
    };
    loadFeed().finally(() => {
      if (active) timer = setTimeout(poll, LIVE_FEED_POLL_MS);
    });
    return () => { active = false; clearTimeout(timer); };
  }, [loadFeed, refreshKey]);

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-slate-900">Home</h2>
          <button onClick={onOpenPost} className="w-8 h-8 rounded-full bg-blue-700 text-white hover:bg-blue-800" aria-label="Create post"><i className="fa-solid fa-pen text-xs"></i></button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {feedTabs.map((tab) => <button key={tab.value} onClick={() => setActiveTab(tab.value)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${activeTab === tab.value ? 'bg-blue-700 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{tab.label}</button>)}
        </div>
      </div>

      <StatusStrip />

      <LiveNowStrip />

      <AdFeedSlot />

      <div className="flex items-center gap-3 p-4 border-b border-slate-200 hover:bg-slate-50">
        <Avatar name={profile?.fullName} picture={profile?.picture} size={38} />
        <button onClick={onOpenPost} className="flex-1 text-left text-sm text-slate-400">What's happening?</button>
        <button onClick={onOpenPost} className="flex h-8 w-8 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50" aria-label="Open post composer" title="Open post composer">
          <i className="fa-solid fa-pen-to-square text-sm" />
        </button>
      </div>

      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="p-8 text-center text-sm text-slate-500">Loading posts…</p>}
      {!loading && !error && posts.map((post, index) => (
        <React.Fragment key={post.id || post.campaignId || `card-${index}`}>
          <PostCard
            post={post}
            openModal={openModal}
            openVideo={openVideo}
            onChange={(changed) => setPosts((current) => current.map((row) => (row.id === changed.id ? changed : row)))}
            onDismiss={(id) => setPosts((current) => current.filter((row) => (row.id || row.campaignId) !== id))}
          />
          {index === 2 && <FeedDiscovery people={discovery.people} communities={discovery.communities} />}
          {index === 4 && <AdFeedSlot />}
        </React.Fragment>
      ))}
      {!loading && !error && posts.length > 0 && posts.length < 3 && <FeedDiscovery people={discovery.people} communities={discovery.communities} />}
      {!loading && !error && posts.length === 0 && <>
        <FeedDiscovery people={discovery.people} communities={discovery.communities} />
        <div className="p-10 text-center text-slate-500">
          <i className="fa-solid fa-wand-magic-sparkles text-3xl text-slate-300"></i>
          <p className="mt-2 text-sm">Your Home feed is built from the interests on your profile.</p>
          {!profile?.interests?.length && <Link to="/profile/edit" className="mt-2 inline-block text-xs font-bold text-blue-700 hover:underline">Choose your interests</Link>}
        </div>
      </>}
    </div>
  );
}

function mergeLivePosts(current, incoming) {
  const currentIds = new Set(current.map((post) => String(post.id)));
  const incomingById = new Map(incoming.map((post) => [String(post.id), post]));
  const newPosts = incoming.filter((post) => !currentIds.has(String(post.id)));
  const existingPosts = current.map((post) => incomingById.has(String(post.id))
    ? { ...post, ...incomingById.get(String(post.id)) }
    : post);
  return [...newPosts, ...existingPosts].slice(0, 100);
}
