import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';
import { disablePush, enablePush, getPushStatus, pushSupported, sendTestPush } from '../push';
import PWAInstallCard from '../components/PWAInstallCard';

const BUSINESS_CATEGORIES = [
  'Bakery & Food Production',
  'Restaurant & Catering',
  'Retail & E-commerce',
  'Technology & Software',
  'Digital Marketing & Media',
  'Creative Agency & Design',
  'Healthcare & Wellness',
  'Fashion & Apparel',
  'Education & Training',
  'Professional & Legal Services',
  'Real Estate & Construction',
  'Entertainment & Events',
  'Other',
];

const ASSISTANCE_OPTIONS = [
  'Website Developers',
  'Packaging Designers',
  'Digital Marketers',
  'Food & Raw Material Suppliers',
  'Branding & Logo Designers',
  'Business Management Software',
  'Legal & Contract Services',
  'Accounting & Tax Advisors',
  'Sales & Lead Generation',
  'Logistics & Courier Delivery',
];

export default function Settings({ onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'general');

  const [profile, setProfile] = useState(null);
  const [payments, setPayments] = useState(null);
  const [banks, setBanks] = useState([]);
  const [fanPassPrice, setFanPassPrice] = useState('3000.00');
  const [chatMonetization, setChatMonetization] = useState({ enabled: false, pricePoints: 100 });
  const [chatSettingsBusy, setChatSettingsBusy] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [payoutMobile, setPayoutMobile] = useState('');
  const [resolvedAccountName, setResolvedAccountName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Business Profile State
  const [businessProfile, setBusinessProfile] = useState({
    enabled: false,
    businessName: '',
    category: '',
    productsServices: '',
    stage: 'Growing',
    goals: '',
    targetCustomers: '',
    assistanceNeeded: [],
    website: '',
    phone: '',
    location: '',
  });
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessMessage, setBusinessMessage] = useState('');
  const [businessError, setBusinessError] = useState('');

  // Recommendation Preferences State
  const [recPrefs, setRecPrefs] = useState({
    personalizedFeed: true,
    businessDiscovery: true,
    sponsoredAds: true,
    frequencyCap: 5,
  });
  const [recSaving, setRecSaving] = useState(false);
  const [recMessage, setRecMessage] = useState('');
  const [recError, setRecError] = useState('');

  // Push Notifications State
  const [pushState, setPushState] = useState({ supported: pushSupported(), permission: 'default', subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushError, setPushError] = useState('');

  useEffect(() => {
    if (searchParams.get('tab')) {
      setActiveTab(searchParams.get('tab'));
    }
  }, [searchParams]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params);
    setMessage('');
    setError('');
  };

  useEffect(() => {
    if (!pushSupported()) return undefined;
    getPushStatus().then(setPushState).catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    apiRequest('/profile/me').then(({ profile: saved }) => {
      setProfile(saved);
      if (saved.creatorMembershipPrice) setFanPassPrice(saved.creatorMembershipPrice);
      if (saved.recommendationPreferences) {
        setRecPrefs((prev) => ({ ...prev, ...saved.recommendationPreferences }));
      }
      if (saved.businessEnabled) {
        setBusinessProfile((prev) => ({ ...prev, enabled: true }));
      }
    }).catch((requestError) => setError(requestError.message));

    apiRequest('/messages/monetization').then((data) => setChatMonetization({ enabled: Boolean(data.enabled), pricePoints: Number(data.pricePoints || 100) })).catch(() => {});

    apiRequest('/payments/me').then((data) => {
      setPayments(data);
      if (data.creatorMembership?.price) setFanPassPrice(data.creatorMembership.price);
      if (data.gatewayConfigured) {
        apiRequest('/payments/banks').then(({ banks: availableBanks = [] }) => {
          setBanks(availableBanks);
          if (availableBanks.length) setBankCode((current) => current || availableBanks[0].code);
        }).catch((requestError) => setError(requestError.message));
      }
    }).catch(() => setPayments(null));

    // Load Business Profile
    apiRequest('/business/profile').then((res) => {
      if (res?.profile) {
        setBusinessProfile({
          enabled: Boolean(res.profile.enabled),
          businessName: res.profile.businessName || '',
          category: res.profile.category || '',
          productsServices: res.profile.productsServices || '',
          stage: res.profile.stage || 'Growing',
          goals: res.profile.goals || '',
          targetCustomers: res.profile.targetCustomers || '',
          assistanceNeeded: Array.isArray(res.profile.assistanceNeeded) ? res.profile.assistanceNeeded : [],
          website: res.profile.website || '',
          phone: res.profile.phone || '',
          location: res.profile.location || '',
        });
      }
    }).catch(() => {});
  }, []);

  const resolveBankAccount = async () => {
    setBusy(true); setMessage(''); setError(''); setResolvedAccountName('');
    try {
      const result = await apiRequest('/payments/resolve-bank-account', {
        method: 'POST', body: { bankCode, accountNumber },
      });
      setResolvedAccountName(result.accountName);
      setMessage('Check the account holder name, then confirm it to save this payout account.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const savePayoutAccount = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await apiRequest('/payments/payout-account', {
        method: 'POST',
        body: { bankCode, accountNumber, mobile: payoutMobile, confirmedAccountName: resolvedAccountName },
      });
      setPayments((current) => ({ ...current, payoutAccount: result.payoutAccount }));
      setAccountNumber('');
      setResolvedAccountName('');
      setMessage('Your Flutterwave payout account is connected.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const saveChatMonetization = async () => {
    setChatSettingsBusy(true); setMessage(''); setError('');
    try {
      const result = await apiRequest('/messages/monetization', { method: 'PATCH', body: chatMonetization });
      setChatMonetization({ enabled: Boolean(result.enabled), pricePoints: Number(result.pricePoints || 100) });
      setMessage(result.enabled ? 'Paid chat is enabled. New conversations can unlock your inbox using points.' : 'Paid chat is disabled.');
    } catch (requestError) { setError(requestError.message); }
    finally { setChatSettingsBusy(false); }
  };

  const saveFanPass = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await apiRequest('/payments/creator-membership', { method: 'PATCH', body: { price: fanPassPrice || '3000.00' } });
      setPayments((current) => ({ ...current, creatorMembership: result.creatorMembership }));
      setMessage('Your 30-day fan pass is saved. Fans renew manually after 30 days.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const disableFanPass = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await apiRequest('/payments/creator-membership', { method: 'PATCH', body: { enabled: false } });
      setPayments((current) => ({ ...current, creatorMembership: result.creatorMembership }));
      setMessage('New fan passes are off. Existing passes remain active until they expire.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const saveBusinessProfile = async (e) => {
    e.preventDefault();
    setBusinessSaving(true);
    setBusinessMessage('');
    setBusinessError('');
    try {
      await apiRequest('/business/profile', {
        method: 'POST',
        body: businessProfile,
      });
      setBusinessMessage('Business profile updated successfully! The recommendation engine will now match opportunities based on your declared needs.');
    } catch (err) {
      setBusinessError(err.message || 'Failed to update business profile');
    } finally {
      setBusinessSaving(false);
    }
  };

  const toggleAssistance = (item) => {
    setBusinessProfile((prev) => ({
      ...prev,
      assistanceNeeded: prev.assistanceNeeded.includes(item)
        ? prev.assistanceNeeded.filter((i) => i !== item)
        : [...prev.assistanceNeeded, item],
    }));
  };

  const saveRecPreferences = async (e) => {
    e.preventDefault();
    setRecSaving(true);
    setRecMessage('');
    setRecError('');
    try {
      await apiRequest('/recommendations/preferences', {
        method: 'PATCH',
        body: recPrefs,
      });
      setRecMessage('Recommendation bot preferences updated successfully.');
    } catch (err) {
      setRecError(err.message || 'Failed to update recommendation preferences');
    } finally {
      setRecSaving(false);
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushError('');
    setPushMessage('');
    try {
      if (pushState.subscribed) {
        await disablePush();
        setPushMessage('Push notifications are off for this browser.');
      } else {
        await enablePush();
        setPushMessage('Push notifications are on. Messages, replies, and live streams will alert you here.');
      }
      setPushState(await getPushStatus());
    } catch (pushFailure) {
      setPushError(pushFailure.message);
      setPushState(await getPushStatus().catch(() => ({ ...pushState, subscribed: false })));
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    setPushError('');
    setPushMessage('');
    try {
      await sendTestPush();
      setPushMessage('Test notification sent. Check your system notifications.');
    } catch (pushFailure) {
      setPushError(pushFailure.message);
    } finally {
      setPushBusy(false);
    }
  };

  const payoutReady = Boolean(payments?.payoutAccount?.ready);
  const canStartPayments = Boolean(payments?.gatewayConfigured && payments?.publicUrlConfigured && payments?.webhookUrlConfigured);

  return (
    <div className="mx-auto min-h-full max-w-3xl bg-white pb-24 lg:pb-12">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <Link to="/home" aria-label="Back to Home" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
          <i className="fa-solid fa-arrow-left" />
        </Link>
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Settings</h1>
          <p className="text-[11px] text-slate-500">Account, business profiles, bots, and preferences</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/profile/edit" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <i className="fa-solid fa-user-pen mr-1.5" />Edit profile
          </Link>
          <button
            type="button"
            onClick={() => {
              onLogout?.();
              localStorage.removeItem('token');
              localStorage.removeItem('user');
            }}
            className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            <i className="fa-solid fa-right-from-bracket mr-1.5" />Log out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-4 bg-slate-50/50 overflow-x-auto no-scrollbar">
        {[
          { id: 'general', label: 'Payouts & Membership', icon: 'fa-solid fa-wallet' },
          { id: 'chat', label: 'Paid Chat', icon: 'fa-solid fa-comments-dollar' },
          { id: 'business', label: 'Business Profile', icon: 'fa-solid fa-briefcase' },
          { id: 'recommendations', label: 'Recommendation Bot', icon: 'fa-solid fa-wand-magic-sparkles' },
          { id: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' },
          { id: 'app', label: 'QuickChat App', icon: 'fa-solid fa-mobile-screen-button' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: GENERAL & PAYOUTS */}
      {activeTab === 'general' && (
        <section className="m-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <i className="fa-solid fa-wallet" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Payouts and paid content</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Flutterwave routes 90% of each successful payment to your bank account. QuickChat keeps 10%; Flutterwave processing charges may also apply.
              </p>
            </div>
          </div>

          {profile?.isAutomated ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Automated accounts cannot sell paid posts, communities, or fan passes.</p>
          ) : (
            <>
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Flutterwave payout account</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{payoutReady ? 'Your Nigerian bank account can receive creator payouts.' : 'Connect a Nigerian bank account to receive your creator share.'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${payoutReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {payoutReady ? 'Connected' : 'Not set up'}
                  </span>
                </div>
                {payoutReady ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <p className="font-bold">{payments.payoutAccount.accountName}</p>
                    <p className="mt-1 text-slate-500">{payments.payoutAccount.bankName} · {payments.payoutAccount.accountMasked}</p>
                  </div>
                ) : canStartPayments && (
                  <>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-bold text-slate-700">Nigerian bank
                        <select value={bankCode} onChange={(event) => { setBankCode(event.target.value); setResolvedAccountName(''); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600">
                          <option value="">Choose a bank</option>
                          {banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-slate-700">10-digit account number
                        <input autoComplete="off" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(event) => { setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 10)); setResolvedAccountName(''); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600" placeholder="0123456789" />
                      </label>
                      <label className="block text-xs font-bold text-slate-700 sm:col-span-2">Phone number for payout account
                        <input autoComplete="tel" value={payoutMobile} onChange={(event) => setPayoutMobile(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600" placeholder="+234…" />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy || !bankCode || accountNumber.length !== 10} onClick={resolveBankAccount} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                        {busy ? 'Checking…' : 'Verify account'}
                      </button>
                      {resolvedAccountName && (
                        <button type="button" disabled={busy || !payoutMobile.trim()} onClick={savePayoutAccount} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                          Confirm name and connect
                        </button>
                      )}
                    </div>
                    {resolvedAccountName && (
                      <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Account holder: <strong>{resolvedAccountName}</strong>. Confirm this is your account before connecting it.</p>
                    )}
                    <p className="mt-2 text-[11px] leading-4 text-slate-500">Flutterwave verifies the account name before it is saved. Only the bank, account name, and masked number are stored by QuickChat.</p>
                  </>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-bold text-slate-800">Fans-only posts</h3>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">Set a 30-day access pass. The default is ₦3,000. Fans renew manually after each one-time NGN checkout.</p>
                <label className="mt-3 block max-w-xs text-xs font-bold text-slate-700">30-day fan pass price
                  <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white">
                    <span className="px-3 text-sm font-bold text-slate-500">₦</span>
                    <input type="number" min="3000" max="1000000" step="0.01" inputMode="decimal" value={fanPassPrice} onChange={(event) => setFanPassPrice(event.target.value)} className="min-w-0 flex-1 rounded-r-lg border-0 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100" />
                  </div>
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !payoutReady || !canStartPayments} onClick={saveFanPass} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {payments?.creatorMembership ? 'Update fan pass' : 'Enable paid fans'}
                  </button>
                  {payments?.creatorMembership && (
                    <button type="button" disabled={busy} onClick={disableFanPass} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Turn off new passes</button>
                  )}
                </div>
                {payments?.creatorMembership && (
                  <p className="mt-2 text-xs text-emerald-700"><i className="fa-solid fa-circle-check mr-1" />Your fan pass is active at ₦{Number(payments.creatorMembership.price).toLocaleString('en-NG')} per 30 days.</p>
                )}
              </div>
              {payments?.earnings?.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold text-slate-800">Recorded earnings</h3>
                  <div className="mt-2 space-y-1">
                    {payments.earnings.map((earning) => (
                      <p key={earning.currency} className="text-xs text-slate-600">{earning.currency} {earning.creatorShare} creator share · {earning.currency} {earning.platformFee} platform fee</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {payments && !canStartPayments && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">Add {payments.missingConfig?.join(', ') || 'the Flutterwave payment settings'} to <code>server/.env</code>, then restart the API.</p>}
          {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
          {message && <p role="status" className="mt-3 text-xs text-slate-600">{message}</p>}
        </section>
      )}

      {/* PAID CHAT SETTINGS */}
      {activeTab === 'chat' && (
        <section className="m-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className="fa-solid fa-comments-dollar" /></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Monetize your inbox</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Choose whether new people must unlock a conversation with points before they can send you their first message. Replies in an unlocked conversation stay free.</p>
            </div>
          </div>
          <label className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span><strong className="block text-xs text-slate-800">Enable paid chat</strong><span className="text-[11px] text-slate-500">Existing unlocked conversations remain accessible.</span></span>
            <input type="checkbox" checked={chatMonetization.enabled} onChange={(event) => setChatMonetization((value) => ({ ...value, enabled: event.target.checked }))} className="h-4 w-4 rounded text-blue-700" />
          </label>
          <label className="mt-3 block max-w-xs text-xs font-bold text-slate-700">Price per conversation unlock
            <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white">
              <i className="fa-solid fa-coins px-3 text-amber-500" />
              <input type="number" min="1" max="100000" step="1" inputMode="numeric" value={chatMonetization.pricePoints} onChange={(event) => setChatMonetization((value) => ({ ...value, pricePoints: event.target.value }))} className="min-w-0 flex-1 rounded-r-lg border-0 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </label>
          <p className="mt-2 text-[11px] text-slate-500">At the current top-up rate, 1,000 points cost ₦100. Points earned from paid chat are credited to your QuickChat wallet.</p>
          {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
          {message && <p role="status" className="mt-3 text-xs text-emerald-700">{message}</p>}
          <button type="button" onClick={saveChatMonetization} disabled={chatSettingsBusy || (chatMonetization.enabled && (!Number.isInteger(Number(chatMonetization.pricePoints)) || Number(chatMonetization.pricePoints) < 1 || Number(chatMonetization.pricePoints) > 100000))} className="mt-4 rounded-full bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">{chatSettingsBusy ? 'Saving…' : 'Save chat settings'}</button>
        </section>
      )}

      {/* TAB 2: BUSINESS PROFILE */}
      {activeTab === 'business' && (
        <form onSubmit={saveBusinessProfile} className="m-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <i className="fa-solid fa-briefcase" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Business Profile & Needs</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Connect your business or venture so the recommendation engine can discover relevant services, developers, suppliers, and opportunities.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-bold text-slate-700">Business Mode</span>
                <input
                  type="checkbox"
                  checked={businessProfile.enabled}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Business Name</span>
                  <input
                    value={businessProfile.businessName}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, businessName: e.target.value })}
                    placeholder="e.g. John's Artisan Bakery"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Business Category</span>
                  <select
                    value={businessProfile.category}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600 bg-white"
                  >
                    <option value="">Select industry category</option>
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Business Stage</span>
                  <select
                    value={businessProfile.stage}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, stage: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600 bg-white"
                  >
                    <option value="Idea">Idea / Planning</option>
                    <option value="Startup">Startup / Early Stage</option>
                    <option value="Growing">Growing / Scaling</option>
                    <option value="Established">Established Business</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Target Customers</span>
                  <input
                    value={businessProfile.targetCustomers}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, targetCustomers: e.target.value })}
                    placeholder="e.g. Local neighborhood food lovers, B2B cafes"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">Products & Services Offered</span>
                <textarea
                  rows="2"
                  value={businessProfile.productsServices}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, productsServices: e.target.value })}
                  placeholder="e.g. Sourdough bread, artisan pastries, catering for corporate events..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">Business Goals</span>
                <input
                  value={businessProfile.goals}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, goals: e.target.value })}
                  placeholder="e.g. Expand online orders, find reliable packaging suppliers, hire web developer"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </label>

              {/* Areas where business needs assistance */}
              <div className="pt-2">
                <span className="block text-xs font-bold text-slate-700 mb-1.5">
                  Areas Where Your Business Needs Assistance
                </span>
                <p className="text-[11px] text-slate-500 mb-2">
                  Select the services you could benefit from. Your recommendation bot will suggest verified providers and relevant discussions.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ASSISTANCE_OPTIONS.map((item) => {
                    const selected = businessProfile.assistanceNeeded.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleAssistance(item)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          selected
                            ? 'bg-blue-50 border-blue-600 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {selected && <i className="fa-solid fa-check mr-1 text-[10px]" />}
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Business Website / Link</span>
                  <input
                    value={businessProfile.website}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, website: e.target.value })}
                    placeholder="https://..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Location / City</span>
                  <input
                    value={businessProfile.location}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, location: e.target.value })}
                    placeholder="e.g. Lagos, Nigeria"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </label>
              </div>
            </div>

            {businessError && <p className="mt-3 text-xs text-red-600">{businessError}</p>}
            {businessMessage && <p className="mt-3 text-xs text-emerald-600">{businessMessage}</p>}

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <Link to="/recommendations" className="text-xs text-blue-700 hover:underline font-semibold">
                <i className="fa-solid fa-robot mr-1" />View in Recommendation Assistant
              </Link>
              <button
                type="submit"
                disabled={businessSaving}
                className="px-5 py-2 bg-blue-700 text-white rounded-xl text-xs font-bold hover:bg-blue-800 transition disabled:opacity-50"
              >
                {businessSaving ? 'Saving…' : 'Save Business Profile'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: RECOMMENDATION BOT PREFERENCES */}
      {activeTab === 'recommendations' && (
        <form onSubmit={saveRecPreferences} className="m-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3 mb-4">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700">
                <i className="fa-solid fa-wand-magic-sparkles" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Personal Recommendation Bot</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Control how your shared recommendation bot adapts to your personal interests, hides unwanted topics, and surfaces promotions.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div>
                  <strong className="block text-xs font-bold text-slate-800">Personalized Content Discovery</strong>
                  <p className="text-[11px] text-slate-500">
                    Use your likes, bookmarks, reading time, and manual interests to rank the Home and Discover feeds.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={recPrefs.personalizedFeed}
                  onChange={(e) => setRecPrefs({ ...recPrefs, personalizedFeed: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div>
                  <strong className="block text-xs font-bold text-slate-800">Business Opportunities Discovery</strong>
                  <p className="text-[11px] text-slate-500">
                    Surface relevant service providers, partner recommendations, and entrepreneurial discussions.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={recPrefs.businessDiscovery}
                  onChange={(e) => setRecPrefs({ ...recPrefs, businessDiscovery: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div>
                  <strong className="block text-xs font-bold text-slate-800">Allow Sponsored & Boosted Content</strong>
                  <p className="text-[11px] text-slate-500">
                    Receive interest-targeted advertisements and promoted creator profiles. Always transparently labeled.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={recPrefs.sponsoredAds}
                  onChange={(e) => setRecPrefs({ ...recPrefs, sponsoredAds: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50">
                <label className="block">
                  <div className="flex items-center justify-between mb-1">
                    <strong className="text-xs font-bold text-slate-800">Promotion Frequency Capping</strong>
                    <span className="text-xs font-bold text-blue-700">1 ad every {recPrefs.frequencyCap} posts</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Ensures your organic social feed never gets overloaded with promotional content.
                  </p>
                  <input
                    type="range"
                    min="3"
                    max="10"
                    step="1"
                    value={recPrefs.frequencyCap}
                    onChange={(e) => setRecPrefs({ ...recPrefs, frequencyCap: parseInt(e.target.value, 10) })}
                    className="w-full accent-blue-700"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Frequent (1 in 3)</span>
                    <span>Standard (1 in 5)</span>
                    <span>Minimal (1 in 10)</span>
                  </div>
                </label>
              </div>
            </div>

            {recError && <p className="mt-3 text-xs text-red-600">{recError}</p>}
            {recMessage && <p className="mt-3 text-xs text-emerald-600">{recMessage}</p>}

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <Link to="/recommendations" className="text-xs text-blue-700 hover:underline font-semibold">
                Inspect Bot Insights
              </Link>
              <button
                type="submit"
                disabled={recSaving}
                className="px-5 py-2 bg-blue-700 text-white rounded-xl text-xs font-bold hover:bg-blue-800 transition disabled:opacity-50"
              >
                {recSaving ? 'Saving…' : 'Save Bot Preferences'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 4: PUSH NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <section className="m-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <i className="fa-solid fa-bell" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-900">Push notifications</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Get alerts for new messages, replies, and live streams even when QuickChat is closed or in the background.
              </p>
            </div>
          </div>

          {!pushState.supported ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
              This browser does not support push notifications. On iPhone, add QuickChat to your Home Screen first (iOS 16.4+), then open it from there.
            </p>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">{pushState.subscribed ? 'Notifications are on' : 'Notifications are off'}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {pushState.permission === 'denied'
                      ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
                      : pushState.subscribed
                        ? 'This browser will show alerts for new activity.'
                        : 'Turn on alerts for this browser only.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushState.subscribed}
                  aria-label="Push notifications"
                  disabled={pushBusy || pushState.permission === 'denied'}
                  onClick={togglePush}
                  className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pushState.subscribed ? 'bg-blue-700' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${pushState.subscribed ? 'left-[1.4rem]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={testPush}
                  disabled={pushBusy || !pushState.subscribed}
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pushBusy ? 'Working…' : 'Send a test notification'}
                </button>
                <span className="text-[10px] text-slate-400">Notifications appear in your operating system, not inside this tab.</span>
              </div>
              {pushError && <p role="alert" className="mt-3 text-xs text-red-700">{pushError}</p>}
              {pushMessage && <p role="status" className="mt-3 text-xs text-emerald-700">{pushMessage}</p>}
            </>
          )}
        </section>
      )}

      {activeTab === 'app' && <PWAInstallCard />}

      <section className="mx-4 mb-6 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-white text-red-600 shadow-sm">
            <i className="fa-solid fa-right-from-bracket" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">Log out</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">Sign out of this QuickChat account on this device.</p>
          </div>
          <button type="button" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); onLogout?.(); }} className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700">
            Log out
          </button>
        </div>
      </section>
    </div>
  );
}
