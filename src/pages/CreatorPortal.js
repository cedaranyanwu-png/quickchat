import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL, normalizeNetworkError, apiRequest } from '../api';
import CreatorStudio from './CreatorStudio';

export default function CreatorPortal() {
  const portalPath = window.location.hostname.toLowerCase().startsWith('creator.') ? '/' : '/creator';
  const [signedIn, setSignedIn] = useState(Boolean(localStorage.getItem('token')));
  const [status, setStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  React.useEffect(() => {
    if (!signedIn) return;
    let active = true;
    apiRequest('/creator-studio/me')
      .then((data) => { if (active) setStatus(data); })
      .catch((e) => { if (active) setError(e.message || 'Could not load your QuickChat account.'); });
    return () => { active = false; };
  }, [signedIn]);

  const openAuth = () => {
    setError('');
    setMessage('');
    setShowRecovery(false);
    setModalOpen(true);
  };

  const login = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(\`${API_BASE_URL}/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credentials.username.trim(), password: credentials.password }),
      });
      const data = await response.json();
      if (!response.ok) {
        const err = new Error(data.message || 'Unable to sign in.');
        err.code = data.code;
        throw err;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.assign(portalPath);
    } catch (e) {
      setError(normalizeNetworkError(e));
    } finally {
      setBusy(false);
    }
  };

  const recover = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/auth/forgot-password', { method: 'POST', body: { email: recoveryEmail.trim() } });
      setMessage(result.message || 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.');
    } catch (e) {
      setError(e.message || 'Could not request a password reset.');
    } finally {
      setBusy(false);
    }
  };

  if (signedIn && !status) return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">Loading Creator Portal…</div>;

  if (signedIn && status?.isCreator) {
    return <div className="min-h-screen bg-slate-50"><header className="flex items-center justify-between border-b bg-white px-5 py-3"><Link to={portalPath} className="font-black text-slate-900 no-underline">QUICKCHAT CREATOR</Link><Link to="/home" className="text-xs font-bold text-blue-700 no-underline">Open QuickChat</Link></header><CreatorStudio /></div>;
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
    <div className="mx-auto max-w-5xl">
      <Link to="/" className="text-sm font-black text-blue-300 no-underline">QUICKCHAT</Link>
      <p className="mt-16 text-xs font-black uppercase tracking-[.25em] text-blue-300">QuickChat Creator Portal</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Your creativity deserves its own space.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Access your creator workspace with your existing QuickChat identity. Manage your creator presence, audience and publishing tools from one place.</p>
      {signedIn && status && !status.isCreator && <div className="mt-7 max-w-2xl rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">You are signed in to QuickChat, but creator access is not active on this account yet. Open QuickChat and complete the creator-access process from your account.</div>}
      <div className="mt-8 flex flex-wrap gap-3">
        {!signedIn ? <button type="button" onClick={openAuth} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500">Register with QuickChat</button> : <Link to="/verification" className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white no-underline hover:bg-blue-500">Open QuickChat</Link>}
        {!signedIn && <button type="button" onClick={openAuth} className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Sign in</button>}
      </div>
      <p className="mt-4 text-xs text-slate-400">One QuickChat account powers your profile and creator workspace. There is no separate creator password.</p>
    </div>

    {modalOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="creator-auth-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">QuickChat account</p><h2 id="creator-auth-title" className="mt-2 text-2xl font-black">{showRecovery ? 'Recover your password' : 'Continue to QuickChat'}</h2><p className="mt-1 text-sm text-slate-500">{showRecovery ? 'Enter the email address linked to your account.' : 'Use your QuickChat username or email and password.'}</p></div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close" className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {showRecovery ? <form onSubmit={recover} className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700">Account email<input required type="email" autoComplete="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send password reset link'}</button>
          <button type="button" onClick={() => { setShowRecovery(false); setError(''); setMessage(''); }} className="w-full text-sm font-bold text-blue-700">Back to sign in</button>
        </form> : <form onSubmit={login} className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700">Username or email<input required autoFocus autoComplete="username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} placeholder="Your QuickChat username" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <label className="block text-xs font-bold text-slate-700">Password<input required type="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} placeholder="Your password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <div className="flex justify-end"><button type="button" onClick={() => { setShowRecovery(true); setError(''); setMessage(''); }} className="text-xs font-bold text-blue-700 hover:underline">Forgot password?</button></div>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in with QuickChat'}</button>
          <p className="text-center text-xs text-slate-500">New to QuickChat? <a href="/register?next=%2Fcreator" className="font-bold text-blue-700 hover:underline">Create a QuickChat account</a></p>
        </form>}
      </section>
    </div>}
  </main>;
}
