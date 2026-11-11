import React, { useState } from 'react';
import { API_BASE_URL, normalizeNetworkError, apiRequest } from '../api';
import CreatorStudio from './CreatorStudio';

export default function CreatorPortal() {
  const portalPath = window.location.hostname.toLowerCase().startsWith('creator.') ? '/' : '/creator';
  const [signedIn, setSignedIn] = useState(Boolean(localStorage.getItem('token')));
  const [modalOpen, setModalOpen] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [registration, setRegistration] = useState({ fullName: '', username: '', email: '', password: '', confirmPassword: '' });
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const openAuth = () => {
    setError(''); setMessage(''); setShowRecovery(false); setShowRegister(false); setModalOpen(true);
  };

  const login = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(API_BASE_URL + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credentials.username.trim(), password: credentials.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to sign in.');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setModalOpen(false); setSignedIn(true);
    } catch (e) { setError(normalizeNetworkError(e)); }
    finally { setBusy(false); }
  };

  const register = async (event) => {
    event.preventDefault();
    if (registration.password.length < 6) return setError('Use a password with at least 6 characters.');
    if (registration.password !== registration.confirmPassword) return setError('The passwords do not match.');
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(API_BASE_URL + '/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: registration.fullName.trim(), username: registration.username.trim(),
          email: registration.email.trim(), password: registration.password,
          source: 'creator_portal', landingPath: '/creator'
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not create your account.');
      setShowRegister(false); setShowRecovery(false);
      setCredentials({ username: registration.email.trim(), password: '' });
      setMessage(result.message || 'Account created. Verify your email before signing in.');
    } catch (e) { setError(normalizeNetworkError(e)); }
    finally { setBusy(false); }
  };

  const recover = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest('/auth/forgot-password', { method: 'POST', body: { email: recoveryEmail.trim() } });
      setMessage(result.message || 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.');
    } catch (e) { setError(e.message || 'Could not request a password reset.'); }
    finally { setBusy(false); }
  };

  const signOut = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setSignedIn(false); setModalOpen(false);
  };

  if (signedIn) return <div className="min-h-screen bg-slate-50">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <span className="font-black text-slate-900">QUICKCHAT CREATOR</span>
      <button type="button" onClick={signOut} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Sign out</button>
    </header>
    <CreatorStudio />
  </div>;

  return <main className="min-h-screen bg-slate-950 px-5 py-16 text-white">
    <div className="mx-auto max-w-5xl">
      <span className="text-sm font-black text-blue-300">QUICKCHAT CREATOR</span>
      <p className="mt-16 text-xs font-black uppercase tracking-[.25em] text-blue-300">Creator Portal</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Your creativity deserves its own space.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Register and manage your creator identity, communities, pages, channels and publishing workspace from this dedicated portal.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={openAuth} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500">Register with QuickChat</button>
        <button type="button" onClick={openAuth} className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Sign in</button>
      </div>
      <p className="mt-4 text-xs text-slate-400">Your creator workspace and management tools remain inside this portal.</p>
    </div>

    {modalOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="creator-auth-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
      <section className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">Creator Portal account</p><h2 id="creator-auth-title" className="mt-2 text-2xl font-black">{showRecovery ? 'Recover your password' : showRegister ? 'Create your account' : 'Sign in to Creator Portal'}</h2><p className="mt-1 text-sm text-slate-500">{showRecovery ? 'Enter the email address linked to your account.' : showRegister ? 'Create your account here. Email verification is required before sign-in.' : 'Use your username or email and password.'}</p></div>
          <button type="button" onClick={() => setModalOpen(false)} aria-label="Close" className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {showRegister ? <form onSubmit={register} className="mt-5 space-y-3">
          <label className="block text-xs font-bold text-slate-700">Full name<input required maxLength="100" value={registration.fullName} onChange={(e) => setRegistration({ ...registration, fullName: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"/></label>
          <label className="block text-xs font-bold text-slate-700">Username<input required maxLength="30" autoComplete="username" value={registration.username} onChange={(e) => setRegistration({ ...registration, username: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"/></label>
          <label className="block text-xs font-bold text-slate-700">Email<input required type="email" autoComplete="email" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"/></label>
          <label className="block text-xs font-bold text-slate-700">Password<input required type="password" minLength="6" autoComplete="new-password" value={registration.password} onChange={(e) => setRegistration({ ...registration, password: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"/></label>
          <label className="block text-xs font-bold text-slate-700">Confirm password<input required type="password" autoComplete="new-password" value={registration.confirmPassword} onChange={(e) => setRegistration({ ...registration, confirmPassword: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal"/></label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Creating account…' : 'Create Creator Portal account'}</button>
          <button type="button" onClick={() => { setShowRegister(false); setError(''); }} className="w-full text-sm font-bold text-blue-700">Already registered? Sign in</button>
        </form> : showRecovery ? <form onSubmit={recover} className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700">Account email<input required type="email" autoComplete="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send password reset link'}</button>
          <button type="button" onClick={() => { setShowRecovery(false); setError(''); setMessage(''); }} className="w-full text-sm font-bold text-blue-700">Back to sign in</button>
        </form> : <form onSubmit={login} className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700">Username or email<input required autoFocus autoComplete="username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} placeholder="Your username" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <label className="block text-xs font-bold text-slate-700">Password<input required type="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} placeholder="Your password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-600"/></label>
          <div className="flex justify-end"><button type="button" onClick={() => { setShowRecovery(true); setError(''); setMessage(''); }} className="text-xs font-bold text-blue-700 hover:underline">Forgot password?</button></div>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-center text-xs text-slate-500">New creator? <button type="button" onClick={() => { setShowRegister(true); setError(''); setMessage(''); }} className="font-bold text-blue-700 hover:underline">Register here</button></p>
        </form>}
      </section>
    </div>}
  </main>;
}
