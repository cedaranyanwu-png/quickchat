import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';

const verificationFeatures = [
  { icon: 'fa-certificate', title: 'Blue Verified Badge', desc: 'Displays next to your name across your profile, posts, replies, and live streams.' },
  { icon: 'fa-arrow-trend-up', title: 'Priority Feed Reach', desc: 'Higher visibility in discovery feeds, interest recommendations, and search results.' },
  { icon: 'fa-sack-dollar', title: 'Monetization Access', desc: 'Eligible for premium paid posts, fan subscriptions, and creator payouts.' },
  { icon: 'fa-shield-halved', title: 'Impersonation Protection', desc: 'Proactive protection ensuring fans and members know it is really you.' },
  { icon: 'fa-comments', title: 'Verified Comment Highlighting', desc: 'Your comments stand out at the top of post reply threads and live events.' },
];

const DEFAULT_PLAN_POINTS = 5000;

export default function Verification() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creatorStatus, setCreatorStatus] = useState(null);
  const [creatorForm, setCreatorForm] = useState({ creatorName: '', niche: '', bio: '' });
  const [creatorSubmitting, setCreatorSubmitting] = useState(false);
  const [creatorSuccess, setCreatorSuccess] = useState('');
  const [creatorError, setCreatorError] = useState('');

  const loadProfile = () => {
    Promise.allSettled([
      apiRequest('/profile/me'),
      apiRequest('/verification/status'),
      apiRequest('/creator-studio/me'),
    ])
      .then(([profileResult, statusResult, creatorResult]) => {
        if (profileResult.status === 'fulfilled') {
          setProfile(profileResult.value.profile || null);
        } else {
          setError(profileResult.reason?.message || 'Could not load your profile.');
        }
        if (statusResult.status === 'fulfilled') {
          setStatus(statusResult.value);
          if (!statusResult.value?.verified) setSuccess('');
        }
        if (creatorResult.status === 'fulfilled') {
          setCreatorStatus(creatorResult.value);
          if (creatorResult.value.creator) setCreatorForm({ creatorName: creatorResult.value.creator.creator_name || '', niche: creatorResult.value.creator.niche || '', bio: creatorResult.value.creator.bio || '' });
        }
        setLoading(false);
      })
      .catch((requestError) => {
        setError(requestError.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleVerify = async () => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiRequest('/verification/upgrade', { method: 'POST' });
      setSuccess(result.message || 'Congratulations! Your account has been verified.');
      if (result.profile) {
        setProfile(result.profile);
      }
      if (typeof result.balance === 'number') {
        setStatus((current) => ({ ...(current || {}), verified: true, pointsBalance: result.balance }));
      } else {
        loadProfile();
      }
    } catch (err) {
      setError(err?.message || 'Verification could not be processed. Please try again.');
      // A 402 means the wallet is short — refresh the balance so the UI is honest.
      apiRequest('/verification/status')
        .then((fresh) => setStatus(fresh))
        .catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatorActivation = async (event) => {
    event.preventDefault();
    setCreatorSubmitting(true); setCreatorError(''); setCreatorSuccess('');
    try {
      const result = await apiRequest('/creator-studio/activate', { method: 'POST', body: creatorForm });
      setCreatorSuccess(result.message || 'Creator account activated. You can now open Creator Studio.');
      setCreatorStatus((current) => ({ ...(current || {}), isCreator: true, creator: { creator_name: creatorForm.creatorName, niche: creatorForm.niche, bio: creatorForm.bio, status: 'active' } }));
    } catch (err) {
      setCreatorError(err?.message || 'Creator account activation could not be completed.');
    } finally {
      setCreatorSubmitting(false);
    }
  };

  const isVerified = Boolean(profile?.verified) || Boolean(status?.verified);
  const planPoints = Number(status?.planPoints) || DEFAULT_PLAN_POINTS;
  const pointsBalance = Number(status?.pointsBalance) || 0;
  const canAfford = pointsBalance >= planPoints;
  const shortfall = Math.max(0, planPoints - pointsBalance);

  return (
    <div className="max-w-3xl mx-auto pb-24 lg:pb-12">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <Link
          to="/profile"
          aria-label="Back to profile"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          <i className="fa-solid fa-arrow-left" />
        </Link>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Account Verification</h1>
          <p className="text-xs text-slate-500">Choose standard verification or activate Creator mode</p>
        </div>
      </header>

      <div className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3" role="alert">
            <i className="fa-solid fa-circle-exclamation mt-0.5 text-base flex-shrink-0" />
            <div>
              <p className="font-bold">Verification Error</p>
              <p className="mt-0.5 text-xs">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3" role="status">
            <i className="fa-solid fa-circle-check mt-0.5 text-base flex-shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">Verified Successfully!</p>
              <p className="mt-0.5 text-xs">{success}</p>
            </div>
          </div>
        )}

        {/* Profile preview card */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            <div className="relative">
              <Avatar name={profile?.fullName} picture={profile?.picture} size={72} className="ring-4 ring-white shadow-md" />
              {isVerified && (
                <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-blue-700 text-white ring-2 ring-white shadow">
                  <i className="fa-solid fa-check text-xs" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 truncate">
                  {profile?.fullName || 'QuickChat User'}
                </h2>
                {isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                    <i className="fa-solid fa-circle-check text-blue-700" /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    Standard Account
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{profile?.handle || '@username'}</p>
              <p className="text-xs text-slate-600 mt-2 max-w-lg leading-relaxed">
                {isVerified
                  ? 'Your account is officially verified on QuickChat. The blue badge confirms your authenticity to followers and fans.'
                  : 'Get the blue verification badge to confirm your authenticity and unlock priority creator benefits across the platform.'}
              </p>
            </div>
          </div>
        </div>

        {/* Creator account activation is separate from the standard verified badge. */}
        <section className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-800 to-indigo-700 p-6 text-white">
            <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider">Creator verification</span>
            <h3 className="mt-2 text-2xl font-black">Creator Account</h3>
            <p className="mt-1 text-xs leading-5 text-white/80">Activate Creator mode to access Creator Studio and Content Studio. This is separate from purchasing the standard blue verified badge.</p>
          </div>
          <div className="p-5 sm:p-6">
            {creatorError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{creatorError}</p>}
            {creatorSuccess && <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{creatorSuccess}</p>}
            {creatorStatus?.isCreator ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-bold text-emerald-800"><i className="fa-solid fa-circle-check mr-2"/>Creator account active</p><p className="mt-1 text-xs text-slate-500">Your creator tools are ready.</p></div>
                <Link to="/creator-studio" className="rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white no-underline hover:bg-violet-800">Open Creator Studio</Link>
              </div>
            ) : (
              <form onSubmit={handleCreatorActivation} className="space-y-4">
                <p className="text-sm text-slate-600">Upgrade your existing account without creating a second account or losing your followers, posts or profile.</p>
                <label className="block text-xs font-bold text-slate-600">Creator display name<input required maxLength="100" value={creatorForm.creatorName} onChange={e=>setCreatorForm({...creatorForm,creatorName:e.target.value})} placeholder="e.g. Cedar Creates" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-violet-600"/></label>
                <label className="block text-xs font-bold text-slate-600">Main content category<select required value={creatorForm.niche} onChange={e=>setCreatorForm({...creatorForm,niche:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">Choose a category</option>{['Entertainment','Education','Technology','Lifestyle','Comedy','Music','Gaming','Beauty & Fashion','Business','News & Commentary','Art & Design','Food','Sports','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
                <label className="block text-xs font-bold text-slate-600">Creator bio<textarea maxLength="500" rows="3" value={creatorForm.bio} onChange={e=>setCreatorForm({...creatorForm,bio:e.target.value})} placeholder="Tell people what you create…" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-violet-600"/></label>
                <button disabled={creatorSubmitting} className="w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{creatorSubmitting ? 'Activating Creator mode…' : 'Activate Creator Account'}</button>
              </form>
            )}
          </div>
        </section>

        {/* Plan card */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider backdrop-blur-sm">
                  Standard account verification
                </span>
                <h3 className="mt-2 text-2xl font-black">Normal Account Verification</h3>
                <p className="mt-1 text-xs text-white/80">Get the standard blue verification badge for your QuickChat profile.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/70">One-time</p>
                <p className="text-3xl font-black">{planPoints.toLocaleString()} pts</p>
                <p className="text-[11px] text-white/70">≈ ₦{Number(status?.planPrice || 5000).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="p-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Included with verification</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {verificationFeatures.map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl bg-slate-50/80 p-3.5 border border-slate-100">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700">
                    <i className={`fa-solid ${item.icon} text-sm`} />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">{item.title}</h5>
                    <p className="text-[11px] text-slate-500 leading-4 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Action button */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  {isVerified ? 'Status: Active and verified' : 'Ready to verify your profile?'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isVerified
                    ? 'Your blue badge is displayed across all QuickChat apps and web.'
                    : 'Instant activation will apply the verified badge to your profile and posts.'}
                </p>
              </div>

              {isVerified ? (
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-5 py-2.5 text-xs font-extrabold text-emerald-700 border border-emerald-200">
                  <i className="fa-solid fa-circle-check text-sm text-emerald-600" />
                  Account Verified
                </div>
              ) : (
                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={loading || submitting || !canAfford}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-700 px-7 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {submitting ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin text-sm" />
                        Verifying Account…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-circle-check text-sm" />
                        Verify Account Now ({planPoints.toLocaleString()} pts)
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-500 sm:text-right">
                    Wallet: <strong className="text-slate-700">{pointsBalance.toLocaleString()} pts</strong>
                    {!canAfford && (
                      <> — you need {shortfall.toLocaleString()} more.{' '}
                        <Link to="/live" className="font-bold text-blue-700 hover:underline">Top up</Link>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
