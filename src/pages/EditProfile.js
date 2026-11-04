import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, uploadMedia } from '../api';
import Avatar from '../components/Avatar';
import { INTEREST_OPTIONS } from '../interest-options';

export default function EditProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ fullName: '', username: '', bio: '', location: '', website: '', interests: [] });
  const [avatarFile, setAvatarFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The edit form starts from saved profile data rather than demo defaults.
    apiRequest('/profile/me').then(({ profile: saved }) => {
      setProfile(saved);
      setForm({ fullName: saved.fullName || '', username: saved.username || '', bio: saved.bio || '', location: saved.location || '', website: saved.website || '', interests: saved.interests || [] });
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (!avatarFile) return undefined;
    const url = URL.createObjectURL(avatarFile); setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);
  useEffect(() => {
    if (!coverFile) return undefined;
    const url = URL.createObjectURL(coverFile); setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const changes = { ...form };
      // Upload first, then persist the resulting server URLs with profile fields.
      if (avatarFile) changes.avatarUrl = (await uploadMedia(avatarFile)).url;
      if (coverFile) changes.coverUrl = (await uploadMedia(coverFile)).url;
      const result = await apiRequest('/profile/me', { method: 'PATCH', body: changes });
      const saved = result.profile;
      setProfile(saved);
      localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...saved }));
      navigate('/profile');
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  return <div className="max-w-3xl mx-auto pb-20 lg:pb-0 bg-white min-h-full"><form onSubmit={save}>
    <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 px-4 py-3 flex items-center justify-between"><Link to="/profile" className="text-slate-700"><i className="fa-solid fa-xmark"/></Link><h2 className="text-base font-extrabold text-slate-900">Edit profile</h2><button disabled={saving || !profile} className="px-4 py-1.5 bg-slate-900 text-white rounded-full text-xs font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
    <div className="relative h-40 bg-slate-200 bg-cover bg-center" style={{ backgroundImage: (coverPreview || profile?.coverImage) ? `url(${coverPreview || profile.coverImage})` : undefined }}><label className="absolute inset-0 flex items-center justify-center bg-black/20 text-white cursor-pointer hover:bg-black/35"><span className="px-3 py-2 rounded-full bg-black/45 text-xs font-bold"><i className="fa-solid fa-camera mr-2"/>Upload cover photo</span><input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} className="hidden"/></label><div className="absolute -bottom-9 left-4"><label className="block cursor-pointer rounded-full border-4 border-white"><Avatar name={profile?.fullName} picture={avatarPreview || profile?.picture} size={80}/><input type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} className="hidden"/></label></div></div>
    <div className="pt-14 px-4 space-y-4">{error && <p className="text-sm text-red-600" role="alert">{error}</p>}{[['fullName','Name'],['username','Username'],['bio','Bio'],['location','Location'],['website','Website']].map(([key,label]) => <label key={key} className="block"><span className="block text-xs font-bold text-slate-500 mb-1">{label}</span>{key === 'bio' ? <textarea maxLength="160" rows="3" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-700"/> : <input maxLength={key === 'fullName' ? 100 : key === 'username' ? 30 : 255} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-700"/>}</label>)}
    </div>
    <section className="px-4 py-5 border-t border-slate-200">
      <div className="mb-3"><h3 className="text-sm font-bold text-slate-900">Interests</h3><p className="mt-1 text-xs text-slate-500">Choose your favorite topics. QuickChat uses these to personalize your Home feed, discover communities, and suggest relevant connections and opportunities.</p></div>
      <div className="flex flex-wrap gap-2">
        {INTEREST_OPTIONS.map(([key, label]) => {
          const selected = form.interests.includes(key);
          const atLimit = !selected && form.interests.length >= 24;
          return <button key={key} type="button" aria-pressed={selected} disabled={atLimit} onClick={() => setForm((current) => ({ ...current, interests: selected ? current.interests.filter((item) => item !== key) : [...current.interests, key] }))} className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${selected ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>{selected && <i className="fa-solid fa-check mr-1.5"/>}{label}</button>;
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{form.interests.length} of 24 selected</p>
    </section>
  </form></div>;
}
