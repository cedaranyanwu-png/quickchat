import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api';

const INTERESTS = [
  'Technology', 'Business', 'Entertainment', 'Music', 'Sports',
  'Fashion', 'Gaming', 'Education', 'Lifestyle', 'News',
];

const OBJECTIVES = [
  {
    key: 'followers',
    label: 'Followers',
    icon: 'fa-solid fa-user-plus',
    description: 'Promote your profile to people who are likely to follow you.',
    type: 'profile',
    min: 200,
  },
  {
    key: 'likes',
    label: 'Likes',
    icon: 'fa-solid fa-heart',
    description: 'Promote one of your posts to relevant QuickChat users.',
    type: 'post',
    min: 100,
  },
  {
    key: 'reach',
    label: 'Reach',
    icon: 'fa-solid fa-bullhorn',
    description: 'Increase discovery and visibility for one of your posts.',
    type: 'post',
    min: 100,
  },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z')).toLocaleDateString();
}

export default function AccountBooster() {
  const [objective, setObjective] = useState('followers');
  const [budget, setBudget] = useState(1000);
  const [duration, setDuration] = useState(7);
  const [interests, setInterests] = useState([]);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState('');
  const [boosts, setBoosts] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedObjective = useMemo(
    () => OBJECTIVES.find((item) => item.key === objective) || OBJECTIVES[0],
    [objective],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [boostData, walletData, postData] = await Promise.all([
        apiRequest('/boosts'),
        apiRequest('/live/wallet'),
        apiRequest('/profile/me/posts?limit=30').catch(() => ({ posts: [] })),
      ]);
      setBoosts(boostData.boosts || []);
      setBalance(Number(walletData.balance || 0));
      setPosts(postData.posts || []);
    } catch (err) {
      setError(err.message || 'Could not load Account Booster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleInterest = (interest) => {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        objective,
        targetInterests: interests,
        targetAudiences: [],
        budgetPoints: Math.max(selectedObjective.min, Number(budget) || selectedObjective.min),
        durationDays: Math.max(1, Math.min(30, Number(duration) || 7)),
      };

      if (selectedObjective.type === 'post') {
        if (!selectedPost) throw new Error('Select a post to promote.');
        payload.postId = Number(selectedPost);
        await apiRequest('/boosts/post', { method: 'POST', body: payload });
      } else {
        await apiRequest('/boosts/profile', { method: 'POST', body: payload });
      }

      setMessage('Boost campaign launched successfully.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not launch boost campaign.');
    } finally {
      setSubmitting(false);
    }
  };

  const changeObjective = (value) => {
    setObjective(value);
    const next = OBJECTIVES.find((item) => item.key === value);
    setBudget(next?.min || 100);
    setSelectedPost('');
    setMessage('');
    setError('');
  };

  return (
    <div className="mx-auto min-h-full max-w-4xl bg-slate-50 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700 text-white shadow-sm">
            <i className="fa-solid fa-rocket" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-slate-900">Account Booster</h1>
            <p className="text-xs text-slate-500">Put your profile and content in front of relevant people.</p>
          </div>
          <div className="rounded-xl bg-slate-900 px-3 py-2 text-right text-white">
            <div className="text-[10px] font-semibold text-slate-400">POINTS</div>
            <div className="text-sm font-extrabold">{balance.toLocaleString()}</div>
          </div>
        </div>
      </header>

      <main className="space-y-4 p-4 sm:p-6">
        <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-300">Promote your presence</p>
          <h2 className="mt-1 text-xl font-extrabold">Choose what you want to grow.</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
            You can create multiple campaigns. Each campaign uses your QuickChat points to distribute
            your profile or post through relevant discovery surfaces.
          </p>
        </section>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {OBJECTIVES.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => changeObjective(item.key)}
                className={`rounded-2xl border p-4 text-left transition ${objective === item.key
                  ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100'
                  : 'border-slate-200 bg-white hover:border-blue-200'}`}
              >
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${objective === item.key ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <i className={item.icon} />
                </span>
                <strong className="mt-3 block text-sm text-slate-900">{item.label}</strong>
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.description}</span>
              </button>
            ))}
          </div>

          {selectedObjective.type === 'post' && (
            <div className="mt-5">
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Post to promote</label>
              <select
                value={selectedPost}
                onChange={(event) => setSelectedPost(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs outline-none focus:border-blue-600"
              >
                <option value="">Choose one of your posts</option>
                {posts.map((post) => (
                  <option key={post.id} value={post.id}>
                    #{post.id} — {String(post.body || post.text || 'Post').slice(0, 80)}
                  </option>
                ))}
              </select>
              {!posts.length && (
                <p className="mt-2 text-[11px] text-slate-500">No posts were returned. Create a post first, then return here.</p>
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Campaign budget</span>
              <div className="relative">
                <input
                  type="number"
                  min={selectedObjective.min}
                  step="100"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 pr-20 text-sm font-bold outline-none focus:border-blue-600"
                />
                <span className="absolute right-3 top-3 text-[10px] font-bold text-slate-400">POINTS</span>
              </div>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Campaign duration</span>
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-blue-600"
              >
                {[1, 3, 7, 14, 21, 30].map((days) => <option key={days} value={days}>{days} day{days === 1 ? '' : 's'}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5">
            <div className="mb-2">
              <span className="text-xs font-bold text-slate-700">Audience interests</span>
              <p className="mt-0.5 text-[11px] text-slate-500">Optional. Choose topics your ideal audience follows.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((interest) => {
                const active = interests.includes(interest);
                return (
                  <button
                    type="button"
                    key={interest}
                    onClick={() => toggleInterest(interest)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${active
                      ? 'border-blue-700 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}
                  >
                    {active && <i className="fa-solid fa-check mr-1" />}
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
          {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{message}</div>}

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-slate-500">
              <span className="font-bold text-slate-700">{Math.max(selectedObjective.min, Number(budget) || selectedObjective.min).toLocaleString()} points</span>
              {' '}will be reserved for this campaign.
            </div>
            <button
              type="submit"
              disabled={submitting || loading}
              className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Launching…' : 'Launch Boost Campaign'}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Your campaigns</h2>
              <p className="mt-1 text-[11px] text-slate-500">Run as many campaigns as your balance and platform limits allow.</p>
            </div>
            <button type="button" onClick={load} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Refresh">
              <i className="fa-solid fa-rotate" />
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400">Loading campaigns…</div>
          ) : !boosts.length ? (
            <div className="py-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><i className="fa-solid fa-rocket" /></div>
              <p className="mt-3 text-xs font-bold text-slate-600">No campaigns yet.</p>
              <p className="mt-1 text-[11px] text-slate-400">Your active and completed promotions will appear here.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {boosts.map((boost) => (
                <div key={boost.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700">
                      <i className={boost.itemType === 'profile' ? 'fa-solid fa-user-plus' : 'fa-solid fa-bullhorn'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-xs font-extrabold text-slate-800">
                        {boost.itemType === 'profile' ? 'Follower campaign' : `${boost.objective || 'Reach'} campaign`}
                      </strong>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {Number(boost.budgetPoints || 0).toLocaleString()} points · expires {formatDate(boost.expiresAt)}
                      </span>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase ${boost.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : boost.status === 'paused'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'}`}>
                      {boost.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
