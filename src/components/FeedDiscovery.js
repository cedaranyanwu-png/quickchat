import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from './Avatar';

// Compact discovery strip shared by Home and Explore. The feed APIs send
// interest-ranked people and unjoined communities so both pages can surface them
// without another round trip.
export default function FeedDiscovery({ people = [], communities = [] }) {
  const navigate = useNavigate();
  const [userRows, setUserRows] = useState(people);
  const [communityRows, setCommunityRows] = useState(communities);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setUserRows(people), [people]);
  useEffect(() => setCommunityRows(communities), [communities]);

  const follow = async (person) => {
    setBusyKey(`person-${person.id}`);
    setError('');
    try {
      const result = await apiRequest(`/users/${person.id}/follow`, { method: 'POST' });
      setUserRows((current) => current.map((row) => row.id === person.id
        ? { ...row, following: result.following }
        : row));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyKey('');
    }
  };

  const joinCommunity = async (community) => {
    setBusyKey(`community-${community.id}`);
    setError('');
    try {
      if (community.isPaid) {
        const checkout = await apiRequest(`/payments/communities/${community.id}/checkout`, { method: 'POST', body: {} });
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      await apiRequest(`/communities/${community.id}/join`, { method: 'POST' });
      setCommunityRows((current) => current.filter((row) => row.id !== community.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyKey('');
    }
  };

  if (!userRows.length && !communityRows.length) return null;

  return (
    <section className="space-y-4 border-b border-slate-200 px-4 py-4">
      <div className="space-y-4">
        {userRows.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">People to follow</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
              {userRows.map((person) => (
                <article key={person.id} className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <button type="button" onClick={() => navigate(`/profile/${person.username}`)} className="flex flex-col items-center border-0 bg-transparent p-0 text-center">
                    <Avatar name={person.name} picture={person.picture} size={42} />
                    <strong className="mt-2 w-full truncate text-xs text-slate-900">{person.name || 'QuickChat user'}</strong>
                    <small className="w-full truncate text-[10px] text-slate-500">{person.handle}</small>
                    {person.bio && <span className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{person.bio}</span>}
                    <small className="mt-1 text-[10px] text-slate-400">{Number(person.followers || 0).toLocaleString()} followers</small>
                  </button>
                  <button
                    type="button"
                    disabled={busyKey === `person-${person.id}`}
                    onClick={() => follow(person)}
                    className={`mt-auto w-full rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-50 ${person.following ? 'bg-slate-200 text-slate-800' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                  >
                    {busyKey === `person-${person.id}` ? 'Following…' : person.following ? 'Following' : 'Follow'}
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {communityRows.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Communities to join</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
              {communityRows.map((community) => (
                <article key={community.id} className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><i className="fa-solid fa-users text-xs" /></span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/communities/${community.id}`} className="block truncate text-xs font-bold text-slate-900 no-underline hover:underline">{community.name}</Link>
                      <small className="block truncate text-[10px] text-slate-500">{community.members} {community.members === 1 ? 'member' : 'members'}{community.category ? ` · ${community.category}` : ''}</small>
                    </div>
                  </div>
                  {community.description && <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-500">{community.description}</p>}
                  <button
                    type="button"
                    disabled={busyKey === `community-${community.id}`}
                    onClick={() => joinCommunity(community)}
                    className="mt-auto w-full rounded-full bg-blue-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {busyKey === `community-${community.id}` ? 'Opening…' : community.isPaid ? 'Get pass' : 'Join'}
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
