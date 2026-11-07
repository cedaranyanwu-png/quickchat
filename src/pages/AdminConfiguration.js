import React, { useEffect, useState } from 'react';
import { adminRequest } from '../api';

function State({ ok }) { return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{ok ? 'Configured' : 'Needs configuration'}</span>; }

export default function AdminConfiguration() {
  const [data, setData] = useState(null);
  const [fee, setFee] = useState('2000');
  const [credentials, setCredentials] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    adminRequest('/admin/configuration').then((result) => { setData(result); setFee(String(result.verificationFeePoints)); }).catch((err) => setError(err.message));
  }, []);
  const saveFee = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/configuration/verification-fee', { method: 'PUT', body: { points: Number(fee) } });
      setFee(String(result.verificationFeePoints)); setNotice(result.message);
      setData((current) => ({ ...(current || {}), verificationFeePoints: result.verificationFeePoints }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const saveCredentials = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/configuration/gateways', { method: 'PUT', body: credentials });
      setNotice(result.message); setCredentials({});
      const fresh = await adminRequest('/admin/configuration'); setData(fresh);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const field = (key, label, type = 'password') => <label className="block text-xs font-bold text-slate-700">{label}<input type={type} autoComplete="off" value={credentials[key] || ''} onChange={(e) => setCredentials((current) => ({ ...current, [key]: e.target.value }))} placeholder="Leave blank to keep the saved value" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>;
  return <section className="space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Platform controls</p><h1 className="mt-1 text-2xl font-black text-slate-950">Configuration</h1><p className="mt-1 text-sm text-slate-500">Manage verification pricing, payment credentials and Google Drive authorization.</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
    <form onSubmit={saveFee} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-extrabold text-slate-900">Account verification price</h2><p className="mt-1 text-xs leading-5 text-slate-500">The user pays this amount in QuickChat points. Point top-ups continue to use Flutterwave.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="block flex-1 text-xs font-bold text-slate-700">Price (points)<input type="number" min="100" max="1000000" step="1" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label><button disabled={busy || !fee} className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save price'}</button></div>
      <p className="mt-2 text-[11px] text-slate-400">Initial price: 2,000 points. Allowed range: 100–1,000,000 points.</p>
    </form>
    <form onSubmit={saveCredentials} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">Flutterwave · Platform payment gateway</h2><p className="mt-1 text-xs text-slate-500">These credentials power platform payments, including wallet top-ups.</p></div><State ok={Boolean(data?.flutterwave?.secretKeyConfigured && data?.flutterwave?.webhookHashConfigured && data?.flutterwave?.webhookUrlConfigured && data?.flutterwave?.publicUrlConfigured)} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{field('FLW_SECRET_KEY','Flutterwave secret key')}{field('FLW_SECRET_HASH','Flutterwave webhook secret hash')}{field('FLW_WEBHOOK_URL','Flutterwave webhook URL','url')}{field('PUBLIC_APP_URL','Public QuickChat HTTPS URL','url')}</div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">Secrets are encrypted server-side with AES-256-GCM. Set ADMIN_CONFIG_ENCRYPTION_KEY in Railway Variables before saving credentials. Existing saved values are never returned to the browser.</p>
      <button disabled={busy || !Object.values(credentials).some((value) => String(value || '').trim())} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save Flutterwave configuration'}</button>
    </form>
    <form onSubmit={saveCredentials} className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">Google Drive backup account</h2><p className="mt-1 text-xs text-slate-500">OAuth application credentials and refresh token.</p></div><State ok={Boolean(data?.googleDrive?.configured)} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{field('GOOGLE_DRIVE_CLIENT_ID','Google OAuth client ID','text')}{field('GOOGLE_DRIVE_CLIENT_SECRET','Google OAuth client secret')}{field('GOOGLE_DRIVE_REFRESH_TOKEN','Google OAuth refresh token')}{field('GOOGLE_DRIVE_FOLDER_ID','Google Drive backup folder ID','text')}</div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">Credentials are encrypted at rest. Saving credentials alone does not activate Drive upload or cloud restore; the Drive API workflow must also be enabled and tested.</p>
      <button disabled={busy || !Object.keys(credentials).some((key) => key.startsWith('GOOGLE_DRIVE_') && String(credentials[key] || '').trim())} className="mt-4 rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save Google Drive credentials'}</button>
    </form>
  </section>;
}
