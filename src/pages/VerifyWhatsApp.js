import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../api';

export default function VerifyWhatsApp() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('Verifying your WhatsApp number…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setStatus('This verification link is missing its token. Request a new link from QuickChat.'); setFailed(true); return; }
    fetch(API_BASE_URL + '/auth/whatsapp/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not verify this WhatsApp number.');
      setStatus(data.message || 'WhatsApp number verified. You can sign in now.');
    }).catch((error) => { setStatus(error.message); setFailed(true); });
  }, [params]);
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><i className={'fa-brands fa-whatsapp text-2xl'} /></div><h1 className="text-2xl font-extrabold text-slate-900">WhatsApp verification</h1><p className={'mt-3 text-sm ' + (failed ? 'text-rose-600' : 'text-slate-600')}>{status}</p><Link to="/login" className="mt-6 inline-flex rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white no-underline">Continue to sign in</Link></section></main>;
}
