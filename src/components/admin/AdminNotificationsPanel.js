import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

const EMPTY = { title: '', message: '', audience: 'everyone', channels: ['in_app'] };
const CHANNELS = [
  ['in_app', 'In-app notification', 'Appears in the QuickChat notification inbox.'],
  ['push', 'Browser push', 'Delivered to subscribed browsers, including when QuickChat is in the background.'],
  ['email', 'Email notification', 'Sent through the configured email provider.'],
  ['popup', 'In-app popup', 'Shown as an in-app announcement popup.'],
];

export default function AdminNotificationsPanel() {
  const [form, setForm] = useState(EMPTY);
  const [campaigns, setCampaigns] = useState([]);
  const [pushStatus, setPushStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      adminRequest('/admin/notifications'),
      adminRequest('/admin/notifications/status'),
    ]);
    if (results[0].status === 'fulfilled') setCampaigns(results[0].value.campaigns || []);
    else throw results[0].reason;
    if (results[1].status === 'fulfilled') setPushStatus(results[1].value);
    else setPushStatus({ pushAvailable: false, subscribedDevices: 0, subscribedUsers: 0 });
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const toggle = (channel) => setForm((f) => ({
    ...f,
    channels: f.channels.includes(channel)
      ? f.channels.filter((x) => x !== channel)
      : [...f.channels, channel],
  }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest('/admin/notifications', { method: 'POST', body: form });
      setNotice(result.message + ' Audience: ' + result.recipients + '. Delivery runs in the background.');
      setForm(EMPTY);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Notification centre</h2>
            <p className="mt-1 text-sm text-slate-500">Send announcements through QuickChat inbox, browser push, email and in-app popups.</p>
          </div>
          <button type="button" onClick={() => load().catch((e) => setError(e.message))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <i className="fa-solid fa-rotate mr-2" />Refresh status
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Browser push service</p>
            <p className={`mt-1 text-sm font-extrabold ${pushStatus?.pushAvailable ? 'text-emerald-700' : 'text-rose-700'}`}>
              {pushStatus ? (pushStatus.pushAvailable ? 'Ready' : 'Not configured') : 'Checking…'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Subscribed users</p>
            <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{pushStatus ? Number(pushStatus.subscribedUsers || 0).toLocaleString() : '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Registered devices</p>
            <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{pushStatus ? Number(pushStatus.subscribedDevices || 0).toLocaleString() : '—'}</p>
          </div>
        </div>
        {!pushStatus?.pushAvailable && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            Browser push is currently unavailable on the server. Check the VAPID configuration and web-push service before sending a push campaign.
          </p>
        )}
        {pushStatus?.pushAvailable && !Number(pushStatus.subscribedUsers) && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            Push is ready, but no users have registered a browser yet. Users must enable notifications in their QuickChat notification settings on each device.
          </p>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Notification title
            <input required maxLength="160" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Important QuickChat announcement" />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Message
            <textarea required rows="4" maxLength="4000" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Write the announcement users will receive…" />
          </label>

          <fieldset>
            <legend className="mb-2 text-xs font-bold text-slate-700">Delivery channels</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNELS.map(([value, label, description]) => (
                <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${form.channels.includes(value) ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-white'}`}>
                  <input type="checkbox" checked={form.channels.includes(value)} onChange={() => toggle(value)} className="mt-0.5" />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">{label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
                  </span>
                </label>
              ))}
            </div>
            {form.channels.includes('push') && (
              <p className="mt-2 text-[11px] leading-5 text-slate-500">Push is sent only to users with an active browser subscription and granted notification permission. Users without a subscription still receive other selected channels.</p>
            )}
          </fieldset>

          <label className="block text-xs font-bold text-slate-700">
            Audience
            <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {[
                ['everyone', 'Everyone'],
                ['verified', 'Verified users'],
                ['active', 'Active in last 30 days'],
                ['inactive', 'Inactive for 30+ days'],
                ['new_users', 'Joined in last 7 days'],
              ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button disabled={busy || !form.channels.length} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {busy ? 'Queueing campaign…' : 'Send notification'}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h3 className="font-extrabold text-slate-900">Campaign history</h3>
          <p className="mt-1 text-xs text-slate-500">Delivery totals include each selected channel. Push failures include users without an active subscription.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="text-sm text-slate-900">{campaign.title}</strong>
                <span className="text-xs font-bold capitalize text-blue-700">{String(campaign.status).replaceAll('_', ' ')}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{campaign.audience} · {campaign.channels} · {new Date(campaign.created_at).toLocaleString()}</p>
              <p className="mt-2 text-xs text-slate-600">{campaign.sent_count}/{campaign.recipient_count} deliveries processed · {campaign.failed_count} failed</p>
            </div>
          ))}
          {!campaigns.length && <p className="p-6 text-sm text-slate-500">No notification campaigns yet.</p>}
        </div>
      </section>
    </div>
  );
}
