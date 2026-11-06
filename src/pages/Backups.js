import React, { useEffect, useState } from 'react';
import { apiRequest, loadRuntimeConfig } from '../api';

const TABLE_LABELS = {
  profile: 'Profile',
  posts: 'Posts',
  videos: 'Videos',
  likes: 'Likes',
  reposts: 'Reposts',
  bookmarks: 'Bookmarks',
  replies: 'Replies',
  followers: 'Followers',
  following: 'Following',
  messages: 'Messages',
};

function csvForRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 'No records\r\n';
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  const safeCell = (value) => {
    let text = value === null || value === undefined
      ? ''
      : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Avoid spreadsheet formula injection when a CSV is opened in Excel/Sheets.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [columns.map(safeCell).join(','), ...rows.map((row) => columns.map((column) => safeCell(row?.[column])).join(','))].join('\r\n') + '\r\n';
}

function downloadCsv(filename, rows) {
  const blob = new Blob(['\ufeff', csvForRows(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function driveRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || `Google Drive request failed (${response.status}).`);
  }
  return body;
}

function requestDriveToken(clientId) {
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth || !clientId) {
      reject(new Error('Google Drive backup is not available. Check the Google OAuth client configuration and reload the app.'));
      return;
    }
    const tokenClient = oauth.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response?.error || !response?.access_token) {
          reject(new Error(response?.error_description || 'Google Drive authorization was not completed.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error?.message || 'Google Drive authorization failed.')),
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export default function Backups() {
  const [exportData, setExportData] = useState(null);
  const [googleClientId, setGoogleClientId] = useState(process.env.REACT_APP_GOOGLE_CLIENT_ID || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadExport = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/backups/export');
      setExportData(result);
    } catch (requestError) {
      setError(requestError.message || 'Could not prepare your backup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExport();
    if (!googleClientId) {
      loadRuntimeConfig().then((config) => {
        if (config?.googleClientId) setGoogleClientId(config.googleClientId);
      });
    }
  }, []);

  const saveToDrive = async () => {
    if (!exportData?.tables) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const token = await requestDriveToken(googleClientId);
      const date = new Date().toISOString().slice(0, 10);
      const folder = await driveRequest('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `QuickChat Backup ${date}`, mimeType: 'application/vnd.google-apps.folder' }),
      });
      const entries = Object.entries(exportData.tables);
      for (const [table, rows] of entries) {
        const filename = `quickchat-${table}-${date}.csv`;
        const created = await driveRequest('https://www.googleapis.com/drive/v3/files?fields=id,name', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: filename, mimeType: 'text/csv', parents: [folder.id] }),
        });
        const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(created.id)}?uploadType=media`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv; charset=utf-8' },
          body: `\ufeff${csvForRows(rows)}`,
        });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.json().catch(() => ({}));
          throw new Error(detail.error?.message || `Could not upload ${filename}.`);
        }
      }
      setNotice(`Backup saved to Google Drive in “${folder.name}”.${folder.webViewLink ? ` Open folder: ${folder.webViewLink}` : ''}`);
    } catch (requestError) {
      setError(requestError.message || 'Could not save your backup to Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="mx-auto min-h-full max-w-3xl px-4 pb-24 pt-5 lg:pb-12">
    <header className="mb-5">
      <h1 className="text-xl font-extrabold text-slate-900">Back up your QuickChat data</h1>
      <p className="mt-1 text-sm leading-6 text-slate-600">Export your own profile, posts, videos, interactions, and message history as CSV files, then save them in your Google Drive or download them.</p>
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className="fa-brands fa-google-drive" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">Save a CSV backup to Google Drive</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Google will ask you to authorize access. QuickChat uses the limited Drive file permission to create this backup folder and its CSV files. Your Google access token is kept in memory only.</p>
        </div>
      </div>
      <button type="button" onClick={saveToDrive} disabled={loading || busy || !exportData} className="mt-4 flex items-center justify-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <><i className="fa-solid fa-circle-notch fa-spin" /> Saving CSVs to Drive…</> : <><i className="fa-brands fa-google-drive" /> Back up to Google Drive</>}
      </button>
      {!googleClientId && <p className="mt-2 text-[11px] text-amber-700">Google Drive authorization needs a configured Google OAuth client ID.</p>}
    </section>

    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-slate-900">Download CSV files</h2><p className="mt-1 text-xs text-slate-500">Download each data category separately.</p></div>
        <button type="button" onClick={loadExport} disabled={loading || busy} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><i className="fa-solid fa-rotate-right mr-1" />Refresh</button>
      </div>
      {loading ? <p className="py-6 text-center text-xs text-slate-500"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Preparing your personal data export…</p> : (
        <div className="mt-3 divide-y divide-slate-100">
          {Object.entries(exportData?.tables || {}).map(([table, rows]) => <div key={table} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{TABLE_LABELS[table] || table}</p><p className="text-[10px] text-slate-500">{rows.length} {rows.length === 1 ? 'record' : 'records'}</p></div>
            <button type="button" onClick={() => downloadCsv(`quickchat-${table}-${new Date().toISOString().slice(0, 10)}.csv`, rows)} disabled={!rows.length} className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400">Download CSV</button>
          </div>)}
        </div>
      )}
    </section>

    {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
    <p className="mt-4 text-[11px] leading-5 text-slate-500">For privacy, this export is limited to data connected to your account. It is not a full server database dump and excludes passwords, login tokens, and other users’ profile data. Your message export includes conversations you participate in.</p>
  </div>;
}
