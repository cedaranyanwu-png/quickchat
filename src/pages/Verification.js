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

const DEFAULT_VERIFICATION_PRICE = 2000;

export default function Verification() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProfile = () => {
    Promise.allSettled([
      apiRequest('/profile/me'),
      apiRequest('/verification/status'),
    ])
      .then(([profileResult, statusResult]) => {
        if (profileResult.status === 'fulfilled') {
          setProfile(profileResult.value.profile || null);
        } else {
          setError(profileResult.reason?.message || 'Could not load your profile.');
        }
        if (statusResult.status === 'fulfilled') {
          setStatus(statusResult.value);
          // If nobody has bought the badge yet, drop any stale success banner.
          if (!statusResult.value?.verified) setSuccess('');
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
      const result = await apiRequest('/verification/checkout', { method: 'POST' });
      if (!result.checkoutUrl) throw new Error('Flutterwave did not return a payment link.');
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(err?.message || 'Payment could not be started. Please try again.');
      apiRequest('/verification/status').then((fresh) => setStatus(fresh)).catch(() => {});
      setSubmitting(false);
    }
  };

  const isVerified = Boolean(profile?.verified) || Boolean(status?.verified);
  const planPrice = Number(status?.planPrice) || DEFAULT_VERIFICATION_PRICE;
  const paymentStatus = String(status?.paymentStatus || 'unpaid');

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
          <p className="text-xs text-slate-500">QuickChat Creator & Authenticity Badge</p>
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

        {/* Plan card */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider backdrop-blur-sm">
                  QuickChat Premium Verification
                </span>
                <h3 className="mt-2 text-2xl font-black">Creator & Public Profile</h3>
                <p className="mt-1 text-xs text-white/80">Build immediate credibility and trust with your audience.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/70">One-time</p>
                <p className="text-3xl font-black">₦{planPrice.toLocaleString()}</p>
                <p className="text-[11px] text-white/70">One-time verification fee</p>
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
                  {isVerified ? 'Status: Active and verified' : paymentStatus === 'paid' ? 'Payment confirmed · Awaiting administrator review' : 'Ready to request verification?'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isVerified
                    ? 'Your blue badge is displayed across all QuickChat apps and web.'
                    : paymentStatus === 'paid' ? 'Your fee has been confirmed. QuickChat administration can now review and award your badge.' : 'Pay the one-time verification fee. Your badge is awarded after administrator review.'}
                </p>
              </div>

              {isVerified ? (
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-5 py-2.5 text-xs font-extrabold text-emerald-700 border border-emerald-200">
                  <i className="fa-solid fa-circle-check text-sm text-emerald-600" />
                  Account Verified
                </div>
              ) : paymentStatus === 'paid' ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-extrabold text-amber-800"><i className="fa-solid fa-clock" /> Awaiting review</div>
              ) : (
                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={loading || submitting}
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
                        Pay ₦{planPrice.toLocaleString()} verification fee
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-500 sm:text-right">Secure payment processed by Flutterwave. Badge approval is handled by QuickChat administration.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
