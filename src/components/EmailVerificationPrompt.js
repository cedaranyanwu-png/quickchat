import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';

export default function EmailVerificationPrompt() {
  const [status, setStatus] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const refresh = async () => {
    try {
      const result = await apiRequest('/auth/email-status');
      setStatus(result);
      setEmail(result.email || '');
    } catch (_error) {
      setStatus(null);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (!status?.showVerificationNotice || status.emailVerified || dismissed) return null;

  const resend = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest('/auth/resend-verification', { method: 'POST', body: { email } });
      setMessage(result.message || 'If this account needs verification, a link is on its way.');
    } catch (e) {
      setError(e.message || 'Could not send the verification email.');
    } finally { setBusy(false); }
  };

  const changeEmail = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest('/auth/change-email', { method: 'POST', body: { email, password } });
      setPassword('');
      setMessage(result.message || 'Email updated. Check your new inbox.');
      await refresh();
    } catch (e) {
      setError(e.message || 'Could not update your email address.');
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="email-verify-title" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><i className="fa-solid fa-envelope-circle-check text-xl" /></div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-700">QuickChat account notice</p>
      <h2 id="email-verify-title" className="mt-2 text-xl font-black text-slate-900">Verify your email address</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">QuickChat now verifies email ownership to protect accounts and support password recovery. Your existing account and paid verification badge are not affected. After requesting a verification link, check your inbox first, then your Spam or Junk folder if you cannot find the email.</p>
      <form onSubmit={changeEmail} className="mt-5 space-y-3">
        <label className="block text-xs font-bold text-slate-700">Email address
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="block text-xs font-bold text-slate-700">Current password <span className="font-normal text-slate-400">(required only to change the address)</span>
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password to change email" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <button type="submit" disabled={busy || !password || !email.trim()} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">{busy ? 'Updating…' : 'Change email and send verification'}</button>
      </form>
      <button type="button" onClick={resend} disabled={busy || !email.trim()} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">{busy ? 'Please wait…' : 'This email is correct — resend verification link'}</button>
      {message && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">{message}</p>}
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-700">{error}</p>}
      <button type="button" onClick={() => setDismissed(true)} className="mt-4 w-full py-2 text-xs font-semibold text-slate-400 hover:text-slate-700">Remind me later</button>
    </section>
  </div>;
}
