import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import { INTEREST_OPTIONS } from '../interest-options';

const DEFAULT_PREFERENCES = {
  personalized_ads: true,
  ad_frequency: 'standard',
  business_mode: false,
  opportunity_notifications: true,
  recommendation_onboarding_complete: false,
};

export default function RecommendationOnboarding({ open, onClose }) {
  const [interests, setInterests] = useState([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      apiRequest('/profile/me'),
      apiRequest('/recommendations/assistant'),
    ]).then(([profileResult, recResult]) => {
      if (!active) return;
      const currentInterests = profileResult.profile?.interests;
      setInterests(Array.isArray(currentInterests) ? currentInterests : []);
      setPreferences((current) => ({ ...current, ...(recResult.preferences || {}) }));
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'Could not load recommendation setup.');
    });
    return () => { active = false; };
  }, [open]);

  if (!open) return null;

  const toggleInterest = (key) => {
    setInterests((current) => current.includes(key)
      ? current.filter((interest) => interest !== key)
      : [...current, ...((current.length < 8) ? [key] : [])]);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await apiRequest('/profile/me', { method: 'PATCH', body: { interests } });
      const updatedPreferences = { ...preferences, recommendation_onboarding_complete: true };
      const result = await apiRequest('/recommendations/preferences', { method: 'PATCH', body: updatedPreferences });
      setPreferences((current) => ({ ...current, ...(result.preferences || updatedPreferences) }));
      setSaved(true);
      window.setTimeout(() => onClose?.(), 900);
    } catch (requestError) {
      setError(requestError.message || 'Could not save your recommendation setup.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recommendation-setup-title" onClick={onClose}>
    <form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700"><i className="fa-solid fa-wand-magic-sparkles" /> Personalize your algorithm</span>
          <h2 id="recommendation-setup-title" className="mt-3 text-lg font-extrabold text-slate-900">Set up your recommendations</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Choose topics and controls to help QuickChat rank your feed. You can change these settings later.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close recommendation setup" className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-xmark" /></button>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-bold text-slate-800">Topics you want to see <span className="font-normal text-slate-500">(choose up to 8)</span></legend>
        <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {INTEREST_OPTIONS.map(([key, label]) => {
            const selected = interests.includes(key);
            return <button key={key} type="button" aria-pressed={selected} onClick={() => toggleInterest(key)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${selected ? 'bg-blue-700 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>;
          })}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs">
          <span><strong className="block text-slate-800">Personalized sponsored posts</strong><small className="mt-1 block text-slate-500">Use your interests to select relevant promotions.</small></span>
          <input type="checkbox" checked={preferences.personalized_ads !== false} onChange={(event) => setPreferences((current) => ({ ...current, personalized_ads: event.target.checked }))} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs">
          <span><strong className="block text-slate-800">Business discovery</strong><small className="mt-1 block text-slate-500">Include relevant business opportunities.</small></span>
          <input type="checkbox" checked={Boolean(preferences.business_mode)} onChange={(event) => setPreferences((current) => ({ ...current, business_mode: event.target.checked }))} />
        </label>
      </div>

      <label className="mt-3 block text-xs font-bold text-slate-800">Sponsored post frequency
        <select value={preferences.ad_frequency || 'standard'} onChange={(event) => setPreferences((current) => ({ ...current, ad_frequency: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal">
          <option value="low">Low</option>
          <option value="standard">Standard</option>
          <option value="high">High</option>
        </select>
      </label>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {saved && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Your recommendation setup is saved.</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Do this later</button>
        <button type="submit" disabled={saving} className="rounded-full bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save setup'}</button>
      </div>
    </form>
  </div>;
}
