import React, { useEffect, useState } from 'react';
import { adminRequest } from '../api';

function State({ ok }) { return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{ok ? 'Configured' : 'Needs configuration'}</span>; }

export default function AdminConfiguration() {
  const [data, setData] = useState(null);
  const [fee, setFee] = useState('2000');
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
  return <section className="space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Platform controls</p><h1 className="mt-1 text-2xl font-black text-slate-950">Configuration</h1><p className="mt-1 text-sm text-slate-500">Manage platform pricing and inspect payment and cloud-backup configuration.</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
    <form onSubmit={saveFee} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-extrabold text-slate-900">Account verification price</h2><p className="mt-1 text-xs leading-5 text-slate-500">The user pays this amount in QuickChat points. Point top-ups continue to use the platform's Flutterwave gateway.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="block flex-1 text-xs font-bold text-slate-700">Price (points)<input type="number" min="100" max="1000000" step="1" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label><button disabled={busy || !fee} className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save price'}</button></div>
      <p className="mt-2 text-[11px] text-slate-400">Initial price: 2,000 points. Allowed range: 100–1,000,000 points.</p>
    </form>
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">Flutterwave · Platform payment gateway</h2><p className="mt-1 text-xs text-slate-500">Used across QuickChat for wallet top-ups and supported payments.</p></div><State ok={Boolean(data?.flutterwave?.secretKeyConfigured && data?.flutterwave?.webhookHashConfigured && data?.flutterwave?.webhookUrlConfigured && data?.flutterwave?.publicUrlConfigured)} /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{(data?.flutterwave?.requiredEnvironment || ['FLW_SECRET_KEY','FLW_SECRET_HASH','FLW_WEBHOOK_URL','PUBLIC_APP_URL']).map((key) => <div key={key} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-slate-700">{key}</p><p className="mt-0.5 text-[10px] text-slate-500">{data?.flutterwave?.[({FLW_SECRET_KEY:'secretKeyConfigured',FLW_SECRET_HASH:'webhookHashConfigured',FLW_WEBHOOK_URL:'webhookUrlConfigured',PUBLIC_APP_URL:'publicUrlConfigured'})[key]] ? 'Configured' : 'Missing'}</p></div>)}</div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Set these secrets in your hosting provider's server environment (Railway Variables). They are intentionally not stored in browser-accessible settings or returned by this API.</p>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">Google Drive backups</h2><p className="mt-1 text-xs text-slate-500">OAuth credentials are required before Drive backup and restore can be enabled.</p></div><State ok={Boolean(data?.googleDrive?.configured)} /></div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong>Required server variables:</strong><ul className="mt-2 list-disc pl-5">{(data?.googleDrive?.requiredEnvironment || ['GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','GOOGLE_DRIVE_REFRESH_TOKEN']).map((key) => <li key={key}>{key}</li>)}</ul><p className="mt-2">Credentials must be stored as private server variables. Google Drive synchronization and cloud restore are not marked active until the OAuth integration is installed and verified.</p></div>
    </div>
  </section>;
}
