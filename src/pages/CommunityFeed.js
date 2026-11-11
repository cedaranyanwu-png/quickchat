import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api';
import PostCard from '../components/PostCard';

export default function CommunityFeed({ openModal, openVideo }) {
  const { communityId } = useParams();
  const [community, setCommunity] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [moderation, setModeration] = useState(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState('');
  const [reportingPost, setReportingPost] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest(`/communities/${encodeURIComponent(communityId)}/posts`);
      setCommunity(result.community || null);
      setPosts(result.posts || []);
      setError('');
      if (result.community?.canModerate) {
        const adminData = await apiRequest(`/communities/${encodeURIComponent(communityId)}/moderation`);
        setModeration(adminData);
      } else {
        setModeration(null);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const refreshModeration = async () => {
    const result = await apiRequest(`/communities/${encodeURIComponent(communityId)}/moderation`);
    setModeration(result);
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!reportingPost || !reportReason.trim()) return;
    setModerationBusy(`report-${reportingPost}`);
    setReportError('');
    try {
      await apiRequest(`/communities/${communityId}/reports`, {
        method: 'POST',
        body: { targetType: 'post', targetId: reportingPost, reason: reportReason.trim() },
      });
      setReportingPost(null);
      setReportReason('');
      setReportError('Report sent to the community moderation team.');
    } catch (requestError) {
      setReportError(requestError.message);
    } finally {
      setModerationBusy('');
    }
  };

  const reviewReport = async (reportId, action) => {
    setModerationBusy(`report-${reportId}`);
    setError('');
    try {
      await apiRequest(`/communities/${communityId}/reports/${reportId}`, { method: 'PATCH', body: { action } });
      await Promise.all([refreshModeration(), loadCommunityPosts()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setModerationBusy('');
    }
  };

  const loadCommunityPosts = async () => {
    const result = await apiRequest(`/communities/${encodeURIComponent(communityId)}/posts`);
    setCommunity(result.community || null);
    setPosts(result.posts || []);
  };

  const updateMemberRole = async (member, role) => {
    setModerationBusy(`member-${member.id}`);
    setError('');
    try {
      await apiRequest(`/communities/${communityId}/members/${member.id}/role`, { method: 'PATCH', body: { role } });
      await refreshModeration();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setModerationBusy('');
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`Remove @${member.username} from this community?`)) return;
    setModerationBusy(`member-${member.id}`);
    setError('');
    try {
      await apiRequest(`/communities/${communityId}/members/${member.id}`, { method: 'DELETE' });
      await Promise.all([refreshModeration(), loadCommunityPosts()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setModerationBusy('');
    }
  };

  return <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
      <Link to="/communities" aria-label="Back to communities" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><i className="fa-solid fa-arrow-left" /></Link>
      <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-extrabold text-slate-900">{community?.name || 'Space feed'}</h1><p className="truncate text-xs text-slate-500">{community?.description || `Posts shared with this ${community?.spaceType || 'community'}`}</p></div>
      {community?.isOwner && <span className="rounded-full bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-800">Owner</span>}
      {community?.isModerator && !community?.isOwner && <span className="rounded-full bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">Moderator</span>}
      {community?.canModerate && <button type="button" onClick={() => setModerationOpen((open) => !open)} className="rounded-full border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><i className="fa-solid fa-shield-halved mr-1" />Moderation</button>}
      {!community?.isPaid || community?.canAccess ? <Link to={`/compose/advanced?destination=community&communityId=${encodeURIComponent(communityId)}`} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800">Create post</Link> : <span className="rounded-full bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600"><i className="fa-solid fa-lock mr-1" />Members only</span>}
    </header>

    {error && <p className="p-4 text-sm text-red-600">{error}</p>}
    {reportError && <p role="status" className="mx-4 mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">{reportError}</p>}

    {community?.canModerate && moderationOpen && <section className="border-b border-blue-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-extrabold text-slate-900">Community moderation</h2><p className="mt-0.5 text-xs text-slate-500">Manage members and review reports for this community.</p></div><button type="button" onClick={refreshModeration} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Refresh</button></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Members · {moderation?.members?.length || 0}</h3>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {(moderation?.members || []).map((member) => <div key={member.id} className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0">
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{member.name}</p><p className="truncate text-[10px] text-slate-500">@{member.username} · {member.role}</p></div>
              {moderation?.community?.isOwner && member.role !== 'owner' && <button type="button" disabled={Boolean(moderationBusy)} onClick={() => updateMemberRole(member, member.role === 'moderator' ? 'member' : 'moderator')} className="rounded-full bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700 disabled:opacity-50">{member.role === 'moderator' ? 'Remove mod' : 'Make mod'}</button>}
              {member.role !== 'owner' && (moderation?.community?.isOwner || member.role === 'member') && <button type="button" disabled={Boolean(moderationBusy)} onClick={() => removeMember(member)} className="rounded-full bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 disabled:opacity-50">Remove</button>}
            </div>)}
            {!moderation?.members?.length && <p className="py-3 text-xs text-slate-500">No members found.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Pending reports · {moderation?.reports?.length || 0}</h3>
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto">
            {(moderation?.reports || []).map((report) => <article key={report.id} className="rounded-lg border border-slate-200 p-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase text-red-600">{report.targetType} report</span><span className="text-[10px] text-slate-400">#{report.targetId}</span></div>
              <p className="mt-1 line-clamp-3 text-xs text-slate-800">{report.targetText || 'Content unavailable'}</p>
              <p className="mt-1 text-[10px] text-slate-500">Reported by {report.reporter} · {report.reason}</p>
              <div className="mt-2 flex gap-2"><button type="button" disabled={Boolean(moderationBusy)} onClick={() => reviewReport(report.id, 'dismiss')} className="rounded-full border border-slate-300 px-3 py-1.5 text-[10px] font-bold text-slate-600 disabled:opacity-50">Dismiss</button><button type="button" disabled={Boolean(moderationBusy)} onClick={() => reviewReport(report.id, 'remove_content')} className="rounded-full bg-red-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Remove content</button></div>
            </article>)}
            {!moderation?.reports?.length && <p className="py-3 text-xs text-slate-500">No pending reports.</p>}
          </div>
        </div>
      </div>
    </section>}

    {loading && <p className="p-8 text-center text-sm text-slate-500">Loading community posts…</p>}
    {!loading && !error && posts.map((post) => <React.Fragment key={post.id}>
      <PostCard post={post} openModal={openModal} openVideo={openVideo} />
      <div className="border-b border-slate-100 px-4 py-2"><button type="button" onClick={() => { setReportingPost(post.id); setReportReason(''); setReportError(''); }} className="text-[11px] font-semibold text-slate-400 hover:text-red-600"><i className="fa-regular fa-flag mr-1" />Report post</button></div>
    </React.Fragment>)}
    {reportingPost && <form onSubmit={submitReport} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-slate-900">Report community post</h2><button type="button" onClick={() => setReportingPost(null)} className="text-slate-400 hover:text-slate-700"><i className="fa-solid fa-xmark" /></button></div><p className="mt-1 text-xs text-slate-500">Tell the community moderators why this post should be reviewed.</p><textarea autoFocus required maxLength="500" rows="4" value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Describe the issue…" className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-600" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setReportingPost(null)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={!reportReason.trim() || moderationBusy === `report-${reportingPost}`} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{moderationBusy === `report-${reportingPost}` ? 'Sending…' : 'Send report'}</button></div></div>
    </form>}
    {!loading && !error && community?.isPaid && !community?.canAccess && <div className="mx-4 mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-blue-700"><i className="fa-solid fa-lock" /></span><h2 className="mt-3 text-base font-bold text-slate-900">Paid community</h2><p className="mt-1 text-sm text-slate-600">Get 30 days of access for ₦{Number(community.monthlyPrice).toLocaleString('en-NG')}.</p><p className="mt-1 text-xs text-slate-500">Passes renew manually after 30 days.</p><button type="button" disabled={checkoutLoading} onClick={async () => { setCheckoutLoading(true); setError(''); try { const result = await apiRequest(`/payments/communities/${communityId}/checkout`, { method: 'POST', body: {} }); window.location.assign(result.checkoutUrl); } catch (requestError) { setError(requestError.message); setCheckoutLoading(false); } }} className="mt-4 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{checkoutLoading ? 'Opening checkout…' : 'Get 30-day pass'}</button></div>}
    {!loading && !error && (!community?.isPaid || community?.canAccess) && posts.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No posts in this community yet. Start the conversation.</p>}
  </div>;
}
