import React, { useEffect, useState } from 'react';
import { adminRequest } from '../../api';
import GoogleSearchConsolePanel from './GoogleSearchConsolePanel';

export default function AdminSettingsPanel() {
  const [form, setForm] = useState({ boost_synthetic_test_mode: false, verification_points: 2000, verification_reward_points: 2000, flw_env: 'live', flw_client_id: '', flw_client_secret: '', flw_encryption_key: '', flw_webhook_secret: '', flw_webhook_url: 'https://quickchat-production-d5e5.up.railway.app/api/webhooks/flutterwave', public_app_url: 'https://quickchat-production-d5e5.up.railway.app', google_drive_enabled: false, google_drive_client_id: '', google_drive_client_secret: '', google_drive_refresh_token: '', google_drive_folder_id: '', gemini_enabled: false, gemini_api_key: '', gemini_model: 'gemini-3.8-flash', email_provider_mode: 'brevo', brevo_api_key: '', resend_api_key: '', smtp_user: '', smtp_password: '', smtp_from: '', smtp_host: '', smtp_port: '587', smtp_secure: false });
  const [testingGemini, setTestingGemini] = useState(false);
  const [sitemapCustomUrls, setSitemapCustomUrls] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState('');
  const [emailTestMessage, setEmailTestMessage] = useState('');
  const [geminiMessage, setGeminiMessage] = useState('');
  const [bots, setBots] = useState([]); const [botTotal, setBotTotal] = useState(0); const [botCount, setBotCount] = useState(100); const [generatingBots, setGeneratingBots] = useState(false); const [botMessage, setBotMessage] = useState('');
  const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(true); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const load = async () => { try { const data = await adminRequest('/admin/settings'); const settings = { ...data.settings }; if (!settings.email_provider_mode) settings.email_provider_mode = 'brevo'; settings.smtp_port = settings.smtp_port || '587'; settings.smtp_secure = String(settings.smtp_secure || 'false').toLowerCase() === 'true'; if (!settings.gemini_model || ['gemini-2.5-flash', 'gemini-2.5-pro', 'models/gemini-2.5-flash', 'models/gemini-2.5-pro'].includes(settings.gemini_model)) settings.gemini_model = 'gemini-3.8-flash'; setForm(v => ({ ...v, ...settings }));
      try { const custom = JSON.parse(settings.seo_sitemap_custom_urls || '[]'); setSitemapCustomUrls(Array.isArray(custom) ? custom.map(item => item.url || '').filter(Boolean).join('\n') : ''); } catch (_e) { setSitemapCustomUrls(''); } } catch (e) { setError(e.message || 'Unable to load platform settings.'); } finally { setLoading(false); } };
  const loadBots = async () => { try { const data = await adminRequest('/admin/bots'); setBots(data.bots || []); setBotTotal(Number(data.total || 0)); } catch (e) { setBotMessage(e.message || 'Unable to load bot accounts.'); } };
  useEffect(() => { load(); loadBots(); }, []);
  const generateBots = async () => { const count = Math.max(1, Math.min(10000, Number(botCount) || 1)); setGeneratingBots(true); setBotMessage(''); try { const result = await adminRequest('/admin/bots/generate', { method: 'POST', body: { count } }); setBotMessage(result.message || 'Bot accounts generated.'); await loadBots(); } catch (e) { setBotMessage(e.message || 'Bot generation failed.'); } finally { setGeneratingBots(false); } };
  const setBotStatus = async (id, status) => { try { await adminRequest(`/admin/bots/${id}`, { method: 'PATCH', body: { status } }); await loadBots(); } catch (e) { setBotMessage(e.message || 'Unable to update bot.'); } };
  const save = async (e) => { e.preventDefault(); setSaving(true); setError(''); setMessage(''); try { const customUrls = sitemapCustomUrls.split(/\r?\n/).map(url => url.trim()).filter(Boolean).slice(0, 5000).map(url => ({ url, priority: '0.5', changefreq: 'weekly' }));
      await adminRequest('/admin/settings', { method: 'PUT', body: { ...form, seo_sitemap_custom_urls: JSON.stringify(customUrls) } }); setMessage('Platform configuration saved securely.'); } catch (e) { setError(e.message || 'Unable to save configuration.'); } finally { setSaving(false); } };
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
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div><h3 className="font-extrabold text-slate-900">TypeSafe AI · Jev decision engine</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Configure Jev for QuickChat's recommendation and decision layer. Credentials stay encrypted server-side and are never exposed to the frontend.</p></div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={Boolean(form.typesafe_jev_enabled)} onChange={e => update('typesafe_jev_enabled', e.target.checked)} /> Enable Jev</label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-700 md:col-span-2">TypeSafe API key<input type="password" autoComplete="new-password" value={form.typesafe_api_key || ''} onChange={e => update('typesafe_api_key', e.target.value)} placeholder="Paste your TypeSafe API key" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Jev model<input value={form.typesafe_jev_model || 'jev-latest'} onChange={e => update('typesafe_jev_model', e.target.value)} placeholder="jev-latest" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Candidate count<input type="number" min="4" max="20" value={form.jev_recommendation_candidates || 12} onChange={e => update('jev_recommendation_candidates', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Minimum confidence<input type="number" min="0" max="1" step="0.01" value={form.jev_recommendation_min_confidence || 0.55} onChange={e => update('jev_recommendation_min_confidence', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
        <label className="text-xs font-bold text-slate-700">Jev score weight<input type="number" min="0" step="0.1" value={form.jev_recommendation_score_weight || 2} onChange={e => update('jev_recommendation_score_weight', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
      </div>
      <p className="text-[11px] leading-5 text-slate-500">Recommended flow: keep QuickChat's deterministic ranking as the safety and eligibility layer, then let Jev rerank only the strongest candidates. If Jev is unavailable, QuickChat automatically falls back to its existing algorithm.</p>
    </section>
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-4">
      <div><h3 className="font-extrabold text-slate-900">SEO indexing · profiles, spaces and posts</h3>
      <p className="mt-1 text-xs leading-5 text-slate-600">Public human profiles are automatically included in the sitemap. Public channels, pages, communities and public post share pages are also discovered automatically. Add additional public URLs below when you create landing pages outside those automatic routes.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white/80 p-3 text-xs"><div className="font-black text-slate-900">Automatic</div><div className="mt-1 text-slate-500">Profiles, spaces and public posts</div></div>
        <div className="rounded-xl bg-white/80 p-3 text-xs"><div className="font-black text-slate-900">Images</div><div className="mt-1 text-slate-500">Profile and public post images are added to the image sitemap data.</div></div>
        <div className="rounded-xl bg-white/80 p-3 text-xs"><div className="font-black text-slate-900">Crawler endpoints</div><div className="mt-1 text-slate-500">/sitemap.xml and /robots.txt</div></div>
      </div>
      <label className="block text-xs font-bold text-slate-700">Additional public sitemap URLs <span className="font-normal text-slate-400">(one URL per line)</span>
        <textarea value={sitemapCustomUrls} onChange={e => setSitemapCustomUrls(e.target.value)} rows="7" placeholder="/about\n/contact\n/creator-program" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-mono" />
      </label>
      <p className="text-[11px] leading-5 text-slate-500">Only add public pages. Do not add admin, settings, private messages, API endpoints or other authenticated URLs.</p>
    </section>
    <GoogleSearchConsolePanel />
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
      <div>
        <h3 className="font-extrabold text-slate-900">Google Search Console · HTML verification file</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Upload the exact HTML verification file downloaded from Google Search Console. QuickChat will serve it at the root of your public domain so Google can fetch it without signing in.</p>
      </div>
      <label className="block text-xs font-bold text-slate-700">Google verification HTML file
        <input type="file" accept=".html,text/html" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (!file.name.toLowerCase().endsWith('.html')) { setError('Choose the .html verification file downloaded from Google.'); event.target.value = ''; return; }
          if (file.size > 65536) { setError('The verification HTML file must be 64 KB or smaller.'); event.target.value = ''; return; }
          try {
            const content = await file.text();
            update('google_site_verification_filename', file.name);
            update('google_site_verification_html', content);
            setError('');
            setMessage(file.name + ' loaded. Click Save configuration below to publish it.');
          } catch (_error) { setError('Unable to read the selected verification file.'); }
        }} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" />
      </label>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Selected verification file</div>
        <div className="mt-1 break-all text-sm font-bold text-slate-800">{form.google_site_verification_filename || 'No verification file uploaded yet'}</div>
        {form.google_site_verification_filename && <a className="mt-2 inline-block text-xs font-bold text-blue-700 underline" href={'/' + encodeURIComponent(form.google_site_verification_filename)} target="_blank" rel="noreferrer">Open public verification URL</a>}
        <p className="mt-2 text-[11px] leading-5 text-slate-500">The public URL will be https://your-domain/{'{'}filename{'}'}. Keep the original filename unchanged. Uploading a new file replaces the previous configured verification file.</p>
      </div>
      <label className="block text-xs font-bold text-slate-700">Google verification meta tag <span className="font-normal text-slate-400">(optional alternative)</span>
        <input value={form.google_site_verification_meta || ''} onChange={e => update('google_site_verification_meta', e.target.value)} placeholder='<meta name="google-site-verification" content="..." />' className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" />
      </label>
      <label className="block text-xs font-bold text-slate-700">Bing verification meta tag <span className="font-normal text-slate-400">(optional)</span>
        <input value={form.bing_site_verification_meta || ''} onChange={e => update('bing_site_verification_meta', e.target.value)} placeholder='<meta name="msvalidate.01" content="..." />' className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" />
      </label>
      <p className="text-[11px] leading-5 text-slate-500">After saving, return to Search Console and click Verify. The file must remain available at the exact root URL Google supplied.</p>
    </section>
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
        <div><h3 className="font-extrabold text-slate-900">QuickChat email delivery</h3><p className="mt-1 text-xs leading-5 text-slate-600">Brevo API is recommended for Railway because it sends over HTTPS and does not require SMTP ports. Gmail App Password and custom SMTP remain available on hosting platforms that permit outbound SMTP. API keys and passwords are encrypted on the server.</p></div>
        <label className="block max-w-sm text-xs font-bold text-slate-700">Email provider
          <select value={form.email_provider_mode || 'resend'} onChange={e => update('email_provider_mode', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <option value="brevo">Brevo API · Recommended for Railway</option><option value="resend">Resend API</option><option value="gmail">Google Gmail · App Password (SMTP)</option><option value="custom">My server · Custom SMTP</option><option value="env">Use server environment provider</option>
          </select>
        </label>
        {(form.email_provider_mode === 'brevo' || form.email_provider_mode === 'resend') && <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-700 md:col-span-2">{form.email_provider_mode === 'brevo' ? 'Brevo API key' : 'Resend API key'}<input type="password" autoComplete="new-password" value={form.email_provider_mode === 'brevo' ? (form.brevo_api_key || '') : (form.resend_api_key || '')} onChange={e => update(form.email_provider_mode === 'brevo' ? 'brevo_api_key' : 'resend_api_key', e.target.value)} placeholder={form.email_provider_mode === 'brevo' ? 'Paste your Brevo v3 API key' : 're_… (leave blank to keep the saved key)'} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700 md:col-span-2">Verified sender address<input value={form.smtp_from || ''} onChange={e => update('smtp_from', e.target.value)} placeholder="QuickChat <noreply@your-verified-domain.com>" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-sky-100 pt-4">
            <label className="min-w-[220px] flex-1 text-xs font-bold text-slate-700">Send test email to<input type="email" value={emailTestTo} onChange={e => setEmailTestTo(e.target.value)} placeholder="your-inbox@example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            <button type="button" disabled={testingEmail || !emailTestTo.trim()} onClick={async () => {
              setTestingEmail(true); setEmailTestMessage('');
              try {
                await adminRequest('/admin/settings', { method: 'PUT', body: {
                  email_provider_mode: form.email_provider_mode,
                  smtp_from: form.smtp_from,
                  ...(form.email_provider_mode === 'brevo' && form.brevo_api_key && !String(form.brevo_api_key).startsWith('••') ? { brevo_api_key: form.brevo_api_key } : {}),
                  ...(form.email_provider_mode === 'resend' && form.resend_api_key && !String(form.resend_api_key).startsWith('••') ? { resend_api_key: form.resend_api_key } : {}),
                  ...(form.email_provider_mode === 'gmail' || form.email_provider_mode === 'custom' ? {
                    smtp_user: form.smtp_user, smtp_password: form.smtp_password, smtp_host: form.smtp_host,
                    smtp_port: form.smtp_port, smtp_secure: form.smtp_secure,
                  } : {}),
                }});
                const result = await adminRequest('/admin/email/test', { method: 'POST', body: { to: emailTestTo } });
                setEmailTestMessage(result.message || 'Test email sent.');
                update(form.email_provider_mode === 'brevo' ? 'brevo_api_key' : 'resend_api_key', '');
              } catch (e) { setEmailTestMessage(e.message || 'Email test failed.'); }
              finally { setTestingEmail(false); }
            }} className="rounded-xl border border-sky-300 bg-white px-4 py-3 text-xs font-extrabold text-sky-800 disabled:opacity-50">{testingEmail ? 'Sending test…' : (form.email_provider_mode === 'brevo' ? 'Save & test Brevo' : 'Save & test Resend')}</button>
          </div>
          {emailTestMessage && <p className="text-xs font-semibold text-slate-700">{emailTestMessage}</p>}
          <p className="text-[11px] leading-5 text-slate-500">{form.email_provider_mode === 'brevo' ? 'Create a v3 API key in Brevo and verify your sender email or domain. Enter the API key and exact verified sender address here.' : 'Create an API key in Resend, verify your sending domain, then enter the key and sender address here. Resend onboarding sender is restricted to testing with your own account email.'}</p>
        </>}
        {(form.email_provider_mode === 'gmail' || form.email_provider_mode === 'custom') && <>
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
          <p className="text-[11px] leading-5 text-slate-500">Gmail uses smtp.gmail.com on port 465 with TLS automatically. Custom SMTP uses the host, port and encryption mode supplied by your mail host.</p>
        </>}
        {form.email_provider_mode === 'env' && <p className="text-xs text-slate-500">The server will use its configured environment email provider, if one is available.</p>}
      </section>
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-4">
        <div><h3 className="font-extrabold text-slate-900">Flutterwave v4 · payment credentials</h3><p className="mt-1 text-xs leading-5 text-slate-600">Manage the credentials used by QuickChat's v4 payment integration. Secret values are encrypted in the database and masked after saving. Changing the environment takes effect on the next payment request.</p></div>
        <label className="block max-w-sm text-xs font-bold text-slate-700">Payment environment<select value={form.flw_env || 'live'} onChange={e => update('flw_env', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="test">Sandbox · Test payments</option><option value="live">Live · Real payments</option></select></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">Client ID<input autoComplete="off" value={form.flw_client_id || ''} onChange={e => update('flw_client_id', e.target.value)} placeholder="Flutterwave v4 Client ID" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          <label className="text-xs font-bold text-slate-700">Client Secret<input type="password" autoComplete="new-password" value={form.flw_client_secret || ''} onChange={e => update('flw_client_secret', e.target.value)} placeholder="Leave blank to keep the saved secret" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          <label className="text-xs font-bold text-slate-700">Encryption Key<input type="password" autoComplete="new-password" value={form.flw_encryption_key || ''} onChange={e => update('flw_encryption_key', e.target.value)} placeholder="Leave blank to keep the saved key" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          <label className="text-xs font-bold text-slate-700">Webhook Secret<input type="password" autoComplete="new-password" value={form.flw_webhook_secret || ''} onChange={e => update('flw_webhook_secret', e.target.value)} placeholder="Leave blank to keep the saved secret" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Webhook URL<input value={form.flw_webhook_url || ''} onChange={e => update('flw_webhook_url', e.target.value)} placeholder="https://your-domain/api/webhooks/flutterwave" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          <label className="text-xs font-bold text-slate-700 md:col-span-2">Public app URL<input value={form.public_app_url || ''} onChange={e => update('public_app_url', e.target.value)} placeholder="https://your-domain" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
        </div>
        <p className="text-[11px] leading-5 text-slate-500">Use the v4 Client ID, Client Secret and Encryption Key from the selected Flutterwave environment. The webhook URL must point to this QuickChat deployment. Do not enter Flutterwave v3 public/secret keys here.</p>
      </section>
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
