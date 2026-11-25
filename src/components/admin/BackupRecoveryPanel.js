import React, { useEffect, useState } from 'react';
import { API_BASE_URL, adminRequest } from '../../api';

const initialBucket = { name: '', endpoint: 'https://62809542fc864ad1186326309f104278.r2.cloudflarestorage.com', bucket: '', region: 'auto', accessKey: '', secretKey: '' };

export default function BackupRecoveryPanel({ can }) {
  const [backups, setBackups] = useState([]);
  const [drive, setDrive] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [bucketForm, setBucketForm] = useState(initialBucket);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bucketBusy, setBucketBusy] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const [local, remote, storage] = await Promise.all([
        adminRequest('/admin/backups'),
        adminRequest('/admin/backups/google-drive'),
        can('settings.manage') ? adminRequest('/admin/r2-buckets') : Promise.resolve({ buckets: [], activeId: null }),
      ]);
      setBackups(local.backups || []);
      setRunning(Boolean(local.running));
      setDrive(remote.files || []);
      setBuckets(storage.buckets || []);
      setActiveId(storage.activeId || null);
    } catch (e) { setError(e.message || 'Unable to load backup storage.'); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!window.confirm('Create a full database and media backup and store the archive in the active R2 bucket under backups/?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await adminRequest('/admin/backups', { method: 'POST', body: { reason: 'Manual administrator R2 backup' } });
      setNotice(`Backup created and uploaded to R2: ${r.backup?.storage?.bucket || 'active bucket'} / backups/ (${(Number(r.backup?.sizeBytes || 0) / 1048576).toFixed(2)} MB).`);
      await load();
    } catch (e) { setError(e.message || 'R2 database backup failed.'); }
    finally { setBusy(false); }
  };

  const restore = async (b) => {
    if (!window.confirm(`Recover backed up data from ${b.filename}? This replaces current database records. Create a fresh backup first if you need to preserve the current state.`)) return;
    if (!window.confirm('FINAL CONFIRMATION: restore this snapshot to the live QuickChat database now?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await adminRequest(`/admin/backups/${encodeURIComponent(b.filename)}/restore`, { method: 'POST', body: { confirm: true, reason: `Admin recovery of ${b.filename}` } });
      setNotice(`Recovery complete: ${r.result?.restoredRows || 0} database rows restored across ${r.result?.restoredTables || 0} tables. Media was written to the active R2 bucket.`);
      await load();
    } catch (e) { setError(e.message || 'Database recovery failed.'); }
    finally { setBusy(false); }
  };

  const download = async (b) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE_URL}/admin/backups/${encodeURIComponent(b.filename)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Download failed.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = b.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message || 'Download failed.'); }
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete R2 backup ${b.filename}? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try { await adminRequest(`/admin/backups/${encodeURIComponent(b.filename)}`, { method: 'DELETE' }); setNotice('Backup deleted from R2.'); await load(); }
    catch (e) { setError(e.message || 'Backup deletion failed.'); }
    finally { setBusy(false); }
  };

  const importCurrent = async () => {
    setBucketBusy(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/r2-buckets/import-environment', { method: 'POST', body: {} });
      setNotice(result.message || 'Current R2 bucket imported.');
      await load();
    } catch (e) { setError(e.message || 'Could not import Railway R2 configuration.'); }
    finally { setBucketBusy(false); }
  };

  const addBucket = async (event) => {
    event.preventDefault(); setBucketBusy(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/r2-buckets', { method: 'POST', body: bucketForm });
      setNotice(result.message || 'R2 bucket connected.');
      setBucketForm(initialBucket);
      await load();
    } catch (e) { setError(e.message || 'R2 bucket connection failed.'); }
    finally { setBucketBusy(false); }
  };

  const cleanupLocalMedia = async () => {
    if (!window.confirm('QuickChat will check every local media file against all configured R2 buckets and delete only files whose R2 copies are confirmed. Files without a verified R2 copy will be retained. Continue?')) return;
    setCleanupBusy(true); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/r2-buckets/cleanup-local-media', { method: 'POST', body: {} });
      setNotice(`Local cleanup complete: ${result.removed || 0} verified copies removed; ${result.retained || 0} files retained because they were not confirmed in R2.`);
    } catch (e) { setError(e.message || 'Local media cleanup failed.'); }
    finally { setCleanupBusy(false); }
  };

  const activate = async (bucket) => {
    if (!window.confirm(`Test and activate ${bucket.name || bucket.bucket} for all new uploads and backups?`)) return;
    setBucketBusy(true); setError(''); setNotice('');
    try {
      const result = await adminRequest(`/admin/r2-buckets/${encodeURIComponent(bucket.id)}/activate`, { method: 'POST', body: {} });
      setNotice(result.message || 'Active R2 bucket changed.');
      await load();
    } catch (e) { setError(e.message || 'Could not activate R2 bucket.'); }
    finally { setBucketBusy(false); }
  };

  return <section>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-black text-slate-900">Backup &amp; recovery</h2><p className="mt-1 text-sm text-slate-500">Database snapshots and uploaded media are stored in Cloudflare R2.</p></div>
      {can('backups.create') && <button disabled={busy || running} onClick={create} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{busy || running ? 'Backup operation running…' : 'Back up database now'}</button>}
    </div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</div>}

    {can('settings.manage') && <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold text-slate-900">R2 storage buckets</h3><p className="mt-1 text-xs text-slate-500">Add multiple buckets. Only the active bucket receives new uploads and backups.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={bucketBusy} onClick={importCurrent} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50">Use current Railway R2 configuration</button><button type="button" disabled={cleanupBusy || bucketBusy} onClick={cleanupLocalMedia} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">{cleanupBusy ? 'Verifying R2 copies…' : 'Remove verified local media copies'}</button></div></div>
      <div className="mt-4 space-y-2">
        {buckets.map((bucket) => <div key={bucket.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{bucket.name || bucket.bucket}</strong>{activeId === bucket.id && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700">ACTIVE</span>}</div><p className="mt-1 text-xs text-slate-500">{bucket.bucket} · {bucket.region || 'auto'} · {bucket.endpoint}</p></div>
          {activeId !== bucket.id && <button type="button" disabled={bucketBusy || !bucket.hasCredentials} onClick={() => activate(bucket)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Test &amp; activate</button>}
        </div>)}
        {!buckets.length && <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No R2 bucket is configured yet. Import the current Railway configuration or add a bucket below.</p>}
      </div>
      <form onSubmit={addBucket} className="mt-5 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">Display name<input required value={bucketForm.name} onChange={e => setBucketForm(v => ({ ...v, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Primary R2" /></label>
        <label className="text-xs font-bold text-slate-600">Bucket name<input required value={bucketForm.bucket} onChange={e => setBucketForm(v => ({ ...v, bucket: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="my-bucket" /></label>
        <label className="text-xs font-bold text-slate-600 md:col-span-2">S3 API endpoint<input required type="url" value={bucketForm.endpoint} onChange={e => setBucketForm(v => ({ ...v, endpoint: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold text-slate-600">Region<input required value={bucketForm.region} onChange={e => setBucketForm(v => ({ ...v, region: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold text-slate-600">Access Key ID<input required autoComplete="off" value={bucketForm.accessKey} onChange={e => setBucketForm(v => ({ ...v, accessKey: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold text-slate-600 md:col-span-2">Secret Access Key<input required type="password" autoComplete="new-password" value={bucketForm.secretKey} onChange={e => setBucketForm(v => ({ ...v, secretKey: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <div className="md:col-span-2"><button disabled={bucketBusy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{bucketBusy ? 'Testing and saving…' : 'Test & add R2 bucket'}</button><p className="mt-2 text-[11px] text-slate-500">Credentials are encrypted in QuickChat platform settings and never returned to the browser.</p></div>
      </form>
    </div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">R2 database backups</h3><p className="mt-1 text-xs text-slate-500">Archives are saved under backups/ in the active bucket. Media referenced by the database is included from uploads/.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Backup archive</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{backups.map(b => <tr key={b.id}><td className="px-5 py-4 font-bold text-slate-800">{b.filename}<div className="mt-1 text-[10px] font-semibold uppercase text-emerald-700">{b.storage || 'legacy local'} storage</div></td><td className="px-4 py-4 text-xs text-slate-500">{b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}</td><td className="px-4 py-4 text-xs">{b.sizeBytes ? (b.sizeBytes / 1048576).toFixed(2) + ' MB' : '—'}</td><td className="px-4 py-4 text-right"><div className="flex justify-end gap-2"><button disabled={busy} onClick={() => download(b)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold disabled:opacity-50">Download</button>{can('backups.create') && <button disabled={busy} onClick={() => restore(b)} className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800 disabled:opacity-50">Recover backed up data</button>}{can('backups.delete') && <button disabled={busy} onClick={() => remove(b)} className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700 disabled:opacity-50">Delete</button>}</div></td></tr>)}</tbody></table></div>
      {!backups.length && <p className="p-10 text-center text-sm text-slate-400">No R2 backups yet. Create the first database backup now.</p>}
    </div>

    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">Google Drive legacy recovery</h3><p className="mt-1 text-xs text-slate-500">Previously configured Drive backups remain available where configured.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Drive file</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Size</th></tr></thead><tbody className="divide-y divide-slate-100">{drive.map(f => <tr key={f.id}><td className="px-5 py-4 font-bold text-slate-800">{f.name}</td><td className="px-4 py-4 text-xs text-slate-500">{f.createdTime ? new Date(f.createdTime).toLocaleString() : '—'}</td><td className="px-4 py-4 text-xs">{f.size ? (Number(f.size) / 1048576).toFixed(2) + ' MB' : '—'}</td></tr>)}</tbody></table></div>
      {!drive.length && <p className="p-8 text-center text-xs text-slate-400">No Google Drive backups available.</p>}
    </div>
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Recovery warning:</strong> recovery replaces current database rows. Create a fresh R2 backup before restoring production data.</div>
  </section>;
}
