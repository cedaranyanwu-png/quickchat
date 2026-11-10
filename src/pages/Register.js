import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { API_BASE_URL, apiRequest, normalizeNetworkError } from '../api';
import { INTEREST_OPTIONS } from '../interest-options';

const Register = ({ googleEnabled, onAuthenticated }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ fullName: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('register'); // 'register' or 'interests'
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, referralCode: new URLSearchParams(window.location.search).get('ref') || '' }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('That email or username is already registered. Sign in instead, or choose different details.');
        }
        throw new Error(data.message || 'Registration failed');
      }

      if (data.emailVerificationRequired) {
        setVerificationEmail(data.email || formData.email);
        setStep('email-verification');
        setResendMessage(data.message || 'Check your inbox for the verification link.');
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onAuthenticated?.();
      setStep('interests');
    } catch (err) {
      setError(normalizeNetworkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveInterests = async () => {
    setIsLoading(true);
    try {
      if (selectedInterests.length > 0) {
        const res = await apiRequest('/profile/me', {
          method: 'PATCH',
          body: { interests: selectedInterests },
        });
        if (res?.profile) {
          localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...res.profile }));
        }
      }
      navigate('/home');
    } catch {
      navigate('/home');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'email-verification') {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700"><i className="fa-solid fa-envelope-circle-check text-2xl" /></div>
        <h1 className="text-2xl font-extrabold text-slate-900">Verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">We sent a verification link to <strong>{verificationEmail}</strong>. Check your email inbox first. If you do not see it, check your Spam or Junk folder too. Open the message and confirm your email address before signing in.</p>
        {resendMessage && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">{resendMessage}</p>}
        <button type="button" onClick={async () => {
          setResendMessage('Sending a new verification link…');
          try {
            const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verificationEmail }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Could not resend the link.');
            setResendMessage(result.message || 'If the account needs verification, a new link is on its way.');
          } catch (e) { setResendMessage(e.message || 'Could not resend the link.'); }
        }} className="mt-5 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">Resend verification email</button>
        <Link to="/login" className="mt-4 inline-block text-sm font-bold text-blue-700 hover:underline">Return to sign in</Link>
      </div>
    </div>;
  }

  if (step === 'interests') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 sm:p-8 border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
              <i className="fa-solid fa-wand-magic-sparkles text-base" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Step 2 of 2 · Personalization</span>
              <h1 className="text-xl font-extrabold text-slate-900">What are you interested in?</h1>
            </div>
          </div>
          <p className="text-xs text-slate-600 mb-4 leading-relaxed">
            Select topics you are passionate about. Your recommendation bot uses these to curate your feed, connect you with creators, recommend communities, and present relevant opportunities. You can change these anytime.
          </p>

          <div className="max-h-64 overflow-y-auto p-2 mb-5 flex flex-wrap gap-2 border border-slate-100 rounded-xl bg-slate-50/50">
            {INTEREST_OPTIONS.map(([key, label]) => {
              const isSelected = selectedInterests.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setSelectedInterests((prev) =>
                      isSelected ? prev.filter((i) => i !== key) : [...prev, key]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition ${
                    isSelected
                      ? 'bg-blue-700 border-blue-700 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {isSelected && <i className="fa-solid fa-check mr-1.5 text-[10px]" />}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Skip for now
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSaveInterests}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
            >
              {isLoading ? (
                <i className="fa-solid fa-circle-notch fa-spin text-xs" />
              ) : (
                <>
                  <span>Save & Continue</span>
                  {selectedInterests.length > 0 && (
                    <span className="bg-blue-500/50 text-[10px] px-1.5 py-0.2 rounded-full">
                      {selectedInterests.length}
                    </span>
                  )}
                  <i className="fa-solid fa-arrow-right text-[11px]" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border border-slate-200">
        <div className="flex flex-col items-center mb-6">
          <img src="/favicon/logo.png" alt="QuickChat Logo" className="w-16 h-16 object-contain mb-4" onError={(e) => { e.target.style.display = 'none'; }} />
          <h1 className="text-2xl font-extrabold text-slate-900">Create Account</h1>
          <p className="text-sm text-slate-500 mt-1">Join the QuickChat community today</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
            <i className="fa-solid fa-circle-exclamation"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
            <div className="relative">
              <i className="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} required
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 transition-all" placeholder="John Doe" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
            <div className="relative">
              <i className="fa-solid fa-at absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="text" name="username" value={formData.username} onChange={handleChange} required
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 transition-all" placeholder="johndoe" />
            </div>
          </div>

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
              <input type="password" name="password" value={formData.password} onChange={handleChange} required minLength={6}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 transition-all" placeholder="••••••••" />
            </div>
          </div>

          

          <button type="submit" disabled={isLoading}
            className="w-full py-2.5 mt-2 bg-blue-700 text-white rounded-lg text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
            {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Create Account'}
          </button>
        </form>

        {googleEnabled && <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-slate-500">Or sign up with</span></div>
          </div>

          {/* Google sign-up shares the server-verified sign-in flow. */}
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
                  body: JSON.stringify({ token: credentialResponse.credential, referralCode: new URLSearchParams(window.location.search).get('ref') || '' }),
                });
                const data = await response.json();
                if (!response.ok) {
                  throw new Error(data.message || 'Google signup failed');
                }
                
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                onAuthenticated?.();
                setStep('interests');
              } catch (err) {
                setError(normalizeNetworkError(err));
              } finally {
                setIsLoading(false);
              }
            }}
            onError={() => {
              setError('Google Signup Failed. Please try again.');
              setIsLoading(false);
            }}
            theme="outline"
            size="large"
            text="signup_with"
          />
          </div>
        </>}

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account? <Link to="/login" className="text-blue-700 font-bold hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
