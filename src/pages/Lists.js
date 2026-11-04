import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';

export default function Lists() {
  const [lists, setLists] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', isPrivate: false });
  const [activeListId, setActiveListId] = useState(null);
  const [members, setMembers] = useState([]);
  const [people, setPeople] = useState([]);
  const [personQuery, setPersonQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest('/lists');
      setLists(result.lists || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeListId || personQuery.trim().length < 2) {
      setPeople([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      apiRequest(`/users?q=${encodeURIComponent(personQuery.trim())}&limit=8`)
        .then((result) => { if (active) setPeople(result.users || []); })
        .catch((requestError) => { if (active) setError(requestError.message); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeListId, personQuery]);

  const openList = async (list) => {
    if (String(activeListId) === String(list.id)) {
      setActiveListId(null);
      setMembers([]);
      setPeople([]);
      setPersonQuery('');
      return;
    }
    setActiveListId(list.id);
    setMembers([]);
    setPeople([]);
    setPersonQuery('');
    setLoadingMembers(true);
    setError('');
    try {
      const result = await apiRequest(`/lists/${list.id}`);
      setMembers(result.members || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMembers(false);
    }
  };

  const createList = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/lists', { method: 'POST', body: form });
      setForm({ name: '', description: '', isPrivate: false });
      setFormOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (person) => {
    if (!activeListId) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/lists/${activeListId}/members`, { method: 'POST', body: { userId: person.id } });
      const result = await apiRequest(`/lists/${activeListId}`);
      setMembers(result.members || []);
      setLists((current) => current.map((list) => list.id === activeListId ? { ...list, members: result.list.members } : list));
      setPeople((current) => current.filter((candidate) => candidate.id !== person.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId) => {
    if (!activeListId) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/lists/${activeListId}/members/${userId}`, { method: 'DELETE' });
      setMembers((current) => current.filter((member) => String(member.id) !== String(userId)));
      setLists((current) => current.map((list) => list.id === activeListId ? { ...list, members: Math.max(0, list.members - 1) } : list));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (list) => {
    setError('');
    try {
      await apiRequest(`/lists/${list.id}`, { method: 'DELETE' });
      setLists((current) => current.filter((row) => row.id !== list.id));
      if (String(activeListId) === String(list.id)) setActiveListId(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const activeList = lists.find((list) => String(list.id) === String(activeListId));
  const memberIds = new Set(members.map((member) => String(member.id)));
  const availablePeople = people.filter((person) => !memberIds.has(String(person.id)));

  return <div className="mx-auto max-w-4xl pb-20 lg:pb-0">
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-lg font-extrabold text-slate-900">Lists</h1><p className="mt-0.5 text-xs text-slate-500">Keep people organized around the things you follow.</p></div>
        <button type="button" onClick={() => setFormOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800" aria-expanded={formOpen}><i className="fa-solid fa-plus" />{formOpen ? 'Cancel' : 'New list'}</button>
      </div>
    </header>

    {formOpen && <form onSubmit={createList} className="border-b border-slate-200 bg-blue-50/40 p-4 sm:p-5">
      <h2 className="text-base font-extrabold text-slate-900">Create a list</h2>
      <p className="mt-1 text-xs text-slate-500">Start with a name, then add people from your network.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">List name
          <input required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Design voices" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="text-xs font-bold text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span>
          <input maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What is this list for?" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={form.isPrivate} onChange={(event) => setForm({ ...form, isPrivate: event.target.checked })} className="h-4 w-4 accent-blue-700" />Keep this list private</label>
        <button disabled={saving} className="rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? 'Creating…' : 'Create list'}</button>
      </div>
    </form>}

    {error && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {loading && <p className="p-8 text-center text-sm text-slate-500">Loading your lists…</p>}
    {!loading && !error && lists.length === 0 && <div className="p-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><i className="fa-solid fa-list-ul" /></span><h2 className="mt-3 text-sm font-bold text-slate-900">Your lists start here</h2><p className="mt-1 text-sm text-slate-500">Create a list to group and revisit the people you follow.</p></div>}

    {lists.map((list) => <section key={list.id} className="border-b border-slate-200">
      <div className="flex items-start gap-3 p-4 sm:px-5">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className="fa-solid fa-list-ul" /></span>
        <button type="button" onClick={() => openList(list)} className="min-w-0 flex-1 text-left" aria-expanded={String(activeListId) === String(list.id)}>
          <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">{list.name}{list.isPrivate && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"><i className="fa-solid fa-lock mr-1" />Private</span>}</span>
          {list.description && <span className="mt-1 block text-sm text-slate-600">{list.description}</span>}
          <span className="mt-1 block text-xs text-slate-500">{list.members} {list.members === 1 ? 'person' : 'people'} · {String(activeListId) === String(list.id) ? 'Close members' : 'View members'}</span>
        </button>
        <button type="button" onClick={() => deleteList(list)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${list.name}`}><i className="fa-regular fa-trash-can" /></button>
      </div>

      {String(activeListId) === String(list.id) && <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
        {loadingMembers ? <p className="text-sm text-slate-500">Loading members…</p> : <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-900">People in {activeList?.name}</h3><p className="mt-0.5 text-xs text-slate-500">Search by name or username to add people.</p></div><label className="w-full max-w-xs text-xs font-semibold text-slate-600">Find people
            <input value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="Search people" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label></div>
          {personQuery.trim().length >= 2 && <div className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {availablePeople.map((person) => <div key={person.id} className="flex items-center gap-2 p-2.5"><Avatar name={person.name} picture={person.picture} size={32} /><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{person.name}</strong><small className="text-xs text-slate-500">{person.handle}</small></span><button type="button" disabled={saving} onClick={() => addMember(person)} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"><i className="fa-solid fa-plus mr-1" />Add</button></div>)}
            {availablePeople.length === 0 && <p className="p-3 text-xs text-slate-500">No matching people to add.</p>}
          </div>}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {members.map((member) => <div key={member.id} className="flex items-center gap-2 p-2.5"><Avatar name={member.fullname} picture={member.avatar_url} size={32} /><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{member.fullname}</strong><small className="text-xs text-slate-500">{member.username?.startsWith('@') ? member.username : `@${member.username || ''}`}</small></span><Link to={`/profile/${String(member.username || '').replace(/^@/, '')}`} className="text-xs font-semibold text-blue-700 no-underline hover:underline">Profile</Link>{String(member.id) !== String(list.ownerId) && <button type="button" disabled={saving} onClick={() => removeMember(member.id)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${member.fullname}`}><i className="fa-solid fa-xmark" /></button>}</div>)}
            {members.length === 0 && <p className="p-3 text-xs text-slate-500">No people in this list yet.</p>}
          </div>
        </>}
      </div>}
    </section>)}
  </div>;
}
