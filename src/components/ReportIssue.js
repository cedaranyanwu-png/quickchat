import React, { useState } from 'react';
import { apiRequest } from '../api';

export default function ReportIssue() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('bug');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const text = description.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await apiRequest('/reports', {
        method: 'POST',
        body: {
          entityType: 'bug',
          entityId: window.location.pathname,
          category,
          description: text + ' [Page: ' + window.location.pathname + ']',
        },
      });
      setDescription('');
      setNotice('Thanks. Your issue has been sent to QuickChat moderators.');
    } catch (error) {
      setNotice(error.message || 'Could not submit the report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setNotice(''); }} className="fixed bottom-36 right-4 z-40 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-md transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 lg:bottom-6 lg:right-6" aria-label="Report a bug or issue" title="Report a bug or issue">
        <i className="fa-solid fa-bug text-xs" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Report a bug or issue">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-blue-700">QuickChat support</p><h2 className="mt-1 text-lg font-black text-slate-900">Report a bug or issue</h2><p className="mt-1 text-xs leading-5 text-slate-500">Describe the problem and it will enter the same moderation workflow used by administrators and moderators.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close report"><i className="fa-solid fa-xmark" /></button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500">
                <option value="bug">Bug / something is broken</option><option value="issue">Account or feature issue</option><option value="performance">Slow or performance problem</option><option value="other">Other technical issue</option>
              </select>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} rows={6} required placeholder="Example: Messages are not appearing after I open a conversation…" className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white" />
              {notice && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{notice}</p>}
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="submit" disabled={busy || !description.trim()} className="rounded-full bg-blue-700 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{busy ? 'Sending…' : 'Send report'}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
