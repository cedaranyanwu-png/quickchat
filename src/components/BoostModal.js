import React, { useState } from 'react';
import { apiRequest } from '../api';
import { INTEREST_OPTIONS } from '../interest-options';

export default function BoostModal({ isOpen, onClose, post, profile, onBoosted }) {
  const [objective, setObjective] = useState('reach');
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [budgetPoints, setBudgetPoints] = useState(500);
  const [durationDays, setDurationDays] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const isProfileBoost = Boolean(profile && !post);

  const toggleInterest = (key) => {
    setSelectedInterests((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key].slice(0, 6)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (isProfileBoost) {
        const result = await apiRequest('/boosts/profile', {
          method: 'POST',
          body: {
            objective,
            targetInterests: selectedInterests,
            budgetPoints,
            durationDays,
          },
        });
        setSuccess('Profile boosted successfully! Your profile will be highlighted to matching members.');
        onBoosted?.(result);
      } else {
        const result = await apiRequest('/boosts/post', {
          method: 'POST',
          body: {
            postId: post.id,
            objective,
            targetInterests: selectedInterests,
            budgetPoints,
            durationDays,
          },
        });
        setSuccess('Post boosted successfully! Your post is now featured in discovery feeds.');
        onBoosted?.(result);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Could not boost item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <i className="fa-solid fa-rocket text-sm" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900">
              {isProfileBoost ? 'Boost Your Profile' : 'Boost This Post'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {post && (
          <div className="my-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <strong className="block text-slate-800 mb-1">Target Post Preview:</strong>
            <p className="line-clamp-2 italic">{post.text || 'Media post'}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700">Campaign Objective</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-600"
            >
              <option value="reach">Maximize Reach & Impressions</option>
              <option value="engagement">Drive Likes & Replies</option>
              <option value="followers">Grow Followers & Profile Visits</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Target Audience Interests (Choose up to 6)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 border border-slate-100 rounded-xl">
              {INTEREST_OPTIONS.map(([key, label]) => {
                const selected = selectedInterests.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleInterest(key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      selected
                        ? 'bg-blue-700 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {selected && <i className="fa-solid fa-check mr-1 text-[9px]" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">Budget (Points)</label>
              <select
                value={budgetPoints}
                onChange={(e) => setBudgetPoints(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-blue-600"
              >
                <option value={200}>200 Points (Starter)</option>
                <option value={500}>500 Points (Recommended)</option>
                <option value={1000}>1,000 Points (Growth)</option>
                <option value={2500}>2,500 Points (Pro)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">Duration</label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-800 outline-none focus:border-blue-600"
              >
                <option value={3}>3 Days</option>
                <option value={7}>7 Days (Standard)</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/80 p-3 text-[11px] leading-relaxed text-amber-800">
            <i className="fa-solid fa-circle-info mr-1.5" />
            Boosted items appear prominently across Home and Discover recommendations marked as <strong>Promoted</strong>. QuickChat optimizes delivery for eligible audiences, without promising guaranteed follows or sales.
          </div>

          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
          {success && <p className="text-xs text-emerald-600 font-semibold">{success}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-full bg-blue-700 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Launching Boost…' : `Confirm Boost (${budgetPoints} pts)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
