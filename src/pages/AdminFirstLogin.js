import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';

export default function AdminFirstLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (form.newPassword.length < 12) {
      setError('Use at least 12 characters for the new password.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest('/admin/security/change-password', {
        method: 'POST',
        body: form,
      });
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...user, mustChangePassword: false }));
      setNotice(result.message || 'Password updated.');
      navigate('/admin', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Password update failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl sm:p-9">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <i className="fa-solid fa-shield-halved text-xl" />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-blue-700">QuickChat administrator security</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Change your initial password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This owner account is using its one-time bootstrap password. Set a new password before accessing the platform administration centre.
        </p>
        {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {notice && <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-slate-700">Current password
            <input name="currentPassword" type="password" autoComplete="current-password" value={form.currentPassword} onChange={update} required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-bold text-slate-700">New password
            <input name="newPassword" type="password" autoComplete="new-password" minLength={12} value={form.newPassword} onChange={update} required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-bold text-slate-700">Confirm new password
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} value={form.confirmPassword} onChange={update} required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <p className="text-xs leading-5 text-slate-500">Use at least 12 characters. The server verifies your current password, stores only a bcrypt hash, and records the security event without recording credentials.</p>
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? <><i className="fa-solid fa-circle-notch fa-spin" /> Updating password…</> : 'Update password and continue'}
          </button>
        </form>
      </section>
    </main>
  );
}
