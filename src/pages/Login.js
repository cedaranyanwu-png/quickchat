import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { API_BASE_URL } from '../api';

const Login = ({ googleEnabled, onAuthenticated }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [whatsappUnverified, setWhatsappUnverified] = useState(false);
  const [whatsappSetupMode, setWhatsappSetupMode] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [googleCredential, setGoogleCredential] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setPreviewUrl('');
    setUnverifiedEmail('');
    setWhatsappUnverified(false);
    setWhatsappSetupMode('');
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
        requestError.email = data.email;
        requestError.whatsapp = data.code === 'WHATSAPP_NOT_VERIFIED';
        requestError.phoneRequired = data.code === 'WHATSAPP_PHONE_REQUIRED';
        throw requestError;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onAuthenticated?.();
      navigate('/home');
    } catch (err) {
      if (err.code === 'WHATSAPP_NOT_VERIFIED' || err.phoneRequired) {
        setUnverifiedEmail(err.email || formData.email);
        setWhatsappUnverified(true);
        setWhatsappSetupMode(err.phoneRequired ? 'password' : 'resend');
        setNotice(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const submitWhatsAppSetup = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('Starting WhatsApp verification…');
    setIsLoading(true);
    try {
      const isGoogle = whatsappSetupMode === 'google';
      const response = await fetch(`${API_BASE_URL}${isGoogle ? '/auth/google/whatsapp/start' : '/auth/whatsapp/start'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isGoogle
          ? { token: googleCredential, whatsappPhone }
          : { email: unverifiedEmail, password: formData.password, whatsappPhone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not start WhatsApp verification.');
      setWhatsappSetupMode('');
      setNotice(data.message || 'WhatsApp verification link requested.');
      setPreviewUrl(data.previewUrl || '');
    } catch (requestError) {
      setError(requestError.message);
      setNotice('');
    } finally {
      setIsLoading(false);
    }
  };

  const resendWhatsAppLink = async () => {
    setError(''); setNotice('Requesting a WhatsApp verification link…');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/whatsapp/resend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: unverifiedEmail }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not send the WhatsApp link.');
      setNotice(data.message || 'WhatsApp verification link requested.');
    } catch (requestError) { setError(requestError.message); }
  };

  const resendVerification = async () => {
    if (!unverifiedEmail) return;
    setError('');
    setNotice('Sending a new verification link…');
    try {
      const result = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not resend the verification email.');
        return data;
      });
      setNotice(result.message || 'A new verification link is on its way.');
      setPreviewUrl(result.previewUrl || '');
    } catch (requestError) {
      setError(requestError.message);
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

        {notice && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800" role="status">
            <p>{notice}</p>
            {unverifiedEmail && whatsappUnverified && whatsappSetupMode === 'resend' && <button type="button" onClick={resendWhatsAppLink} className="mt-2 text-xs font-bold text-emerald-700 underline">Resend WhatsApp verification link</button>}
            {previewUrl && <a href={previewUrl} className="ml-3 mt-2 inline-block text-xs font-bold text-blue-700 underline">Open development verification link</a>}
          </div>
        )}

        {whatsappSetupMode && <form onSubmit={submitWhatsAppSetup} className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp number</label>
          <input type="tel" value={whatsappPhone} onChange={(event) => setWhatsappPhone(event.target.value)} required placeholder="+2348012345678" className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
          <p className="mt-1 text-[11px] text-slate-600">Use international format, including your country code.</p>
          <button disabled={isLoading} className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">{isLoading ? 'Sending…' : 'Send WhatsApp verification link'}</button>
        </form>}

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
                  if (data.code === 'WHATSAPP_PHONE_REQUIRED' || data.code === 'WHATSAPP_NOT_VERIFIED') {
                    setGoogleCredential(credentialResponse.credential);
                    setUnverifiedEmail(data.email || '');
                    setWhatsappUnverified(true);
                    setWhatsappSetupMode(data.code === 'WHATSAPP_PHONE_REQUIRED' ? 'google' : 'resend');
                    setNotice(data.message || 'Verify your WhatsApp number to continue.');
                    return;
                  }
                  throw new Error(data.message || 'Google login failed');
                }
                
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                onAuthenticated?.();
                navigate('/home');
              } catch (err) {
                setError(err.message);
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
