import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';

export default function Follow() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    // Suggestions and follow state come from the current account's server data.
    apiRequest(`/users?q=${encodeURIComponent(searchText)}`)
      .then((result) => { if (active) { setUsers(result.users || []); setError(''); } })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [searchText]);

  const toggleFollow = async (user) => {
    try {
      const result = await apiRequest(`/users/${user.id}/follow`, { method: user.following ? 'DELETE' : 'POST' });
      setUsers((current) => current.map((row) => row.id === user.id ? { ...row, following: result.following } : row));
      setError('');
    } catch (requestError) { setError(requestError.message); }
  };

  return <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
    <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 px-4 py-3"><h2 className="text-lg font-extrabold text-slate-900 mb-3">People</h2><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search people" className="w-full bg-slate-100 rounded-full px-4 py-2 text-sm outline-none" /></div>
    {error && <p className="p-4 text-sm text-red-600">{error}</p>}
    {users.map((user) => <div key={user.id} className="flex items-center gap-3 p-4 border-b border-slate-200 hover:bg-slate-50"><button onClick={() => navigate(`/profile/${user.username}`)} className="p-0 border-0 bg-transparent"><Avatar name={user.name} picture={user.picture} size={44} /></button><div className="flex-1 min-w-0"><button onClick={() => navigate(`/profile/${user.username}`)} className="font-bold text-sm text-slate-900 border-0 bg-transparent p-0 hover:underline">{user.name} {user.verified && <i className="fa-solid fa-circle-check text-blue-700" />}</button><p className="text-xs text-slate-500">{user.handle}</p><p className="text-xs text-slate-700 mt-1">{user.bio}</p></div><button onClick={() => toggleFollow(user)} className={`px-4 py-1.5 rounded-full text-xs font-bold ${user.following ? 'bg-slate-200 text-slate-900' : 'bg-slate-900 text-white'}`}>{user.following ? 'Following' : 'Follow'}</button></div>)}
    {!error && users.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No people found.</p>}
  </div>;
}
