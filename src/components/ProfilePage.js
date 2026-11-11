import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, resolveMediaUrl } from '../api';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import FoundingBadge from './FoundingBadge';
import PostCard from './PostCard';

const tabs = ['Posts', 'Media', 'Likes'];
export default function ProfilePage({ username, openModal, openVideo }) {
  const navigate = useNavigate();
  const isOwnProfile = !username;
  const [tab, setTab] = useState('Posts');
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [relationshipType, setRelationshipType] = useState(null);
  const [relationshipUsers, setRelationshipUsers] = useState([]);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipHasMore, setRelationshipHasMore] = useState(false);
  const [relationshipError, setRelationshipError] = useState('');
  const [relationshipActionId, setRelationshipActionId] = useState(null);

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const endpoint = isOwnProfile ? `/profile/me/posts?tab=${tab}` : `/profiles/${encodeURIComponent(username)}?tab=${tab}`;
    const request = isOwnProfile
      ? Promise.all([apiRequest(endpoint), apiRequest('/profile/me')]).then(([postsResult, profileResult]) => ({ ...postsResult, profile: profileResult.profile }))
      : apiRequest(endpoint);
    request.then((result) => {
      if (!active) return;
      setProfile(result.profile);
      setPosts(result.posts || []);
    }).catch((requestError) => { if (active) setError(requestError.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [username, isOwnProfile, tab]);

  useEffect(() => {
    if (!relationshipType || !profile?.id) return undefined;
    let active = true;
    setRelationshipLoading(true);
    setRelationshipError('');
    apiRequest(`/users/${profile.id}/${relationshipType}?limit=50&offset=0`)
      .then((result) => {
        if (!active) return;
        setRelationshipUsers(result.users || []);
        setRelationshipHasMore(Boolean(result.hasMore));
      })
      .catch((requestError) => { if (active) setRelationshipError(requestError.message); })
      .finally(() => { if (active) setRelationshipLoading(false); });
    return () => { active = false; };
  }, [relationshipType, profile?.id]);

  useEffect(() => {
    if (!relationshipType) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setRelationshipType(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [relationshipType]);

  const openRelationshipList = (type) => {
    setRelationshipUsers([]);
    setRelationshipHasMore(false);
    setRelationshipError('');
    setRelationshipType(type);
  };

  const closeRelationshipList = () => setRelationshipType(null);

  const loadMoreRelationships = async () => {
    if (!profile || !relationshipType || !relationshipHasMore || relationshipLoading) return;
    setRelationshipLoading(true);
    setRelationshipError('');
    try {
      const result = await apiRequest(`/users/${profile.id}/${relationshipType}?limit=50&offset=${relationshipUsers.length}`);
      setRelationshipUsers((current) => [...current, ...(result.users || [])]);
      setRelationshipHasMore(Boolean(result.hasMore));
    } catch (requestError) {
      setRelationshipError(requestError.message);
    } finally {
      setRelationshipLoading(false);
    }
  };

  const toggleRelationshipFollow = async (person) => {
    setRelationshipActionId(person.id);
    setRelationshipError('');
    try {
      const result = await apiRequest(`/users/${person.id}/follow`, { method: person.following ? 'DELETE' : 'POST' });
      setRelationshipUsers((current) => current.map((row) => row.id === person.id ? { ...row, following: result.following } : row));
    } catch (requestError) {
      setRelationshipError(requestError.message);
    } finally {
      setRelationshipActionId(null);
    }
  };

  const toggleFollow = async () => {
    if (!profile) return;
    try {
      const result = await apiRequest(`/users/${profile.id}/follow`, { method: profile.isFollowing ? 'DELETE' : 'POST' });
      setProfile((current) => ({ ...current, isFollowing: result.following, followerCount: Math.max(0, current.followerCount + (result.following ? 1 : -1)) }));
    } catch (requestError) { setError(requestError.message); }
  };

  if (loading && !profile) return <p className="p-8 text-center text-sm text-slate-500">Loading profile…</p>;
  const coverImageUrl = resolveMediaUrl(profile?.coverImage);
  return <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
    <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 px-4 py-2 flex items-center gap-4"><button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full hover:bg-slate-100"><i className="fa-solid fa-arrow-left"/></button><div><h2 className="text-base font-extrabold text-slate-900">{profile?.fullName || 'Profile'} <VerifiedBadge verified={profile?.verified} /> <FoundingBadge foundingMember={profile?.foundingMember} /></h2><p className="text-[10px] text-slate-500">{profile?.postCount || 0} posts</p></div></div>
    <div className="relative">
      <button type="button" disabled={!profile?.coverImage} onClick={() => coverImageUrl && openModal?.(coverImageUrl)} className="group relative block h-36 w-full overflow-hidden border-0 bg-slate-200 bg-cover bg-center text-left disabled:cursor-default" style={{ backgroundImage: coverImageUrl ? `url("${coverImageUrl.replace(/"/g, '%22')}")` : undefined }} aria-label={profile?.coverImage ? 'View cover image' : undefined}>
        {profile?.coverImage && <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100"><span className="rounded-full bg-black/55 px-3 py-2 text-xs font-bold"><i className="fa-solid fa-expand mr-1.5" />View image</span></span>}
      </button>
      <button type="button" onClick={() => profile?.picture && openModal?.(resolveMediaUrl(profile.picture))} className="absolute bottom-0 left-4 z-20 translate-y-1/2 cursor-zoom-in rounded-full border-4 border-white bg-white p-0 shadow-md" aria-label={profile?.picture ? 'View profile image' : undefined}>
        <Avatar name={profile?.fullName} picture={profile?.picture} size={84}/>
      </button>
    </div>
    <section className="px-4 pb-4 pt-12 border-b border-slate-200">
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        {isOwnProfile ? (
          <>
            <button onClick={() => navigate('/creator-studio')} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:from-blue-800 hover:to-indigo-800">
              <i className="fa-solid fa-clapperboard" />
              {profile?.isCreator ? 'Open Creator Studio' : 'Switch to Creator'}
            </button>
            <button onClick={() => navigate('/profile/edit')} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold hover:bg-slate-50">Edit profile</button>
            <button onClick={() => navigate('/verification')} className="rounded-full border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">{profile?.verified ? 'Verification' : 'Verify account'}</button>
          </>
        ) : (
          <>
            <button onClick={toggleFollow} className={`rounded-full px-4 py-2 text-xs font-bold ${profile?.isFollowing ? 'bg-slate-200 text-slate-900' : 'bg-blue-700 text-white'}`}>{profile?.isFollowing ? 'Following' : 'Follow'}</button>
            <button onClick={() => navigate(`/messages?userId=${encodeURIComponent(profile.id)}`)} className="rounded-full border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><i className="fa-solid fa-envelope mr-1.5"/>Message</button>
          </>
        )}
      </div>
      <h3 className="text-base font-extrabold text-slate-900">{profile?.fullName} <VerifiedBadge verified={profile?.verified} className="text-sm" /> <FoundingBadge foundingMember={profile?.foundingMember} /></h3>
      {profile?.aiCharacter && <span className="mt-1 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-violet-700">AI character · fictional profile</span>}
      <p className="text-xs text-slate-500">@{String(profile?.username || '').replace(/^@/, '')}</p>
      {profile?.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{profile.bio}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {profile?.location && <span><i className="fa-solid fa-location-dot mr-1"/>{profile.location}</span>}
        {profile?.website && <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="text-blue-700"><i className="fa-solid fa-link mr-1"/>{profile.website}</a>}
        <button type="button" disabled={!profile} onClick={() => openRelationshipList('following')} className="hover:text-blue-700 hover:underline disabled:cursor-default"><strong className="text-slate-900">{profile?.followingCount || 0}</strong> Following</button>
        <button type="button" disabled={!profile} onClick={() => openRelationshipList('followers')} className="hover:text-blue-700 hover:underline disabled:cursor-default"><strong className="text-slate-900">{profile?.followerCount || 0}</strong> Followers</button>
      </div>
      {profile?.interests?.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[10px] font-bold text-slate-500">Interests</span>{profile.interests.map((interest) => <span key={interest} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{interest.charAt(0).toUpperCase() + interest.slice(1)}</span>)}</div>}
    </section>
    <div className="flex border-b border-slate-200">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`flex-1 py-3 font-bold text-xs ${tab === item ? 'text-slate-900 border-b-2 border-blue-700' : 'text-slate-500'}`}>{item}</button>)}</div>
    {error && <p className="p-4 text-sm text-red-600">{error}</p>}{loading && <p className="p-6 text-center text-sm text-slate-500">Loading posts…</p>}{!loading && posts.map((post) => <PostCard key={post.id} post={post} openModal={openModal} openVideo={openVideo}/>)}{!loading && !error && posts.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No {tab.toLowerCase()} to show.</p>}

    {relationshipType && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 sm:p-6" onClick={closeRelationshipList}>
      <section role="dialog" aria-modal="true" aria-labelledby="profile-relationships-title" className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div><h2 id="profile-relationships-title" className="text-base font-extrabold capitalize text-slate-900">{relationshipType}</h2><p className="mt-0.5 text-xs text-slate-500">{profile?.fullName}</p></div>
          <button type="button" onClick={closeRelationshipList} aria-label="Close list" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="overflow-y-auto">
          {relationshipError && <p role="alert" className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{relationshipError}</p>}
          {relationshipUsers.map((person) => <article key={person.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50">
            <button type="button" onClick={() => { closeRelationshipList(); navigate(`/profile/${encodeURIComponent(String(person.username || '').replace(/^@/, ''))}`); }} aria-label={`View ${person.name}'s profile`} className="flex-shrink-0 rounded-full"><Avatar name={person.name} picture={person.picture} size={44} /></button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => { closeRelationshipList(); navigate(`/profile/${encodeURIComponent(String(person.username || '').replace(/^@/, ''))}`); }} className="block max-w-full truncate border-0 bg-transparent p-0 text-left text-sm font-bold text-slate-900 hover:underline">{person.name} <VerifiedBadge verified={person.verified} /></button>
              <p className="truncate text-xs text-slate-500">{person.handle}</p>
              {person.bio && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{person.bio}</p>}
            </div>
            {String(person.id) !== String(profile?.id) && <button type="button" disabled={relationshipActionId === person.id} onClick={() => toggleRelationshipFollow(person)} className={`min-w-[92px] rounded-full px-3 py-2 text-xs font-bold disabled:opacity-50 ${person.following ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>{relationshipActionId === person.id ? 'Saving…' : person.following ? 'Following' : 'Follow'}</button>}
          </article>)}
          {relationshipLoading && relationshipUsers.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Loading {relationshipType}…</p>}
          {!relationshipLoading && !relationshipError && relationshipUsers.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No {relationshipType} yet.</p>}
          {relationshipHasMore && <div className="p-4 text-center"><button type="button" disabled={relationshipLoading} onClick={loadMoreRelationships} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{relationshipLoading ? 'Loading…' : 'Load more'}</button></div>}
        </div>
      </section>
    </div>}
  </div>;
}
