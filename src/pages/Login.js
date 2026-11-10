import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { API_BASE_URL, normalizeNetworkError } from '../api';

const Login = ({ googleEnabled, onAuthenticated }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [correctedEmail, setCorrectedEmail] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        const requestError = new Error(data.message || 'Login failed');
        requestError.code = data.code;
        throw requestError;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onAuthenticated?.();
      navigate('/home');
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(err.email || formData.email);
        setResendMessage(err.message || 'Verify your email before signing in.');
      }
      setError(normalizeNetworkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border border-slate-200">
        <div className="flex flex-col items-center mb-6">
          <img src="/favicon/logo.png" alt="QuickChat Logo" className="w-16 h-16 object-contain mb-4" onError={(e) => { e.target.style.display = 'none'; }} />
          <h1 className="text-2xl font-extrabold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your QuickChat account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation"></i> {error}
          </div>
        )}

        {unverifiedEmail && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-900">Email verification required</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{resendMessage}</p>
          <p className="mt-2 text-xs leading-5 text-amber-800">After requesting a verification link, check your inbox. If it is not there, look in your Spam or Junk folder.</p>
          <button type="button" disabled={isLoading} onClick={async () => {
            setIsLoading(true);
            try {
              const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: unverifiedEmail }) });
              const result = await response.json();
              if (!response.ok) throw new Error(result.message || 'Could not resend verification email.');
              setResendMessage(result.message || 'If the account needs verification, a new link is on its way.');
            } catch (e) { setResendMessage(e.message || 'Could not resend verification email.'); }
            finally { setIsLoading(false); }
          }} className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">Resend verification link</button>
          <div className="mt-4 border-t border-amber-200 pt-3">
            <label className="block text-xs font-bold text-amber-900">Used a fake or incorrect email? Enter the correct one
              <input type="email" value={correctedEmail} onChange={e => setCorrectedEmail(e.target.value)} placeholder="your-real-email@example.com" className="mt-1.5 w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
            </label>
            <button type="button" disabled={isLoading || !correctedEmail.trim() || !formData.password} onClick={async () => {
              setIsLoading(true);
              try {
                const response = await fetch(`${API_BASE_URL}/auth/change-unverified-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: unverifiedEmail, newEmail: correctedEmail, password: formData.password }) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Could not update email.');
                setUnverifiedEmail(result.email || correctedEmail);
                setCorrectedEmail('');
                setResendMessage(result.message || 'Email updated. Check your new inbox.');
              } catch (e) { setResendMessage(e.message || 'Could not update email.'); }
              finally { setIsLoading(false); }
            }} className="mt-2 rounded-lg border border-amber-800 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">Update email and send verification</button>
          </div>
        </div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <i className="fa-solid fa-envelope absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="email" name="email" value={formData.email} onChange={handleChange} required
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 transition-all" placeholder="you@example.com" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <i className="fa-solid fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="password" name="password" value={formData.password} onChange={handleChange} required
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 transition-all" placeholder="••••••••" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
              <input type="checkbox" className="rounded border-slate-300 text-blue-700 focus:ring-blue-700" /> Remember me
            </label>
            <Link to="/forgot-password" className="text-blue-700 font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
              Forgot password?
            </Link>
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full py-2.5 bg-blue-700 text-white rounded-lg text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
            {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Sign In'}
          </button>
        </form>

        {googleEnabled && <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-slate-500">Or continue with</span></div>
          </div>

          {/* Google returns an ID token; the server verifies it before creating a session. */}
          <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              setIsLoading(true);
              setError('');
              try {
                if (!credentialResponse.credential) throw new Error('Google did not return a sign-in token.');
                const response = await fetch(`${API_BASE_URL}/auth/google`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: credentialResponse.credential }),
                });
                const data = await response.json();
                if (!response.ok) {
                  throw new Error(data.message || 'Google login failed');
                }
                
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                onAuthenticated?.();
                navigate('/home');
              } catch (err) {
                setError(normalizeNetworkError(err));
              } finally {
                setIsLoading(false);
              }
            }}
            onError={() => {
              setError('Google Login Failed. Please try again.');
              setIsLoading(false);
            }}
            theme="outline"
            size="large"
            text="signin_with"
          />
          </div>
        </>}

        <div className="mt-6 text-center text-sm text-slate-600">
          Don't have an account? <Link to="/register" className="text-blue-700 font-bold hover:underline">Create one</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
