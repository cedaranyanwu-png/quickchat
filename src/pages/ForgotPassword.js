import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setPreviewUrl('');
    setIsLoading(true);
    try {
      const result = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setMessage(result.message || 'If an account exists for that email, a password reset link is on its way.');
      setPreviewUrl(result.previewUrl || '');
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
        <h1 className="text-2xl font-extrabold text-slate-900">Forgot password?</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Enter your account email and we will send you a reset link.</p>
      </div>

      {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}
      {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
        <p>{message}</p>
        {previewUrl && <a href={previewUrl} className="mt-2 inline-block font-bold text-blue-700 hover:underline">Open reset link (development preview)</a>}
      </div>}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="forgot-email">Email address</label>
          <div className="relative">
            <i className="fa-solid fa-envelope absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
            <input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700" placeholder="you@example.com" />
          </div>
        </div>
        <button type="submit" disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-70">
          {isLoading ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600"><Link to="/login" className="font-bold text-blue-700 hover:underline">Back to sign in</Link></p>
    </div>
  </div>;
}
