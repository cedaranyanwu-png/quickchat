import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import { INTEREST_OPTIONS } from '../interest-options';

export default function RecommendationAssistant({ openModal, openVideo }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'business' | 'preferences'
  const [prefs, setPrefs] = useState({
    personalized_ads: true,
    ad_frequency: 'standard',
    business_mode: false,
    opportunity_notifications: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/recommendations/assistant');
      setData(result);
      if (result?.preferences) {
        setPrefs((current) => ({ ...current, ...result.preferences }));
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load recommendation bot data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFeedback = async (itemType, itemId, action) => {
    try {
      await apiRequest('/recommendations/feedback', {
        method: 'POST',
        body: { itemType, itemId, action },
      });
      setFeedbackNotice(action === 'show_more' ? 'Got it! Showing more similar recommendations.' : 'Got it! We tuned down similar recommendations.');
      setTimeout(() => setFeedbackNotice(''), 3000);
      loadData();
    } catch (_err) {}
  };

  const savePreferences = async (newPrefs) => {
    setSavingPrefs(true);
    try {
      const res = await apiRequest('/recommendations/preferences', {
        method: 'PATCH',
        body: newPrefs,
      });
      setPrefs(res.preferences);
      setFeedbackNotice('Preferences updated successfully.');
      setTimeout(() => setFeedbackNotice(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Connecting to your recommendation assistant…</div>;
  }

  const bot = data?.botProfile || {};
  const bizOpp = data?.businessOpportunities || {};

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white shadow-md">
              <i className="fa-solid fa-robot text-base" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">My Recommendation Assistant</h1>
              <p className="text-xs text-slate-500">Your personalized discovery profile and intelligence engine</p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="Refresh recommendations"
          >
            <i className="fa-solid fa-rotate-right text-xs" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              activeTab === 'personal' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <i className="fa-solid fa-compass mr-1.5" />
            Personal Discovery
          </button>
          <button
            onClick={() => setActiveTab('business')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              activeTab === 'business' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <i className="fa-solid fa-briefcase mr-1.5" />
            Business & Opportunities
            {bizOpp?.businessProfile && <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.2 text-[9px] text-white">Active</span>}
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              activeTab === 'preferences' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <i className="fa-solid fa-sliders mr-1.5" />
            Preferences & Controls
          </button>
        </div>
      </div>

      {feedbackNotice && (
        <div className="mx-4 mt-3 rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs font-bold text-blue-700 flex items-center gap-2">
          <i className="fa-solid fa-circle-check" />
          {feedbackNotice}
        </div>
      )}

      {error && <p className="m-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 font-semibold">{error}</p>}

      {/* Bot Learning Summary Card */}
      <div className="p-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-900 to-indigo-900 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Bot Profile Active
              </span>
              <h2 className="mt-1 text-base font-extrabold">{bot.ownerName}'s Recommendation Bot</h2>
              <p className="mt-0.5 text-xs text-slate-300">
                Tracking {bot.totalTrackedInterests || 0} interests with {bot.learnedPreferencesCount || 0} learned behavioral signals
              </p>
            </div>
            <Link
              to="/profile/edit"
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
            >
              Edit Interests
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {(bot.topInterests || []).map((interest) => (
              <span
                key={interest}
                className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium text-white"
              >
                #{INTEREST_OPTIONS.find(([k]) => k === interest)?.[1] || interest}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 1: PERSONAL DISCOVERY */}
      {activeTab === 'personal' && (
        <div className="space-y-6 px-4">
          {/* Suggested People */}
          {data?.suggestedPeople?.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-slate-900">Recommended People to Follow</h3>
                <span className="text-xs text-slate-500">Based on your topics</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {data.suggestedPeople.map((person) => (
                  <div key={person.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <button
                      onClick={() => navigate(`/profile/${person.username}`)}
                      className="flex items-center gap-2.5 min-w-0 text-left border-0 bg-transparent p-0"
                    >
                      <Avatar name={person.name} picture={person.picture} size={40} />
                      <div className="min-w-0">
                        <strong className="block truncate text-xs text-slate-900">{person.name}</strong>
                        <span className="block truncate text-[10px] text-slate-500">{person.handle}</span>
                        <span className="block truncate text-[10px] text-blue-600 font-medium">{person.matchReason}</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleFeedback('person', person.id, 'show_more')}
                        title="Show more people like this"
                        className="rounded-full p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <i className="fa-regular fa-thumbs-up text-xs" />
                      </button>
                      <button
                        onClick={() => handleFeedback('person', person.id, 'not_interested')}
                        title="Not interested"
                        className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <i className="fa-solid fa-xmark text-xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Suggested Communities */}
          {data?.suggestedCommunities?.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-extrabold text-slate-900">Recommended Communities</h3>
                <Link to="/communities" className="text-xs font-bold text-blue-700 hover:underline">See all</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {data.suggestedCommunities.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="min-w-0 pr-2">
                      <Link to={`/communities/${c.id}`} className="block truncate text-xs font-bold text-slate-900 hover:underline">
                        {c.name}
                      </Link>
                      <p className="line-clamp-1 text-[10px] text-slate-500">{c.description || 'Community discussion'}</p>
                      <span className="text-[10px] text-slate-400">{c.members} members · {c.category || 'Topic'}</span>
                    </div>
                    <Link
                      to={`/communities/${c.id}`}
                      className="rounded-full border border-blue-600 px-3 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Suggested Posts */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-extrabold text-slate-900">Top Content Recommended for You</h3>
              <span className="text-xs text-slate-500">Evaluated by your bot</span>
            </div>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              {data?.suggestedPosts?.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">Select interests to start receiving personalized recommendations.</p>
              ) : (
                data?.suggestedPosts?.map((post) => (
                  <PostCard
                    key={post.id || post.campaignId}
                    post={post}
                    openModal={openModal}
                    openVideo={openVideo}
                    onDismiss={loadData}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: BUSINESS & OPPORTUNITIES */}
      {activeTab === 'business' && (
        <div className="space-y-6 px-4">
          {!bizOpp?.businessProfile ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blue-100 text-blue-700">
                <i className="fa-solid fa-briefcase text-xl" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">No Business Profile Connected Yet</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600 leading-relaxed">
                Connect your business or startup in Settings to unlock business-aware recommendations: developers, packaging designers, suppliers, B2B discussions, and marketing opportunities tailored to your goals.
              </p>
              <Link
                to="/settings"
                className="mt-4 inline-block rounded-full bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800"
              >
                Set Up Business Profile
              </Link>
            </div>
          ) : (
            <>
              {/* Business Header Banner */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-800">
                      {bizOpp.businessProfile.businessStage} Stage
                    </span>
                    <h3 className="mt-1 text-base font-extrabold text-slate-900">{bizOpp.businessProfile.businessName}</h3>
                    <p className="text-xs text-slate-500">Category: {bizOpp.businessProfile.businessCategory}</p>
                  </div>
                  <Link to="/settings" className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    Edit Business
                  </Link>
                </div>
                {bizOpp.businessProfile.productsServices && (
                  <p className="mt-2 text-xs text-slate-600 italic">"{bizOpp.businessProfile.productsServices}"</p>
                )}
              </div>

              {/* Matched Service Providers */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Recommended Services & Professionals</h3>
                    <p className="text-[11px] text-slate-500">Matched with your business assistance goals</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(bizOpp.serviceProviders || []).map((provider) => (
                    <div key={provider.id} className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Avatar name={provider.name} picture={provider.picture} size={40} />
                        <div className="min-w-0">
                          <strong className="block truncate text-xs text-slate-900">{provider.name}</strong>
                          <span className="block text-[10px] text-slate-500">{provider.handle}</span>
                          <span className="mt-0.5 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                            {provider.serviceType}
                          </span>
                          {provider.bio && <p className="mt-1 line-clamp-2 text-[10px] text-slate-600 leading-3.5">{provider.bio}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/profile/${provider.username}`)}
                        className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800 whitespace-nowrap ml-2"
                      >
                        Contact
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Matched Business Discussions */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-extrabold text-slate-900">Relevant Discussions & Opportunities</h3>
                  <span className="text-xs text-slate-500">Trending in your industry</span>
                </div>
                <div className="space-y-2">
                  {(bizOpp.discussions || []).map((disc) => (
                    <div key={disc.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{disc.authorName}</span>
                        <span className="text-[10px] text-slate-400">{disc.category || 'Business'}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700">{disc.body}</p>
                      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
                        <span><i className="fa-regular fa-heart mr-1" />{disc.likes}</span>
                        <span><i className="fa-regular fa-comment mr-1" />{disc.replies}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* TAB 3: PREFERENCES & CONTROLS */}
      {activeTab === 'preferences' && (
        <div className="space-y-4 px-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">Sponsored Content & Ad Controls</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              QuickChat recommendation bots respect your privacy. We never share your personal identity or private data with advertisers.
            </p>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <span className="block text-xs font-bold text-slate-800">Personalized Sponsored Content</span>
                <span className="block text-[11px] text-slate-500">
                  Allow your recommendation bot to select relevant sponsored products matching your declared interests.
                </span>
              </div>
              <input
                type="checkbox"
                checked={prefs.personalized_ads}
                disabled={savingPrefs}
                onChange={(e) => savePreferences({ personalized_ads: e.target.checked })}
                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <span className="block text-xs font-bold text-slate-800">Ad Frequency Capping</span>
                <span className="block text-[11px] text-slate-500">
                  Controls the maximum ratio of sponsored discovery items in your feeds.
                </span>
              </div>
              <select
                value={prefs.ad_frequency}
                disabled={savingPrefs}
                onChange={(e) => savePreferences({ ad_frequency: e.target.value })}
                className="rounded-lg border border-slate-200 p-1.5 text-xs text-slate-800 outline-none"
              >
                <option value="low">Low (1 per 8 posts)</option>
                <option value="standard">Standard (1 per 5 posts)</option>
                <option value="high">High (1 per 3 posts)</option>
              </select>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <span className="block text-xs font-bold text-slate-800">Business Opportunity Updates</span>
                <span className="block text-[11px] text-slate-500">
                  Receive recommendations when a matching supplier or developer becomes available.
                </span>
              </div>
              <input
                type="checkbox"
                checked={prefs.opportunity_notifications}
                disabled={savingPrefs}
                onChange={(e) => savePreferences({ opportunity_notifications: e.target.checked })}
                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 mb-1">Reset Recommendation Weights</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Clears learned feedback history (hidden posts, show more votes) and recalculates your feed strictly from profile interests.
            </p>
            <button
              onClick={() => handleFeedback('all', 'reset', 'reset')}
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Reset Learning Profile
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
