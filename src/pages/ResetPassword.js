import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(token ? '' : 'This password reset link is missing its token.');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      });
      setMessage(result.message || 'Password updated. Sign in with your new password.');
      setPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border border-slate-200">
      <div className="flex flex-col items-center mb-6">
        <img src="/favicon/logo.png" alt="QuickChat Logo" className="w-16 h-16 object-contain mb-4" onError={(event) => { event.target.style.display = 'none'; }} />
        <h1 className="text-2xl font-extrabold text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Use at least 6 characters. This link works once and expires after 60 minutes.</p>
      </div>

      {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}
      {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
        <p>{message}</p>
        <Link to="/login" className="mt-2 inline-block font-bold text-blue-700 hover:underline">Sign in</Link>
      </div>}

      {!message && <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="reset-password">New password</label>
          <div className="relative">
            <i className="fa-solid fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
            <input id="reset-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700" placeholder="••••••••" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="reset-confirm">Confirm new password</label>
          <div className="relative">
            <i className="fa-solid fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
            <input id="reset-confirm" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700" placeholder="••••••••" />
          </div>
        </div>
        <button type="submit" disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">
          {isLoading ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Update password'}
        </button>
      </form>}

      <p className="mt-6 text-center text-sm text-slate-600"><Link to="/login" className="font-bold text-blue-700 hover:underline">Back to sign in</Link></p>
    </div>
  </div>;
}
