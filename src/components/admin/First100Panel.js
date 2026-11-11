import React, { useEffect, useState } from 'react';
import { adminRequest } from '../../api';

export default function First100Panel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      setData(await adminRequest('/admin/growth/first-100'));
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load First 100 campaign.');
    }
  };

  useEffect(() => { load(); }, []);

  const searchUsers = async (event) => {
    event.preventDefault();
    const term = search.trim();
    if (term.length < 2) {
      setError('Enter at least 2 characters to search existing users.');
      return;
    }
    setSearching(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest(`/admin/growth/first-100/users?search=${encodeURIComponent(term)}`);
      setMatches(result.users || []);
      if (!(result.users || []).length) setNotice('No eligible users found. They may already be in the campaign.');
    } catch (err) {
      setError(err.message || 'Unable to search users.');
    } finally {
      setSearching(false);
    }
  };

  const addUser = async (user) => {
    if (!window.confirm(`Add ${user.fullname || user.username || user.email} to QuickChat First 100?`)) return;
    setAddingId(user.id);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest('/admin/growth/first-100/members', {
        method: 'POST',
        body: { userId: user.id },
      });
      setNotice(result.message || 'Existing user added to the First 100.');
      setMatches((current) => current.filter((item) => item.id !== user.id));
      await load();
    } catch (err) {
      setError(err.message || 'Unable to add this user.');
    } finally {
      setAddingId(null);
    }
  };

  return <section>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-black text-slate-900">QuickChat First 100</h2>
        <p className="mt-1 text-sm text-slate-500">Track the founding-user acquisition campaign and its sources.</p>
      </div>
      <button onClick={load} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Refresh</button>
    </div>

    {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {notice && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Joined</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(data?.joined || 0)}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Places left</p><p className="mt-2 text-3xl font-black text-blue-700">{Number(data?.remaining ?? 100)}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Goal</p><p className="mt-2 text-3xl font-black text-slate-900">100</p></div>
    </div>

    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="font-extrabold text-slate-900">Add an existing QuickChat user</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Search by name, username or email, then add the account directly. No new registration is required.</p>
      </div>
      <form onSubmit={searchUsers} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username or email…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400" />
        <button disabled={searching || search.trim().length < 2} className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{searching ? 'Searching…' : 'Search users'}</button>
      </form>
      {matches.length > 0 && <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {matches.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{user.fullname || user.username || 'QuickChat user'}</p>
            <p className="truncate text-xs text-slate-500">@{user.username || '—'} · {user.email || 'No email'}</p>
          </div>
          <button onClick={() => addUser(user)} disabled={addingId !== null || Number(data?.remaining ?? 100) <= 0} className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{addingId === user.id ? 'Adding…' : 'Add to First 100'}</button>
        </div>)}
      </div>}
      {Number(data?.remaining ?? 100) <= 0 && <p className="mt-3 text-xs font-semibold text-amber-700">The campaign has reached 100 members. No more users can be added.</p>}
    </div>

    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">Founding members</h3><p className="mt-1 text-xs text-slate-500">Ordered by the position they earned or were added by an administrator.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">#</th><th className="px-5 py-3">Member</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Verified</th><th className="px-4 py-3">Joined</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.members || []).map((row, index) => <tr key={row.id}>
              <td className="px-5 py-3 font-black text-blue-700">{index + 1}</td>
              <td className="px-5 py-3"><p className="font-bold text-slate-800">{row.fullname || row.username}</p><p className="text-xs text-slate-500">{row.username}</p></td>
              <td className="px-4 py-3 text-xs text-slate-500">{row.email}</td>
              <td className="px-4 py-3 text-xs font-bold text-slate-600">{row.source === 'admin_added' ? 'Added by admin' : row.source}</td>
              <td className="px-4 py-3">{Number(row.email_verified) === 1 ? <span className="text-xs font-bold text-emerald-700">Verified</span> : <span className="text-xs text-amber-600">Pending</span>}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{row.joined_at ? new Date(row.joined_at).toLocaleString() : '—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!data?.members?.length && <p className="p-8 text-center text-sm text-slate-400">No founding members yet.</p>}
    </div>
  </section>;
}
