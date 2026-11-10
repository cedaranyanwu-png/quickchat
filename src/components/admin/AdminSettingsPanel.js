import React, { useEffect, useState } from 'react';
import { adminRequest } from '../../api';

export default function AdminSettingsPanel() {
  const [form, setForm] = useState({ boost_synthetic_test_mode: false, verification_points: 2000, verification_reward_points: 2000, flw_public_key: '', flw_secret_key: '', flw_secret_hash: '', flw_webhook_url: '', public_app_url: '', google_drive_enabled: false, google_drive_client_id: '', google_drive_client_secret: '', google_drive_refresh_token: '', google_drive_folder_id: '', gemini_enabled: false, gemini_api_key: '', gemini_model: 'gemini-3.8-flash', email_provider_mode: 'gmail', smtp_user: '', smtp_password: '', smtp_from: '', smtp_host: '', smtp_port: '587', smtp_secure: false });
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState('');
  const [emailTestMessage, setEmailTestMessage] = useState('');
  const [geminiMessage, setGeminiMessage] = useState('');
  const [bots, setBots] = useState([]); const [botTotal, setBotTotal] = useState(0); const [botCount, setBotCount] = useState(100); const [generatingBots, setGeneratingBots] = useState(false); const [botMessage, setBotMessage] = useState('');
  const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(true); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const load = async () => { try { const data = await adminRequest('/admin/settings'); const settings = { ...data.settings }; if (!settings.gemini_model || ['gemini-2.5-flash', 'gemini-2.5-pro', 'models/gemini-2.5-flash', 'models/gemini-2.5-pro'].includes(settings.gemini_model)) settings.gemini_model = 'gemini-3.8-flash'; setForm(v => ({ ...v, ...settings })); } catch (e) { setError(e.message || 'Unable to load platform settings.'); } finally { setLoading(false); } };
  const loadBots = async () => { try { const data = await adminRequest('/admin/bots'); setBots(data.bots || []); setBotTotal(Number(data.total || 0)); } catch (e) { setBotMessage(e.message || 'Unable to load bot accounts.'); } };
  useEffect(() => { load(); loadBots(); }, []);
  const generateBots = async () => { const count = Math.max(1, Math.min(10000, Number(botCount) || 1)); setGeneratingBots(true); setBotMessage(''); try { const result = await adminRequest('/admin/bots/generate', { method: 'POST', body: { count } }); setBotMessage(result.message || 'Bot accounts generated.'); await loadBots(); } catch (e) { setBotMessage(e.message || 'Bot generation failed.'); } finally { setGeneratingBots(false); } };
  const setBotStatus = async (id, status) => { try { await adminRequest(`/admin/bots/${id}`, { method: 'PATCH', body: { status } }); await loadBots(); } catch (e) { setBotMessage(e.message || 'Unable to update bot.'); } };
  const save = async (e) => { e.preventDefault(); setSaving(true); setError(''); setMessage(''); try { await adminRequest('/admin/settings', { method: 'PUT', body: form }); setMessage('Platform configuration saved securely.'); } catch (e) { setError(e.message || 'Unable to save configuration.'); } finally { setSaving(false); } };
  const testGemini = async () => {
    setTestingGemini(true); setGeminiMessage('');
    try {
      if (form.gemini_api_key && !String(form.gemini_api_key).startsWith('••')) {
        await adminRequest('/admin/settings', { method: 'PUT', body: { gemini_api_key: form.gemini_api_key, gemini_enabled: Boolean(form.gemini_enabled), gemini_model: form.gemini_model || 'gemini-3.8-flash' } });
      }
      const result = await adminRequest('/admin/gemini/test', { method: 'POST', body: {} });
      setGeminiMessage(result.message || 'Gemini connection successful.');
    } catch (e) { setGeminiMessage(e.message || 'Gemini connection failed.'); }
    finally { setTestingGemini(false); }
  };
  const update = (key, value) => setForm(v => ({ ...v, [key]: value }));
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading configuration…</div>;
  return <section><div className="mb-5"><h2 className="text-lg font-black text-slate-900">Platform configuration</h2><p className="mt-1 text-sm text-slate-500">Configure the paid verification price, verification reward points, Flutterwave project credentials and optional Google Drive backup storage.</p></div>
    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
    {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{message}</div>}
    <form onSubmit={save} className="space-y-5">
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4"><div><h3 className="font-extrabold text-slate-900">Gemini AI · character engine</h3><p className="mt-1 text-xs leading-5 text-slate-600">Connect Google's Gemini API to power the existing character accounts. The key is encrypted in platform settings and is never returned to the browser.</p></div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={Boolean(form.gemini_enabled)} onChange={e => update('gemini_enabled', e.target.checked)} /> Enable character AI</label></div>
      <label className="block text-xs font-bold text-slate-700">Gemini API key<input type="password" autoComplete="new-password" value={form.gemini_api_key || ''} onChange={e => update('gemini_api_key', e.target.value)} placeholder="Paste your Gemini API key" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
      <label className="block max-w-sm text-xs font-bold text-slate-700">Gemini model<select value={form.gemini_model || 'gemini-3.8-flash'} onChange={e => update('gemini_model', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="gemini-3.8-flash">Gemini 3.8 Flash (recommended)</option></select></label>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={testingGemini} onClick={testGemini} className="rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-xs font-extrabold text-violet-800 disabled:opacity-50">{testingGemini ? 'Testing connection…' : 'Test Gemini connection'}</button>{geminiMessage && <span className="text-xs font-semibold text-slate-700">{geminiMessage}</span>}</div>
      <p className="text-[11px] leading-5 text-slate-500">Save or test after entering a key. Never place this key in frontend environment variables or commit it to GitHub. AI character accounts must be clearly identified as AI.</p>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div><h3 className="font-extrabold text-slate-900">Synthetic QA accounts</h3><p className="mt-1 text-xs leading-5 text-slate-500">Generate up to 10,000 Faker.js test profiles. Accounts are stored in the users table with an internal synthetic flag and indexed in the dedicated bots table. Bot follows and likes are tracked separately from genuine public engagement.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ['boost_synthetic_test_mode', 'Enable synthetic booster QA delivery'],
          ['bots_enabled', 'Enable bot test activity'],
          ['bots_show_find_friends', 'Show test profiles in Find Friends'],
          ['bots_show_home', 'Include test profiles in Home'],
          ['bots_show_explore', 'Include test profiles in Explore'],
        ].map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700"><span>{label}</span><input type="checkbox" checked={Boolean(form[key])} onChange={e => update(key, e.target.checked)} /></label>)}
      </div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-bold text-slate-700">Number of accounts<input type="number" min="1" max="10000" value={botCount} onChange={e => setBotCount(e.target.value)} className="mt-1.5 block w-36 rounded-xl border border-slate-200 p-2.5 text-sm" /></label><button type="button" disabled={generatingBots} onClick={generateBots} className="rounded-xl bg-blue-700 px-4 py-3 text-xs font-extrabold text-white disabled:opacity-50">{generatingBots ? 'Generating…' : 'Generate bot accounts'}</button><span className="text-xs font-semibold text-slate-500">{botTotal.toLocaleString()} accounts in bots table</span></div>
      {botMessage && <p className="text-xs font-semibold text-slate-600">{botMessage}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Account</th><th className="p-3">User ID</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{bots.map(bot => <tr key={bot.id} className="border-t border-slate-100"><td className="p-3"><div className="font-bold text-slate-800">{bot.display_name}</div><div className="text-slate-500">@{bot.username}</div></td><td className="p-3">{bot.user_id}</td><td className="p-3">{bot.status}</td><td className="p-3 text-right"><button type="button" onClick={() => setBotStatus(bot.id, bot.status === 'active' ? 'disabled' : 'active')} className="rounded-lg border border-slate-200 px-3 py-2 font-bold">{bot.status === 'active' ? 'Disable' : 'Enable'}</button></td></tr>)}{!bots.length && <tr><td colSpan="4" className="p-5 text-center text-slate-500">No bot accounts generated yet.</td></tr>}</tbody></table></div>
      <p className="text-[11px] text-slate-500">The visibility switches are configuration flags; they do not by themselves change public feed queries. Synthetic engagement remains isolated from public counters.</p>
    </section>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center justify-between gap-4">
        <div><h3 className="font-extrabold text-slate-900">Booster synthetic test activity</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">When enabled, synthetic/Faker accounts may be selected by the Account Booster test runner. Their activity is stored as isolated test events and does not alter public follower, like, or reach counters.</p></div>
        <button type="button" onClick={() => update('boost_synthetic_test_mode', !Boolean(form.boost_synthetic_test_mode))} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold ${form.boost_synthetic_test_mode ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{form.boost_synthetic_test_mode ? 'Enabled' : 'Disabled'}</button>
      </div><p className="mt-3 text-[11px] font-semibold text-amber-800">Test mode only. No bot/test badge is added to user profiles.</p>
    </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className="fa-solid fa-certificate" /></span><div><h3 className="font-extrabold text-slate-900">Paid user verification</h3><p className="mt-1 text-xs leading-5 text-slate-500">Normal user verification remains paid through the existing QuickChat points wallet. This setting controls the required points. Admin-granted verification is a separate special-consideration action.</p></div></div><label className="mt-4 block max-w-sm text-xs font-bold text-slate-700">Verification price (points)<input type="number" min="1" value={form.verification_points} onChange={e => update('verification_points', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><label className="mt-4 block max-w-sm text-xs font-bold text-slate-700">Reward points for a newly verified account<input type="number" min="0" max="1000000" value={form.verification_reward_points} onChange={e => update('verification_reward_points', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><p className="mt-2 text-[11px] text-slate-500">Awarded once whether verification is granted by an administrator or purchased by the user. 100 reward points convert to ₦1.</p></section>
      <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5 space-y-4">
        <div><h3 className="font-extrabold text-slate-900">QuickChat email delivery · SMTP</h3><p className="mt-1 text-xs leading-5 text-slate-600">Choose Gmail with an App Password or your own mail-server SMTP credentials. Passwords are encrypted in server settings and never returned to this page. Use a Google App Password, not your normal Google account password.</p></div>
        <label className="block max-w-sm text-xs font-bold text-slate-700">Email provider
          <select value={form.email_provider_mode || 'gmail'} onChange={e => update('email_provider_mode', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <option value="gmail">Google Gmail · App Password</option><option value="custom">My server · Custom SMTP</option><option value="env">Use server environment provider</option>
          </select>
        </label>
        {form.email_provider_mode !== 'env' && <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">SMTP username / Gmail address<input type="email" autoComplete="off" value={form.smtp_user || ''} onChange={e => update('smtp_user', e.target.value)} placeholder="you@gmail.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700">SMTP password / Google App Password<input type="password" autoComplete="new-password" value={form.smtp_password || ''} onChange={e => update('smtp_password', e.target.value)} placeholder="Leave blank to keep the saved password" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700">Sender address<input value={form.smtp_from || ''} onChange={e => update('smtp_from', e.target.value)} placeholder="QuickChat <you@gmail.com>" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            {form.email_provider_mode === 'custom' && <>
              <label className="text-xs font-bold text-slate-700">SMTP host<input value={form.smtp_host || ''} onChange={e => update('smtp_host', e.target.value)} placeholder="mail.yourdomain.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
              <label className="text-xs font-bold text-slate-700">SMTP port<input type="number" min="1" max="65535" value={form.smtp_port || '587'} onChange={e => update('smtp_port', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={Boolean(form.smtp_secure)} onChange={e => update('smtp_secure', e.target.checked)} /> Use implicit TLS (usually port 465)</label>
            </>}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-sky-100 pt-4">
            <label className="min-w-[220px] flex-1 text-xs font-bold text-slate-700">Send test email to<input type="email" value={emailTestTo} onChange={e => setEmailTestTo(e.target.value)} placeholder="your-inbox@example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            <button type="button" disabled={testingEmail || !emailTestTo.trim()} onClick={async () => {
              setTestingEmail(true); setEmailTestMessage('');
              try {
                await adminRequest('/admin/settings', { method: 'PUT', body: {
                  email_provider_mode: form.email_provider_mode, smtp_user: form.smtp_user, smtp_from: form.smtp_from,
                  smtp_host: form.smtp_host, smtp_port: form.smtp_port, smtp_secure: Boolean(form.smtp_secure),
                  ...(form.smtp_password && !String(form.smtp_password).startsWith('••') ? { smtp_password: form.smtp_password } : {}),
                }});
                const result = await adminRequest('/admin/email/test', { method: 'POST', body: { to: emailTestTo } });
                setEmailTestMessage(result.message || 'Test email sent.');
                update('smtp_password', '');
              } catch (e) { setEmailTestMessage(e.message || 'SMTP test failed.'); }
              finally { setTestingEmail(false); }
            }} className="rounded-xl border border-sky-300 bg-white px-4 py-3 text-xs font-extrabold text-sky-800 disabled:opacity-50">{testingEmail ? 'Sending test…' : 'Save & test email'}</button>
          </div>
          {emailTestMessage && <p className="text-xs font-semibold text-slate-700">{emailTestMessage}</p>}
          <p className="text-[11px] leading-5 text-slate-500">Gmail uses smtp.gmail.com on port 465 with TLS automatically. For custom SMTP, use the exact host, port and encryption mode supplied by your hosting provider.</p>
        </>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-extrabold text-slate-900">Flutterwave · project-wide</h3><p className="mt-1 text-xs text-slate-500">These credentials are stored encrypted on the server and are used by the project payment layer.</p><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">Public key<input value={form.flw_public_key || ''} onChange={e => update('flw_public_key', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Secret key<input type="password" value={form.flw_secret_key || ''} onChange={e => update('flw_secret_key', e.target.value)} placeholder="Leave masked value unchanged" className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Webhook hash<input type="password" value={form.flw_secret_hash || ''} onChange={e => update('flw_secret_hash', e.target.value)} placeholder="Leave masked value unchanged" className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Webhook URL<input value={form.flw_webhook_url || ''} onChange={e => update('flw_webhook_url', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700 md:col-span-2">Public app URL<input value={form.public_app_url || ''} onChange={e => update('public_app_url', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
      </div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold text-slate-900">Google Drive backup storage</h3><p className="mt-1 text-xs text-slate-500">Use OAuth credentials for the Google Drive account that owns the backup folder.</p></div><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={Boolean(form.google_drive_enabled)} onChange={e => update('google_drive_enabled', e.target.checked)} /> Enable Drive backups</label></div><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">OAuth client ID<input value={form.google_drive_client_id || ''} onChange={e => update('google_drive_client_id', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">OAuth client secret<input type="password" value={form.google_drive_client_secret || ''} onChange={e => update('google_drive_client_secret', e.target.value)} placeholder="Leave masked value unchanged" className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Refresh token<input type="password" value={form.google_drive_refresh_token || ''} onChange={e => update('google_drive_refresh_token', e.target.value)} placeholder="Leave masked value unchanged" className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Drive folder ID<input value={form.google_drive_folder_id || ''} onChange={e => update('google_drive_folder_id', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
      </div></section>
      <div className="flex justify-end"><button disabled={saving} className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-extrabold text-white disabled:opacity-50">{saving ? 'Saving securely…' : 'Save configuration'}</button></div>
    </form>
  </section>;
}
