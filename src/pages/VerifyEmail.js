import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'loading' : 'error');
  const [message, setMessage] = useState(token ? 'Verifying your email…' : 'This verification link is missing its token.');

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    apiRequest('/auth/verify-email', { method: 'POST', body: { token } })
      .then((result) => {
        if (!active) return;
        setStatus('success');
        setMessage(result.message || 'Email verified. You can sign in now.');
      })
      .catch((requestError) => {
        if (!active) return;
        setStatus('error');
        setMessage(requestError.message);
      });
    return () => { active = false; };
  }, [token]);

  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border border-slate-200 text-center">
      <img src="/favicon/logo.png" alt="QuickChat Logo" className="mx-auto w-16 h-16 object-contain mb-4" onError={(event) => { event.target.style.display = 'none'; }} />
      <div className={`mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full ${status === 'success' ? 'bg-emerald-100 text-emerald-700' : status === 'error' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
        <i className={`fa-solid ${status === 'success' ? 'fa-check' : status === 'error' ? 'fa-circle-exclamation' : 'fa-circle-notch fa-spin'}`} />
      </div>
      <h1 className="text-xl font-extrabold text-slate-900">{status === 'success' ? 'Email verified' : status === 'error' ? 'Verification problem' : 'Verifying email'}</h1>
      <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`} role="status">{message}</p>
      <div className="mt-6 flex flex-col gap-2">
        <Link to="/login" className="rounded-lg bg-blue-700 py-2.5 text-sm font-bold text-white no-underline hover:bg-blue-800">Go to sign in</Link>
        {status === 'error' && <Link to="/forgot-password" className="text-xs font-bold text-blue-700 hover:underline">Need help signing in?</Link>}
      </div>
    </div>
  </div>;
}
