import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest(`/communities/${encodeURIComponent(communityId)}/posts`)
      .then((result) => {
        if (!active) return;
        setCommunity(result.community || null);
        setPosts(result.posts || []);
        setError('');
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [communityId]);

  return <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
      <Link to="/communities" aria-label="Back to communities" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><i className="fa-solid fa-arrow-left" /></Link>
      <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-extrabold text-slate-900">{community?.name || 'Community feed'}</h1><p className="truncate text-xs text-slate-500">{community?.description || 'Posts shared with this community'}</p></div>
      {!community?.isPaid || community?.canAccess ? <Link to={`/compose/advanced?destination=community&communityId=${encodeURIComponent(communityId)}`} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800">Create post</Link> : <span className="rounded-full bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600"><i className="fa-solid fa-lock mr-1" />Members only</span>}
    </header>
    {error && <p className="p-4 text-sm text-red-600">{error}</p>}
    {loading && <p className="p-8 text-center text-sm text-slate-500">Loading community posts…</p>}
    {!loading && !error && posts.map((post) => <PostCard key={post.id} post={post} openModal={openModal} openVideo={openVideo} />)}
    {!loading && !error && community?.isPaid && !community?.canAccess && <div className="mx-4 mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-blue-700"><i className="fa-solid fa-lock" /></span><h2 className="mt-3 text-base font-bold text-slate-900">Paid community</h2><p className="mt-1 text-sm text-slate-600">Get 30 days of access for ₦{Number(community.monthlyPrice).toLocaleString('en-NG')}.</p><p className="mt-1 text-xs text-slate-500">Passes renew manually after 30 days.</p><button type="button" disabled={checkoutLoading} onClick={async () => { setCheckoutLoading(true); setError(''); try { const result = await apiRequest(`/payments/communities/${communityId}/checkout`, { method: 'POST', body: {} }); window.location.assign(result.checkoutUrl); } catch (requestError) { setError(requestError.message); setCheckoutLoading(false); } }} className="mt-4 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{checkoutLoading ? 'Opening checkout…' : 'Get 30-day pass'}</button></div>}
    {!loading && !error && (!community?.isPaid || community?.canAccess) && posts.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No posts in this community yet. Start the conversation.</p>}
  </div>;
}
