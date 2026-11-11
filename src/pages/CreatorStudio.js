import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';

const Metric = ({ label, value, icon }) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold">{label}</span><i className={`fa-solid ${icon} text-blue-600`} /></div><p className="mt-3 text-2xl font-black text-slate-950">{Number(value || 0).toLocaleString()}</p></div>;

export default function CreatorStudio() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const result = await apiRequest('/creator-studio/me');
    setData(result);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(data.referralLink); setNotice('Your creator referral link has been copied.'); }
    catch { setError('Could not copy the link. Select and copy it manually.'); }
  };
  if (!data) return <div className="mx-auto max-w-5xl p-8 text-sm text-slate-500">Loading Creator Studio…</div>;
  const isCreator = data.isCreator;
  return <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:pb-10">
    <header className="mb-6 overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-300">QuickChat · Creator tools</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{isCreator ? 'Creator Studio' : 'Build your creator presence'}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{isCreator ? 'Manage your creator identity, publish content and understand how your audience finds you.' : 'Switch your existing QuickChat account to Creator mode. Keep your followers, posts and profile while unlocking creator tools.'}</p></div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold">{isCreator ? 'Creator account active' : 'Normal account'}</span></div>
      {isCreator && <div className="mt-6 flex flex-wrap gap-2"><Link to="/compose/advanced" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white no-underline hover:bg-blue-500"><i className="fa-solid fa-plus mr-2"/>Create content</Link><Link to="/profile/edit" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white no-underline hover:bg-white/10">Edit public profile</Link></div>}
    </header>
    {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!isCreator ? <section className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><i className="fa-solid fa-user-pen"/> Creator access</span>
        <h2 className="mt-4 text-xl font-extrabold text-slate-950">Upgrade your account to Creator</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Creator account activation is now handled in Account Verification. Complete the Creator Account section there to unlock this studio. Your existing profile, followers and posts stay intact.</p>
        <Link to="/verification" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white no-underline hover:bg-blue-800"><i className="fa-solid fa-shield-check"/> Go to Account Verification</Link>
      </div>
      <div className="rounded-2xl bg-blue-50 p-5"><h3 className="font-extrabold text-blue-950">Creator tools included</h3><div className="mt-4 space-y-4">{[['fa-chart-line','Audience overview','Track followers, posts and referral performance.'],['fa-pen-to-square','Content Studio','Publish text, images and videos.'],['fa-link','Referral link','Share a personal invite link and track referred signups.'],['fa-award','Founding identity','Your First 100 badge remains attached if eligible.']].map(([icon,title,desc])=><div key={title} className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-700"><i className={'fa-solid '+icon}/></span><div><p className="text-sm font-bold text-blue-950">{title}</p><p className="mt-1 text-xs leading-5 text-blue-800">{desc}</p></div></div>)}</div></div>
    </section> : <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Followers" value={data.metrics.followers} icon="fa-users"/>
        <Metric label="Published posts" value={data.metrics.posts} icon="fa-file-lines"/>
        <Metric label="Invited signups" value={data.metrics.trackedSignups} icon="fa-user-plus"/>
        <Metric label="Qualified referrals" value={data.metrics.qualifiedReferrals} icon="fa-check-circle"/>
      </section>
      <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-extrabold text-slate-950">Content Studio</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">Publishing</span></div><p className="mt-2 text-sm text-slate-500">Create a post, share media or publish a longer piece using the existing QuickChat composer.</p><Link to="/compose/advanced" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white no-underline"><i className="fa-solid fa-wand-magic-sparkles"/> Open Content Studio</Link><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Following</p><p className="mt-1 text-xl font-black text-slate-900">{data.metrics.following}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">All referrals</p><p className="mt-1 text-xl font-black text-slate-900">{data.metrics.referrals}</p></div></div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-950">Your creator referral link</h2><p className="mt-1 text-xs leading-5 text-slate-500">Invite new members. Referral rewards qualify under the existing verified-email and return-visit rules.</p><input readOnly value={data.referralLink} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700"/><button onClick={copyLink} className="mt-2 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">Copy invite link</button><p className="mt-2 text-[11px] text-slate-500">Code: {data.referralCode}</p></div>
      </section>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-950">Signup source analytics</h2><p className="mt-1 text-xs text-slate-500">Tracked attribution records linked to your referral ID.</p>{data.referralSources?.length ? <div className="mt-4 space-y-2">{data.referralSources.map((row,i)=><div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="font-semibold text-slate-700">{row.source}{row.campaign ? ' · '+row.campaign : ''}</span><strong>{Number(row.users).toLocaleString()}</strong></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No campaign-attributed signups are recorded yet. Existing referral-code signups are shown in the referral totals above.</p>}</section>
    </>}
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Growth toolkit</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">Creator recruitment & campaign kit</h2><p className="mt-1 text-xs leading-5 text-slate-500">Ready-to-adapt content prompts and outreach messages. Use your personal referral link in every campaign so registrations can be attributed.</p></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-extrabold text-slate-900"><i className="fa-brands fa-tiktok mr-2 text-slate-900"/>TikTok content plan</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600"><li><strong>Hook:</strong> “Nigerian creators, stop building your audience on rented space.” Show your QuickChat profile and a post.</li><li><strong>Demo:</strong> Record a 20-second screen demo: create account, switch to Creator mode, publish, invite followers.</li><li><strong>Proof:</strong> Share a real creator milestone or audience insight. Do not invent earnings or user numbers.</li></ul><button onClick={()=>navigator.clipboard.writeText('TikTok plan: 1) Hook: Nigerian creators, stop building your audience on rented space. 2) Screen-record switching to QuickChat Creator mode and publishing a post. 3) Show a real creator milestone. CTA: Join QuickChat and create your page: '+(data?.trackingLinks?.tiktok||data?.referralLink||window.location.origin+'/creator-studio'))} className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Copy TikTok outline</button></article>
        <article className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-extrabold text-slate-900"><i className="fa-solid fa-paper-plane mr-2 text-blue-700"/>Creator DM script</h3><p className="mt-3 text-xs leading-5 text-slate-600">Hi [Name], I like your content about [specific topic]. I’m inviting a small group of Nigerian creators to try QuickChat, where you can build a profile, publish content and connect directly with your audience. Would you be open to checking it out? Here’s my invite: [your QuickChat referral link]. No pressure.</p><button onClick={()=>navigator.clipboard.writeText('Hi [Name], I like your content about [specific topic]. I’m inviting a small group of Nigerian creators to try QuickChat, where you can build a profile, publish content and connect directly with your audience. Would you be open to checking it out? Here’s my invite: '+(data?.trackingLinks?.dm||data?.referralLink||'[your referral link]')+'. No pressure.')} className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Copy DM script</button></article>
        <article className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-extrabold text-slate-900"><i className="fa-brands fa-whatsapp mr-2 text-emerald-700"/>WhatsApp campaign</h3><p className="mt-3 text-xs leading-5 text-slate-600">CREATORS, BUILD WITH US. QuickChat is opening Creator mode to people who want to publish, grow a community and connect with their audience. Switch your existing account to Creator mode or join today. Start here: [your QuickChat referral link].</p><button onClick={()=>navigator.clipboard.writeText('CREATORS, BUILD WITH US. QuickChat is opening Creator mode to people who want to publish, grow a community and connect with their audience. Switch your existing account to Creator mode or join today. Start here: '+(data?.trackingLinks?.whatsapp||data?.referralLink||'[your referral link]'))} className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Copy WhatsApp message</button></article>
      </div>
    </section>
  </div>;
}
