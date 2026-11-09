import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';
import AdFeedSlot from '../components/AdFeedSlot';
import FeedDiscovery from '../components/FeedDiscovery';
import PostCard from '../components/PostCard';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import BoostModal from '../components/BoostModal';
import Discover from './Discover';

const LIVE_FEED_POLL_MS = 6000;
const categoryStyles = [
  ['fa-microchip', 'from-blue-600 to-blue-800'],
  ['fa-palette', 'from-purple-600 to-purple-800'],
  ['fa-briefcase', 'from-emerald-600 to-emerald-800'],
  ['fa-futbol', 'from-orange-600 to-orange-800'],
  ['fa-film', 'from-pink-600 to-pink-800'],
  ['fa-newspaper', 'from-slate-600 to-slate-800'],
  ['fa-laptop-code', 'from-cyan-600 to-cyan-800'],
  ['fa-chart-line', 'from-amber-600 to-amber-800'],
];

export default function Explore({ openModal, openVideo }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'for_you');
  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('cat') || '');
  
  const [data, setData] = useState({ categories: [], posts: [], users: [], people: [], communities: [] });
  const [businessData, setBusinessData] = useState({ opportunities: [], services: [], discussions: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [boostTarget, setBoostTarget] = useState(null);

  // Sync state with URL params
  useEffect(() => {
    setSearchText(searchParams.get('q') || '');
    if (searchParams.get('tab')) setActiveTab(searchParams.get('tab'));
    if (searchParams.get('cat')) setSelectedCategory(searchParams.get('cat'));
  }, [searchParams]);

  const setTab = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params);
  };

  const handleSelectCategory = (cat) => {
    if (selectedCategory === cat) {
      setSelectedCategory('');
      const params = new URLSearchParams(searchParams);
      params.delete('cat');
      setSearchParams(params);
    } else {
      setSelectedCategory(cat);
      const params = new URLSearchParams(searchParams);
      params.set('cat', cat);
      setSearchParams(params);
    }
  };

  useEffect(() => {
    if (activeTab === 'rss') return undefined;
    let active = true;
    let timer;

    const loadExplore = async (live = false) => {
      if (!live) setLoading(true);
      try {
        const queryTerm = searchText || selectedCategory || '';
        const updatesQuery = live ? '&live=1&limit=30' : '';
        const result = await apiRequest(`/explore?q=${encodeURIComponent(queryTerm)}${updatesQuery}`);
        
        if (active) {
          const next = {
            categories: result.categories || [],
            posts: result.posts || [],
            users: result.users || [],
            people: result.suggestedUsers || [],
            communities: result.suggestedCommunities || [],
          };
          setData((current) => live ? { ...current, posts: mergeLivePosts(current.posts, next.posts) } : next);
          setError('');
        }
      } catch (err) {
        if (active && !live) setError(err.message);
      } finally {
        if (active && !live) setLoading(false);
      }
    };

    const loadBusiness = async () => {
      try {
        const res = await apiRequest('/business/opportunities');
        if (active && res) {
          setBusinessData({
            opportunities: res.opportunities || [],
            services: res.services || [],
            discussions: res.discussions || [],
          });
        }
      } catch {
        // Fallback gracefully if user doesn't have business profile yet
      }
    };

    const searchTimer = setTimeout(async () => {
      await loadExplore();
      if (activeTab === 'business') {
        await loadBusiness();
      }
      if (active) timer = setTimeout(poll, LIVE_FEED_POLL_MS);
    }, 200);

    const poll = async () => {
      if (activeTab === 'for_you' || activeTab === 'trending' || activeTab === 'posts') {
        await loadExplore(true);
      }
      if (active) timer = setTimeout(poll, LIVE_FEED_POLL_MS);
    };

    return () => {
      active = false;
      clearTimeout(searchTimer);
      clearTimeout(timer);
    };
  }, [searchText, selectedCategory, activeTab]);

  // Handle post feedback
  const handleFeedback = (postId, action) => {
    setData((current) => ({
      ...current,
      posts: current.posts.filter((p) => p.id !== postId),
    }));
  };

  // Filter content based on activeTab
  const sponsoredPosts = data.posts.filter((p) => p.isSponsored || p.isBoosted);
  const organicPosts = data.posts.filter((p) => !p.isSponsored);

  return (
    <div className="max-w-4xl mx-auto pb-24 lg:pb-12 min-h-screen">
      {/* Sticky Header with Search */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 z-20 px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white">
              <i className="fa-solid fa-compass text-sm" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 leading-tight">Explore</h1>
              <p className="text-[11px] text-slate-500">Curated feeds, hot topics, people & opportunities</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/recommendations')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold transition"
          >
            <i className="fa-solid fa-wand-magic-sparkles text-xs" />
            <span>My Rec Bot</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search keywords, #hashtags, topics, and people..."
            className="w-full bg-slate-100 focus:bg-white border border-transparent focus:border-blue-500 rounded-full pl-9 pr-8 py-2 text-xs outline-none transition"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mt-3 pt-1 border-t border-slate-100">
          {[
            { id: 'for_you', label: 'For You', icon: 'fa-solid fa-sparkles' },
            { id: 'trending', label: 'Trending', icon: 'fa-solid fa-fire' },
            { id: 'posts', label: 'Posts', icon: 'fa-solid fa-newspaper' },
            { id: 'people', label: 'People', icon: 'fa-solid fa-users' },
            { id: 'communities', label: 'Communities', icon: 'fa-solid fa-layer-group' },
            { id: 'business', label: 'Business & Services', icon: 'fa-solid fa-briefcase' },
            { id: 'sponsored', label: 'Sponsored', icon: 'fa-solid fa-bullhorn' },
            { id: 'rss', label: 'RSS Feed', icon: 'fa-solid fa-rss' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <i className={`${tab.icon} text-[10px]`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'rss' ? <Discover embedded openModal={openModal} openVideo={openVideo} /> : <>
      {/* Selected category pill alert */}
      {selectedCategory && (
        <div className="mx-4 mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
          <span>Filtering by category: <strong>{selectedCategory}</strong></span>
          <button onClick={() => handleSelectCategory(selectedCategory)} className="text-blue-700 hover:underline font-bold">
            Clear filter
          </button>
        </div>
      )}

      {/* Category Grid (shown on For You and Trending when no specific search is active) */}
      {(activeTab === 'for_you' || activeTab === 'trending') && !searchText && (
        <section className="p-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Browse Topic Categories</h3>
            <span className="text-[11px] text-slate-400">Click to filter feed</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.categories.slice(0, 8).map((category, index) => {
              const style = categoryStyles[index % categoryStyles.length];
              const isSelected = selectedCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => handleSelectCategory(category)}
                  className={`bg-gradient-to-br ${style[1]} ${
                    isSelected ? 'ring-2 ring-offset-2 ring-blue-700 scale-[1.02]' : 'opacity-95 hover:opacity-100'
                  } rounded-xl p-3 flex flex-col items-center justify-center text-center transition shadow-sm h-20 text-white`}
                >
                  <i className={`fa-solid ${style[0]} text-base mb-1`} />
                  <span className="font-bold text-xs truncate max-w-full px-1">{category}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* User Search Results */}
      {data.users.length > 0 && (
        <section className="px-4 py-3 bg-blue-50/50 border-y border-blue-100 my-2">
          <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">Matching People</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.users.map((user) => (
              <div
                key={user.id}
                onClick={() => navigate(`/profile/${user.username}`)}
                className="flex items-center gap-3 p-2 bg-white rounded-xl border border-blue-100 hover:border-blue-300 cursor-pointer shadow-xs transition"
              >
                <Avatar name={user.name} picture={user.picture} size={36} />
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs text-slate-900 font-bold truncate">{user.name} <VerifiedBadge verified={user.verified} /></strong>
                  <span className="block text-[11px] text-slate-500 truncate">@{String(user.username).replace(/^@/, '')}</span>
                </div>
                <button className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold transition">
                  View
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Tab Content */}
      <div className="px-4 pt-2">
        {activeTab === 'sponsored' && <AdFeedSlot placement="explore" slotIndex={0} className="mb-3 rounded-xl border border-slate-200" />}
        {error && <p className="p-4 text-sm text-red-600 bg-red-50 rounded-xl mb-3">{error}</p>}
        {loading && (
          <div className="py-12 text-center text-slate-400">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-blue-600 mb-2" />
            <p className="text-xs">Curating discovery recommendations...</p>
          </div>
        )}

        {/* TAB 1: FOR YOU */}
        {!loading && !error && activeTab === 'for_you' && (
          <div>
            {data.posts.map((post, index) => (
              <React.Fragment key={post.id}>
                <PostCard
                  post={post}
                  openModal={openModal}
                  openVideo={openVideo}
                  onDismiss={(postId, reason) => handleFeedback(postId, reason)}
                  onBoost={(p) => setBoostTarget(p)}
                />
                {index === 2 && <FeedDiscovery people={data.people} communities={data.communities} />}
                {index === 5 && <AdFeedSlot placement="explore" slotIndex={1} />}
              </React.Fragment>
            ))}
            {data.posts.length < 3 && <FeedDiscovery people={data.people} communities={data.communities} />}
            {data.posts.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                <i className="fa-solid fa-compass text-3xl text-slate-300 mb-2" />
                <p className="text-sm font-semibold">No posts found for this query</p>
                <p className="text-xs text-slate-400 mt-1">Try exploring different keywords or clear your category filter.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TRENDING */}
        {!loading && !error && activeTab === 'trending' && (
          <div>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3.5 mb-4 flex items-center justify-between">
              <div>
                <strong className="block text-xs font-extrabold text-amber-900">
                  <i className="fa-solid fa-fire text-orange-500 mr-1.5" />
                  Trending Discussions & Topics
                </strong>
                <p className="text-[11px] text-amber-800">High velocity engagement, community velocity, and organic discussions.</p>
              </div>
              <span className="text-[10px] font-bold bg-white text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                Real-Time
              </span>
            </div>

            {organicPosts.map((post, index) => (
              <React.Fragment key={post.id}>
                <PostCard
                  post={post}
                  openModal={openModal}
                  openVideo={openVideo}
                  onDismiss={(postId, reason) => handleFeedback(postId, reason)}
                  onBoost={(p) => setBoostTarget(p)}
                />
                {index === 4 && <AdFeedSlot placement="explore" slotIndex={1} />}
              </React.Fragment>
            ))}
            {organicPosts.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">No trending discussions found right now.</p>
            )}
          </div>
        )}

        {/* TAB 3: POSTS */}
        {!loading && !error && activeTab === 'posts' && (
          <div>
            {organicPosts.map((post, index) => (
              <React.Fragment key={post.id}>
                <PostCard
                  post={post}
                  openModal={openModal}
                  openVideo={openVideo}
                  onDismiss={(postId, reason) => handleFeedback(postId, reason)}
                  onBoost={(p) => setBoostTarget(p)}
                />
                {index === 4 && <AdFeedSlot placement="explore" slotIndex={1} />}
              </React.Fragment>
            ))}
            {organicPosts.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">No organic posts match your search query.</p>
            )}
          </div>
        )}

        {/* TAB 4: PEOPLE */}
        {!loading && !error && activeTab === 'people' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recommended & Boosted People</h3>
              <button onClick={() => navigate('/follow')} className="text-xs text-blue-700 hover:underline font-semibold">
                View all people
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(data.people.length > 0 ? data.people : data.users).map((user) => (
                <div key={user.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
                  <Avatar name={user.name || user.fullName} picture={user.picture} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <strong className="block text-xs font-bold text-slate-900 truncate">
                        {user.name || user.fullName} <VerifiedBadge verified={user.verified} />
                      </strong>
                      {user.isBoosted && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full border border-amber-300">
                          Promoted
                        </span>
                      )}
                    </div>
                    <span className="block text-[11px] text-slate-500 truncate mb-1">
                      @{String(user.username || user.handle || '').replace(/^@/, '')}
                    </span>
                    {user.bio && <p className="text-[11px] text-slate-600 line-clamp-2 mb-2">{user.bio}</p>}
                    <button
                      onClick={() => navigate(`/profile/${user.username || user.handle}`)}
                      className="w-full py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold transition"
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: COMMUNITIES */}
        {!loading && !error && activeTab === 'communities' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Interest-Aligned Communities</h3>
              <button onClick={() => navigate('/communities')} className="text-xs text-blue-700 hover:underline font-semibold">
                Explore all communities
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.communities.map((comm) => (
                <div key={comm.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base flex-shrink-0">
                    {comm.avatar ? <img src={comm.avatar} alt={comm.name} className="w-full h-full rounded-xl object-cover" /> : comm.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <strong className="block text-xs font-bold text-slate-900 truncate">{comm.name}</strong>
                    <span className="text-[11px] text-slate-500">{comm.memberCount || comm.membersCount || 0} members</span>
                    {comm.description && <p className="text-[11px] text-slate-600 line-clamp-1 mt-0.5">{comm.description}</p>}
                  </div>
                  <button
                    onClick={() => navigate(`/communities/${comm.id}`)}
                    className="px-3 py-1.5 bg-blue-700 text-white hover:bg-blue-800 rounded-lg text-xs font-semibold transition"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: BUSINESS & SERVICES */}
        {!loading && !error && activeTab === 'business' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl p-4 text-white shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Business Discovery
                </span>
                <button
                  onClick={() => navigate('/settings?tab=business')}
                  className="text-xs text-blue-200 hover:text-white underline font-semibold"
                >
                  Configure Business Profile
                </button>
              </div>
              <h2 className="text-sm font-extrabold mb-1">Discover Services, Partners & Opportunities</h2>
              <p className="text-xs text-blue-100">
                Recommendations tailored to your declared stage, category, and assistance needs (website developers, marketers, suppliers, and more).
              </p>
            </div>

            {/* Opportunities list */}
            {businessData.services.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Matching Service Providers & Solutions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {businessData.services.map((item) => (
                    <div key={item.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
                      <Avatar name={item.providerName || item.title} picture={item.providerPicture} size={40} />
                      <div className="flex-1 min-w-0">
                        <strong className="block text-xs font-bold text-slate-900 truncate">{item.title}</strong>
                        <span className="text-[11px] text-blue-700 font-medium block">{item.providerName}</span>
                        <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">{item.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                            {item.category}
                          </span>
                          <button
                            onClick={() => navigate(item.providerHandle ? `/profile/${item.providerHandle}` : '/messages')}
                            className="text-xs text-blue-700 hover:underline font-semibold ml-auto"
                          >
                            Contact
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Business Discussions */}
            {businessData.discussions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Relevant Business Discussions
                </h3>
                <div className="space-y-2">
                  {businessData.discussions.map((disc) => (
                    <div
                      key={disc.id}
                      onClick={() => navigate(`/home`)}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-400 cursor-pointer transition shadow-xs"
                    >
                      <strong className="block text-xs text-slate-900 font-bold mb-1">{disc.title || disc.content?.slice(0, 80)}</strong>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{disc.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                        <span><i className="fa-solid fa-heart mr-1" />{disc.likesCount || 0}</span>
                        <span><i className="fa-solid fa-comment mr-1" />{disc.commentsCount || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {businessData.services.length === 0 && businessData.discussions.length === 0 && (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <i className="fa-solid fa-briefcase text-3xl text-slate-300 mb-2" />
                <h4 className="text-xs font-bold text-slate-700">No active business opportunities detected yet</h4>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  Set up your business profile in Settings to receive tailored supplier, marketing, developer, and partner opportunities.
                </p>
                <button
                  onClick={() => navigate('/settings?tab=business')}
                  className="mt-3 px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 transition"
                >
                  Set Up Business Profile
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: SPONSORED / PROMOTED */}
        {!loading && !error && activeTab === 'sponsored' && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <strong className="block text-xs font-bold text-purple-900">
                  <i className="fa-solid fa-bullhorn text-purple-600 mr-1.5" />
                  Sponsored Showcase & Promoted Content
                </strong>
                <p className="text-[11px] text-purple-800">
                  Verified promotions from creators and businesses reaching interest-matched audiences.
                </p>
              </div>
              <button
                onClick={() => navigate('/ads')}
                className="px-2.5 py-1 bg-purple-700 text-white hover:bg-purple-800 rounded-lg text-xs font-semibold transition"
              >
                Create Ad
              </button>
            </div>

            {sponsoredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                openModal={openModal}
                openVideo={openVideo}
                onDismiss={(postId, reason) => handleFeedback(postId, reason)}
              />
            ))}
            {sponsoredPosts.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <i className="fa-solid fa-bullhorn text-3xl text-slate-200 mb-2" />
                <p className="text-xs">No active sponsored campaigns currently targeting this view.</p>
                <button
                  onClick={() => navigate('/ads')}
                  className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition"
                >
                  Launch a Promotion
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      </>}

      {/* Boost Modal if triggered */}
      {boostTarget && (
        <BoostModal
          targetType="post"
          targetId={boostTarget.id}
          targetTitle={boostTarget.title || boostTarget.content?.slice(0, 40)}
          onClose={() => setBoostTarget(null)}
          onSuccess={() => setBoostTarget(null)}
        />
      )}
    </div>
  );
}

function mergeLivePosts(current, incoming) {
  const currentIds = new Set(current.map((post) => String(post.id)));
  const incomingById = new Map(incoming.map((post) => [String(post.id), post]));
  const newPosts = incoming.filter((post) => !currentIds.has(String(post.id)));
  const existingPosts = current.map((post) =>
    incomingById.has(String(post.id)) ? { ...post, ...incomingById.get(String(post.id)) } : post
  );
  return [...newPosts, ...existingPosts].slice(0, 100);
}
