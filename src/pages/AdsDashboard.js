import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import { INTEREST_OPTIONS } from '../interest-options';

export default function AdsDashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // New Campaign Form
  const [form, setForm] = useState({
    campaignName: '',
    adTitle: '',
    adDescription: '',
    creativeUrl: '',
    advertisedProduct: '',
    landingPageUrl: '',
    objective: 'brand_awareness',
    targetInterests: [],
    totalBudget: 5000,
  });

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/ads/campaigns');
      setCampaigns(res.campaigns || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const viewCampaignAnalytics = async (campaign) => {
    setSelectedCampaign(campaign);
    setAnalyticsLoading(true);
    try {
      const res = await apiRequest(`/ads/campaigns/${campaign.id}`);
      setAnalytics(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const toggleCampaignStatus = async (campaignId, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await apiRequest(`/ads/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      loadCampaigns();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleInterest = (key) => {
    setForm((current) => ({
      ...current,
      targetInterests: current.targetInterests.includes(key)
        ? current.targetInterests.filter((k) => k !== key)
        : [...current.targetInterests, key].slice(0, 6),
    }));
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/ads/campaigns', {
        method: 'POST',
        body: form,
      });
      setIsCreating(false);
      setForm({
        campaignName: '',
        adTitle: '',
        adDescription: '',
        creativeUrl: '',
        advertisedProduct: '',
        landingPageUrl: '',
        objective: 'brand_awareness',
        targetInterests: [],
        totalBudget: 5000,
      });
      loadCampaigns();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-8 px-4">
      {/* Top Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 py-3 border-b border-slate-200 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Advertising & Campaign Manager</h1>
            <p className="text-xs text-slate-500">Promote your products and reach relevant QuickChat communities</p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800"
          >
            <i className="fa-solid fa-plus mr-1.5" />
            Create Campaign
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600 font-semibold">{error}</p>}

      {/* Security & Fraud Protection Alert */}
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-900 flex items-start gap-3">
        <i className="fa-solid fa-shield-halved text-base text-emerald-600 mt-0.5" />
        <div>
          <strong className="block text-emerald-950 font-bold mb-0.5">Secure Token & Fraud Protected Delivery</strong>
          <span>
            Every ad click is cryptographically signed and throttled against bot networks and duplicate clicks. You are only charged for confirmed valid unique interactions.
          </span>
        </div>
      </div>

      {/* Campaigns List */}
      {loading ? (
        <p className="p-8 text-center text-xs text-slate-500">Loading your campaigns…</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700">
            <i className="fa-solid fa-bullhorn text-xl" />
          </div>
          <h2 className="text-sm font-extrabold text-slate-900">No campaigns yet</h2>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Launch your first sponsored campaign to reach members interested in your services and products.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-4 rounded-full bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800"
          >
            Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((camp) => (
              <div key={camp.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                      camp.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {camp.status}
                    </span>
                    <h3 className="mt-1 font-bold text-sm text-slate-900">{camp.name}</h3>
                    <p className="text-xs text-slate-500">{camp.title}</p>
                  </div>
                  <button
                    onClick={() => toggleCampaignStatus(camp.id, camp.status)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {camp.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-y border-slate-100 py-2.5 text-center">
                  <div>
                    <span className="block text-xs font-extrabold text-slate-900">{camp.impressions}</span>
                    <span className="block text-[10px] text-slate-500">Impressions</span>
                  </div>
                  <div>
                    <span className="block text-xs font-extrabold text-slate-900">{camp.clicks}</span>
                    <span className="block text-[10px] text-slate-500">Clicks ({camp.ctr})</span>
                  </div>
                  <div>
                    <span className="block text-xs font-extrabold text-blue-700">₦{camp.spentAmount.toLocaleString()}</span>
                    <span className="block text-[10px] text-slate-500">Spent / ₦{camp.totalBudget.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400">Objective: {camp.objective.replace('_', ' ')}</span>
                  <button
                    onClick={() => viewCampaignAnalytics(camp)}
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    View Analytics →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setSelectedCampaign(null)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-900">Campaign Performance & Analytics</h2>
              <button onClick={() => setSelectedCampaign(null)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            {analyticsLoading || !analytics ? (
              <p className="p-8 text-center text-xs text-slate-500">Calculating real-time analytics…</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{analytics.campaign?.title}</h3>
                  <p className="text-xs text-slate-500">Landing URL: {analytics.campaign?.landingPageUrl}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                    <span className="block text-base font-extrabold text-slate-900">{analytics.performance?.impressions}</span>
                    <span className="text-[10px] text-slate-500">Impressions</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                    <span className="block text-base font-extrabold text-slate-900">{analytics.performance?.validClicks}</span>
                    <span className="text-[10px] text-slate-500">Valid Clicks</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                    <span className="block text-base font-extrabold text-blue-700">{analytics.performance?.ctr}</span>
                    <span className="text-[10px] text-slate-500">Click-Through</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                    <span className="block text-base font-extrabold text-slate-900">{analytics.performance?.conversions}</span>
                    <span className="text-[10px] text-slate-500">Conversions</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Cost per valid click (CPC):</span>
                    <strong className="text-slate-900">{analytics.performance?.cpc}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Effective cost per 1000 impressions (CPM):</span>
                    <strong className="text-slate-900">{analytics.performance?.cpm}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Fraud & duplicate clicks blocked:</span>
                    <strong className="text-emerald-700">{analytics.performance?.invalidClicks}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900">
                    <span>Remaining Budget:</span>
                    <span>₦{analytics.campaign?.remainingBudget?.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSelectedCampaign(null)}
                    className="rounded-full bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setIsCreating(false)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-900">Create Advertisement Campaign</h2>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Campaign Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Summer Website Special"
                  value={form.campaignName}
                  onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700">Ad Headline / Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Modern Websites for Small Businesses"
                  value={form.adTitle}
                  onChange={(e) => setForm({ ...form, adTitle: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700">Ad Description / Body</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe your offer, product benefits, and value proposition."
                  value={form.adDescription}
                  onChange={(e) => setForm({ ...form, adDescription: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700">Landing Page Destination URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://yourwebsite.com/landing"
                  value={form.landingPageUrl}
                  onChange={(e) => setForm({ ...form, landingPageUrl: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700">Creative Image URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://example.com/banner.png"
                  value={form.creativeUrl}
                  onChange={(e) => setForm({ ...form, creativeUrl: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Campaign Objective</label>
                  <select
                    value={form.objective}
                    onChange={(e) => setForm({ ...form, objective: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2 outline-none"
                  >
                    <option value="brand_awareness">Brand Awareness</option>
                    <option value="website_visits">Website Visits</option>
                    <option value="product_promotion">Product Promotion</option>
                    <option value="lead_generation">Lead Generation</option>
                    <option value="conversions">Sales / Conversions</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Total Budget (NGN)</label>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={form.totalBudget}
                    onChange={(e) => setForm({ ...form, totalBudget: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Interests</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 border border-slate-100 rounded-xl">
                  {INTEREST_OPTIONS.map(([key, label]) => {
                    const sel = form.targetInterests.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleInterest(key)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          sel ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 rounded-full border border-slate-200 py-2.5 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-blue-700 py-2.5 font-bold text-white hover:bg-blue-800"
                >
                  Launch Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
