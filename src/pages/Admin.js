import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, adminRequest } from '../api';

const NAV = [
  { key: 'overview', label: 'Overview', icon: 'fa-chart-pie', permission: 'dashboard.view' },
  { key: 'users', label: 'User management', icon: 'fa-users', permission: 'users.view' },
  { key: 'whatsapp', label: 'WhatsApp notifications', icon: 'fa-bell', permission: 'notifications.send' },
  { key: 'verification', label: 'User verification', icon: 'fa-circle-check', permission: 'verification.review' },
  { key: 'reports', label: 'Reports & complaints', icon: 'fa-flag', permission: 'reports.view' },
  { key: 'roles', label: 'Roles & permissions', icon: 'fa-shield-halved', permission: 'roles.view' },
  { key: 'audit', label: 'Audit logs', icon: 'fa-clock-rotate-left', permission: 'audit_logs.view' },
  { key: 'backups', label: 'Backup & recovery', icon: 'fa-database', permission: 'backups.view' },
  { key: 'settings', label: 'Admin settings', icon: 'fa-gear', permission: 'settings.manage' },
];

const metricCards = [
  ['totalUsers', 'Registered users', 'fa-users', 'blue'],
  ['newUsers30Days', 'New users · 30 days', 'fa-user-plus', 'violet'],
  ['pendingVerifications', 'Pending verification', 'fa-certificate', 'amber'],
  ['openReports', 'Open reports', 'fa-flag', 'rose'],
  ['suspendedAccounts', 'Suspended accounts', 'fa-user-lock', 'orange'],
  ['bannedAccounts', 'Banned accounts', 'fa-ban', 'slate'],
  ['verifiedUsers', 'Verified users', 'fa-circle-check', 'emerald'],
  ['communities', 'Communities', 'fa-people-group', 'cyan'],
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function Status({ value }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700',
    under_review: 'bg-blue-50 text-blue-700',
    escalated: 'bg-rose-50 text-rose-700',
    resolved: 'bg-emerald-50 text-emerald-700',
    dismissed: 'bg-slate-100 text-slate-600',
    approved: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-rose-50 text-rose-700',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${styles[value] || 'bg-slate-100 text-slate-600'}`}>{String(value || 'unknown').replace(/_/g, ' ')}</span>;
}

export default function Admin() {
  const [section, setSection] = useState('overview');
  const [identity, setIdentity] = useState(null);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [userPagination, setUserPagination] = useState(null);
  const [search, setSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [verifications, setVerifications] = useState([]);
  const [reports, setReports] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [backups, setBackups] = useState([]);
  const [whatsappConfig, setWhatsappConfig] = useState(false);
  const [whatsappLogs, setWhatsappLogs] = useState([]);
  const [whatsappForm, setWhatsappForm] = useState({ title: '', message: '' });
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappOffset, setWhatsappOffset] = useState(0);
  const [whatsappHasMore, setWhatsappHasMore] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [credentialForm, setCredentialForm] = useState({ currentPassword: '', newUsername: '', newPassword: '', confirmPassword: '' });
  const [credentialBusy, setCredentialBusy] = useState(false);

  const metricColors = { blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', orange: 'bg-orange-50 text-orange-600', slate: 'bg-slate-100 text-slate-600', emerald: 'bg-emerald-50 text-emerald-600', cyan: 'bg-cyan-50 text-cyan-600' };
  const allowed = useMemo(() => new Set(identity?.permissions || []), [identity]);
  const can = useCallback((permission) => allowed.has('*') || allowed.has(permission), [allowed]);
  const visibleNav = NAV.filter((item) => can(item.permission));

  const loadIdentity = useCallback(async () => {
    const data = await adminRequest('/admin/me');
    setIdentity(data);
    setCredentialForm((current) => ({ ...current, newUsername: data.admin?.username || '' }));
    if (data.admin?.mustChangePassword) setSection('settings');
    return data;
  }, []);

  const loadSection = useCallback(async (key = section, page = userPage, query = search) => {
    setLoading(true);
    setError('');
    try {
      if (key === 'overview') {
        const data = await adminRequest('/admin/overview');
        setOverview(data);
      } else if (key === 'users') {
        const data = await adminRequest(`/admin/users?page=${page}&limit=25&search=${encodeURIComponent(query)}`);
        setUsers(data.users || []);
        setUserPagination(data.pagination || null);
      } else if (key === 'verification') {
        const data = await adminRequest('/admin/verifications?status=pending');
        setVerifications(data.applications || []);
      } else if (key === 'reports') {
        const data = await adminRequest('/admin/reports?status=pending');
        setReports(data.reports || []);
      } else if (key === 'roles') {
        const data = await adminRequest('/admin/roles');
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
      } else if (key === 'audit') {
        const data = await adminRequest('/admin/audit-logs?limit=50');
        setAuditLogs(data.logs || []);
      } else if (key === 'backups') {
        const data = await adminRequest('/admin/backups');
        setBackups(data.backups || []);
        setBackupRunning(Boolean(data.running));
      } else if (key === 'whatsapp') {
        const data = await adminRequest('/admin/whatsapp/messages');
        setWhatsappConfig(Boolean(data.configured));
        setWhatsappLogs(data.logs || []);
      }
    } catch (err) {
      setError(err.message || 'Unable to load this administration section.');
    } finally {
      setLoading(false);
    }
  }, [section, userPage, search]);

  useEffect(() => {
    if (!localStorage.getItem('adminToken')) { setLoading(false); return; }
    loadIdentity().catch((err) => { setIdentity(null); setError(err.message || 'Administrative access is unavailable.'); setLoading(false); });
  }, [loadIdentity]);

  useEffect(() => {
    if (identity) loadSection(section);
  }, [identity, section, loadSection]);

  const submitAdminLogin = async (event) => {
    event.preventDefault(); setLoginBusy(true); setError('');
    try {
      const result = await adminRequest('/admin/auth/login', { method: 'POST', body: loginForm });
      localStorage.setItem('adminToken', result.token); setIdentity(null); await loadIdentity();
      setNotice(result.admin?.mustChangePassword ? 'Initial sign-in successful. Update your username and password to continue.' : 'Administrator sign-in successful.');
    } catch (err) { setError(err.message || 'Administrator sign-in failed.'); }
    finally { setLoginBusy(false); setLoading(false); }
  };

  const submitCredentialChange = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    if (credentialForm.newPassword && credentialForm.newPassword.length < 12) { setError('Use at least 12 characters for the new password.'); return; }
    if (credentialForm.newPassword !== credentialForm.confirmPassword) { setError('The new password and confirmation do not match.'); return; }
    if (identity?.admin?.mustChangePassword && !credentialForm.newPassword) { setError('Set a new password before entering the administration centre.'); return; }
    setCredentialBusy(true);
    try {
      const result = await adminRequest('/admin/auth/credentials', { method: 'POST', body: { currentPassword: credentialForm.currentPassword, newUsername: credentialForm.newUsername, newPassword: credentialForm.newPassword } });
      if (result.token) localStorage.setItem('adminToken', result.token);
      setCredentialForm({ currentPassword: '', newUsername: result.admin?.username || '', newPassword: '', confirmPassword: '' });
      await loadIdentity(); setSection('overview'); setNotice(result.message || 'Administrator credentials updated.');
    } catch (err) { setError(err.message || 'Unable to update administrator credentials.'); }
    finally { setCredentialBusy(false); }
  };

  const logoutAdmin = () => { localStorage.removeItem('adminToken'); setIdentity(null); setSection('overview'); setError(''); setNotice(''); };

  const changeSection = (key) => {
    setNotice('');
    setError('');
    setSection(key);
    setUserPage(1);
  };

  const reviewVerification = async (application, decision) => {
    const note = window.prompt(`Internal review note for ${decision.replace('_', ' ')}:`, '');
    if (note === null) return;
    setBusyId(application.id);
    try {
      await adminRequest(`/admin/verifications/${application.id}/decision`, { method: 'POST', body: { decision, note } });
      setNotice(`Verification ${decision.replace('_', ' ')}.`);
      await loadSection('verification');
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  };

  const resolveReport = async (report, status) => {
    const resolution = window.prompt(`Resolution note for report #${report.id}:`, '');
    if (!resolution?.trim()) return;
    setBusyId(report.id);
    try {
      await adminRequest(`/admin/reports/${report.id}/resolve`, { method: 'POST', body: { status, resolution } });
      setNotice(`Report #${report.id} updated.`);
      await loadSection('reports');
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  };

  const actOnUser = async (user, action) => {
    const reason = window.prompt(`Reason for ${action.replace('-', ' ')} on ${user.username}:`, '');
    if (!reason?.trim()) return;
    if (action === 'ban' && !window.confirm(`Permanently ban ${user.username}? This blocks authenticated platform access.`)) return;
    if (action === 'delete-request' && !window.confirm(`Schedule a deletion review for ${user.username}? No data will be deleted immediately.`)) return;
    const durationHours = action === 'suspend' ? Number(window.prompt('Suspension duration in hours (1–8760):', '24')) : undefined;
    if (action === 'suspend' && (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 8760)) return;
    setBusyId(user.id);
    try {
      const endpoint = action === 'delete-request' ? 'deletion-request' : action;
      await adminRequest(`/admin/users/${user.id}/${endpoint}`, {
        method: 'POST',
        body: { reason, ...(durationHours ? { durationHours } : {}) },
      });
      setNotice(`Account action completed for ${user.username}.`);
      await loadSection('users');
    } catch (err) { setError(err.message); }
    finally { setBusyId(null); }
  };

  const sendWhatsAppBroadcast = async (event) => {
    event.preventDefault();
    if (!whatsappForm.title.trim() || !whatsappForm.message.trim()) return;
    if (!window.confirm(whatsappOffset > 0 ? 'Send the next batch of this WhatsApp notification?' : 'Send this WhatsApp notification to verified users who opted in to QuickChat WhatsApp notifications?')) return;
    setWhatsappBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest('/admin/whatsapp/messages', {
        method: 'POST',
        body: { target: 'all', offset: whatsappOffset, title: whatsappForm.title.trim(), message: whatsappForm.message.trim() },
      });
      setNotice(`Batch processed: ${result.accepted || 0} accepted by Meta, ${result.failed || 0} failed, ${result.total || 0} recipients.`);
      setWhatsappOffset(result.nextOffset || 0);
      setWhatsappHasMore(Boolean(result.hasMore));
      await loadSection('whatsapp');
    } catch (err) {
      setError(err.message || 'WhatsApp notification could not be sent.');
    } finally {
      setWhatsappBusy(false);
    }
  };

  const createPlatformBackup = async () => {
    if (!window.confirm('Create a full QuickChat database and uploaded-media backup now?')) return;
    setBackupBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest('/admin/backups', { method: 'POST', body: { reason: 'Manual backup from admin dashboard' } });
      setNotice(result.message || 'Backup created.');
      await loadSection('backups');
    } catch (err) { setError(err.message || 'Backup creation failed.'); }
    finally { setBackupBusy(false); }
  };

  const downloadPlatformBackup = async (backup) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE_URL}/admin/backups/${encodeURIComponent(backup.filename)}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Backup download failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  };

  const deletePlatformBackup = async (backup) => {
    if (!window.confirm(`Permanently delete backup ${backup.filename}? This cannot be undone.`)) return;
    setBackupBusy(true);
    try {
      await adminRequest(`/admin/backups/${encodeURIComponent(backup.filename)}`, { method: 'DELETE' });
      setNotice('Backup deleted.');
      await loadSection('backups');
    } catch (err) { setError(err.message); }
    finally { setBackupBusy(false); }
  };

  const createRole = async () => {
    const name = window.prompt('New role name:');
    if (!name?.trim()) return;
    const key = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const selected = window.prompt('Permission keys (comma-separated). Only permissions you already hold can be granted:', '');
    const requested = (selected || '').split(',').map((item) => item.trim()).filter(Boolean);
    try {
      await adminRequest('/admin/roles', { method: 'POST', body: { name, key, permissions: requested } });
      setNotice('Role created.');
      await loadSection('roles');
    } catch (err) { setError(err.message); }
  };

  if (!identity && loading) return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" /><p className="mt-3 text-sm font-semibold text-slate-500">Checking administrative access…</p></div></div>;
  if (!identity) return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1426] px-4 py-10">
    <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
    <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl lg:grid-cols-[1.05fr_.95fr]">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-[#14284b] via-[#10203a] to-[#091426] p-12 text-white lg:flex">
        <div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl"><i className="fa-solid fa-shield-halved" /></div><p className="mt-8 text-xs font-extrabold uppercase tracking-[.24em] text-blue-300">QuickChat / Control</p><h1 className="mt-4 max-w-sm text-4xl font-black leading-tight tracking-tight">Platform administration, in one secure workspace.</h1><p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">Manage accounts, verification, reports, permissions and platform operations from a dedicated administrator portal.</p></div>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Independent administrator authentication</div>
      </div>
      <div className="p-7 sm:p-11 lg:p-12">
        <div className="mb-8 flex items-center gap-3 lg:hidden"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-lg text-white"><i className="fa-solid fa-shield-halved" /></div><div><p className="font-black text-slate-900">QuickChat</p><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-600">Administration</p></div></div>
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">Administrator access</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Sign in</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use your administration credentials. QuickChat user accounts are not accepted here.</p>
        {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <form onSubmit={submitAdminLogin} className="mt-7 space-y-5">
          <label className="block text-sm font-bold text-slate-700">Administrator username<input autoComplete="username" value={loginForm.username} onChange={(event) => setLoginForm((form) => ({ ...form, username: event.target.value }))} required className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" /></label>
          <label className="block text-sm font-bold text-slate-700">Password<input type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm((form) => ({ ...form, password: event.target.value }))} required className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" /></label>
          <button disabled={loginBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-60">{loginBusy ? 'Signing in…' : 'Sign in to administration'}</button>
        </form>
        <a href="/login" className="mt-7 inline-flex items-center gap-2 text-xs font-bold text-slate-500 no-underline hover:text-blue-700"><i className="fa-solid fa-arrow-left" /> Back to QuickChat</a>
        <p className="mt-8 border-t border-slate-100 pt-5 text-[11px] leading-5 text-slate-400">Protected administrator portal · Separate from member authentication</p>
      </div>
    </section>
  </main>;

  const title = NAV.find((item) => item.key === section)?.label || 'Administration';

  return <div className="flex min-h-screen bg-[#f5f7fb] text-slate-800">
    <aside className="hidden w-[258px] shrink-0 flex-col bg-[#101b32] text-white lg:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg shadow-lg shadow-blue-950/30"><i className="fa-solid fa-comments" /></div>
        <div><div className="text-[15px] font-black tracking-tight">QuickChat</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.2em] text-blue-300">Administration</div></div>
      </div>
      <div className="px-4 pt-7"><p className="px-3 text-[10px] font-extrabold uppercase tracking-[.18em] text-slate-500">Workspace</p>
        <nav className="mt-3 space-y-1">
          {visibleNav.map((item) => <button key={item.key} onClick={() => changeSection(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold transition ${section === item.key ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}><i className={`fa-solid ${item.icon} w-4 text-center`} />{item.label}{section === item.key && <i className="fa-solid fa-chevron-right ml-auto text-[10px]" />}</button>)}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-5">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-blue-500/20 text-sm font-black text-blue-200">{(identity.roles?.[0]?.name || 'A').slice(0, 1)}</div><div className="min-w-0"><p className="truncate text-xs font-bold">{identity.roles?.[0]?.name || 'Administrator'}</p><p className="mt-0.5 text-[10px] text-slate-400">Secure admin session</p></div></div>
        <a href="/home" className="mt-4 flex items-center gap-2 px-2 text-xs font-semibold text-slate-400 no-underline hover:text-white"><i className="fa-solid fa-arrow-left" /> Back to QuickChat</a>
      </div>
    </aside>
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-8">
        <div><div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-blue-600">Platform governance</div><h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">{title}</h1></div>
        <div className="flex items-center gap-2"><span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 sm:inline-flex"><span className="mr-2 mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />Permission checked</span><button onClick={() => loadSection(section)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" title="Refresh"><i className={`fa-solid fa-rotate-right ${loading ? 'animate-spin' : ''}`} /></button><button onClick={logoutAdmin} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:border-rose-200 hover:text-rose-700"><i className="fa-solid fa-right-from-bracket mr-2" />Sign out</button></div>
      </header>
      <div className="border-b border-slate-200 bg-white px-3 py-2 lg:hidden"><div className="flex gap-2 overflow-x-auto">{visibleNav.map((item) => <button key={item.key} onClick={() => changeSection(item.key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${section === item.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.label}</button>)}</div></div>
      <div className="mx-auto max-w-[1440px] p-4 sm:p-7">
        {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><i className="fa-solid fa-circle-exclamation mt-0.5" /><span className="flex-1">{error}</span><button onClick={() => setError('')}><i className="fa-solid fa-xmark" /></button></div>}
        {notice && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><i className="fa-solid fa-circle-check" />{notice}<button className="ml-auto" onClick={() => setNotice('')}><i className="fa-solid fa-xmark" /></button></div>}
        {loading && <div className="mb-4 h-1 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" /></div>}

        {section === 'whatsapp' && <section>
          <div className="mb-5"><h2 className="text-lg font-black text-slate-900">WhatsApp notifications</h2><p className="mt-1 text-sm text-slate-500">Send service updates and incident notices outside the QuickChat website.</p></div>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">WhatsApp Cloud API</p><p className={`mt-2 text-sm font-extrabold ${whatsappConfig ? 'text-emerald-700' : 'text-rose-700'}`}>{whatsappConfig ? 'Configured' : 'Not configured'}</p><p className="mt-1 text-xs leading-5 text-slate-500">Requires WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN on the server.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Recipient policy</p><p className="mt-2 text-sm font-extrabold text-slate-900">Verified + opted in</p><p className="mt-1 text-xs leading-5 text-slate-500">Only users with a verified WhatsApp number and notification consent receive broadcasts.</p></div>
          </div>
          <form onSubmit={sendWhatsAppBroadcast} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-5"><h3 className="font-extrabold text-slate-900">Compose service notification</h3><p className="mt-1 text-xs leading-5 text-slate-500">Use this for maintenance windows, outages, incident updates and service restoration notices.</p></div>
            <label className="mb-4 block text-sm font-bold text-slate-700">Notification title<input value={whatsappForm.title} onChange={(event) => setWhatsappForm((form) => ({ ...form, title: event.target.value }))} maxLength={160} required placeholder="QuickChat service update" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500" /></label>
            <label className="mb-4 block text-sm font-bold text-slate-700">Message<textarea value={whatsappForm.message} onChange={(event) => setWhatsappForm((form) => ({ ...form, message: event.target.value }))} maxLength={900} rows={5} required placeholder="We are investigating a temporary service interruption. Your account and content remain safe. We will send another update when service is restored." className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-emerald-500" /></label>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-slate-500">{whatsappForm.message.length}/900 characters · 250 recipients per batch · Approved Meta template required.</p><div className="flex flex-wrap gap-2">{whatsappOffset > 0 && <button type="button" onClick={() => { setWhatsappOffset(0); setWhatsappHasMore(false); }} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Reset batch</button>}<button disabled={whatsappBusy || !whatsappConfig || !whatsappForm.title.trim() || !whatsappForm.message.trim()} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><i className="fa-brands fa-whatsapp mr-2" />{whatsappBusy ? 'Processing…' : whatsappOffset > 0 ? 'Send next batch' : 'Send first batch'}</button></div></div>
            {whatsappHasMore && <p className="mt-3 text-xs font-semibold text-amber-700">More opted-in recipients remain. Send the next batch to continue this notification.</p>}
          </form>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">Recent WhatsApp activity</h3><p className="mt-1 text-xs text-slate-500">“Accepted” means Meta accepted the API request; it is not a delivery receipt.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Recipient</th><th className="px-4 py-3">Notification</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{whatsappLogs.map((log) => <tr key={log.id}><td className="px-5 py-3"><p className="font-semibold text-slate-800">{log.recipient_phone || '—'}</p><p className="text-[10px] text-slate-400">User #{log.recipient_user_id || '—'}</p></td><td className="px-4 py-3"><p className="font-bold text-slate-800">{log.title}</p><p className="max-w-md truncate text-xs text-slate-500">{log.message}</p>{log.error && <p className="mt-1 max-w-md text-[10px] text-rose-600">{log.error}</p>}</td><td className="px-4 py-3"><Status value={log.status} /></td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(log.created_at)}</td></tr>)}</tbody></table></div>
            {!whatsappLogs.length && <p className="p-8 text-center text-sm text-slate-400">No WhatsApp notifications have been sent yet.</p>}
          </div>
        </section>}

        {section === 'settings' && <section className="max-w-2xl">
          <div className="mb-5"><h2 className="text-lg font-black text-slate-900">Administrator credentials</h2><p className="mt-1 text-sm text-slate-500">Manage the independent username and password used only by this administration portal.</p></div>
          {identity.admin?.mustChangePassword && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Initial setup required.</strong> Change the bootstrap password before using the administration dashboard.</div>}
          <form onSubmit={submitCredentialChange} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <label className="block text-sm font-bold text-slate-700">Current password<input type="password" autoComplete="current-password" value={credentialForm.currentPassword} onChange={(event) => setCredentialForm((form) => ({ ...form, currentPassword: event.target.value }))} required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
            <label className="block text-sm font-bold text-slate-700">Administrator username<input autoComplete="username" value={credentialForm.newUsername} onChange={(event) => setCredentialForm((form) => ({ ...form, newUsername: event.target.value }))} required minLength={3} maxLength={80} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
            <label className="block text-sm font-bold text-slate-700">New password {identity.admin?.mustChangePassword ? '(required)' : '(leave blank to keep current)'}<input type="password" autoComplete="new-password" value={credentialForm.newPassword} onChange={(event) => setCredentialForm((form) => ({ ...form, newPassword: event.target.value }))} minLength={12} required={Boolean(identity.admin?.mustChangePassword)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
            <label className="block text-sm font-bold text-slate-700">Confirm new password<input type="password" autoComplete="new-password" value={credentialForm.confirmPassword} onChange={(event) => setCredentialForm((form) => ({ ...form, confirmPassword: event.target.value }))} minLength={12} required={Boolean(credentialForm.newPassword)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
            <p className="text-xs leading-5 text-slate-500">Passwords must contain at least 12 characters. Credentials are stored as bcrypt hashes and are not shared with QuickChat member accounts.</p>
            <button disabled={credentialBusy} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-60">{credentialBusy ? 'Saving…' : 'Save administrator credentials'}</button>
          </form>
        </section>}
        {section === 'overview' && <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Platform at a glance</h2><p className="mt-1 text-sm text-slate-500">Live totals from the QuickChat database.</p></div><span className="text-xs font-semibold text-slate-400">Updated {new Date().toLocaleTimeString()}</span></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(([key, label, icon, color]) => <div key={key} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_18px_rgba(15,23,42,.035)]"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><span className={`grid h-10 w-10 place-items-center rounded-xl ${metricColors[color] || "bg-slate-100 text-slate-600"}`}><i className={`fa-solid ${icon}`} /></span></div><div className="mt-4 text-3xl font-black tracking-tight text-slate-900">{Number(overview?.metrics?.[key] || 0).toLocaleString()}</div></div>)}</div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h3 className="font-extrabold text-slate-900">Recent administrative activity</h3><p className="mt-1 text-xs text-slate-500">Recorded governance actions.</p></div><button onClick={() => changeSection('audit')} className="text-xs font-bold text-blue-700">View audit log <i className="fa-solid fa-arrow-right ml-1" /></button></div>
            <div className="mt-4 divide-y divide-slate-100">{(overview?.recentActions || []).length ? overview.recentActions.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500"><i className="fa-solid fa-shield-halved text-xs" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{row.action}</p><p className="mt-0.5 text-xs text-slate-500">{row.administrator || 'Administrator'} · {row.target_type || 'platform'} {row.target_id || ''}</p></div><time className="text-[11px] text-slate-400">{formatDate(row.created_at)}</time></div>) : <p className="py-8 text-center text-sm text-slate-400">No administrative actions have been recorded yet.</p>}</div>
          </div>
        </section>}

        {section === 'users' && <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">User directory</h2><p className="mt-1 text-sm text-slate-500">Search and review existing QuickChat accounts.</p></div><div className="flex w-full gap-2 sm:w-auto"><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadSection('users', 1, search)} placeholder="Search name, username or email" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-400 sm:w-72" /><button onClick={() => { setUserPage(1); loadSection('users', 1, search); }} className="rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Search</button></div></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Account</th><th className="px-4 py-4">Joined</th><th className="px-4 py-4">Followers</th><th className="px-4 py-4">Following</th><th className="px-4 py-4">Posts</th><th className="px-4 py-4">Verification</th><th className="px-4 py-4">Account status</th><th className="px-4 py-4">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><img src={user.avatar_url || user.picture || '/favicon/favicon-32x32.png'} alt="" className="h-9 w-9 rounded-full bg-slate-100 object-cover" /><div><p className="font-bold text-slate-900">{user.fullname || user.username}</p><p className="mt-0.5 text-xs text-slate-500">{user.username} · {user.email}</p></div></div></td><td className="px-4 py-4 text-xs text-slate-500">{formatDate(user.created_at)}</td><td className="px-4 py-4 font-semibold">{Number(user.followers || 0).toLocaleString()}</td><td className="px-4 py-4 font-semibold">{Number(user.following || 0).toLocaleString()}</td><td className="px-4 py-4 font-semibold">{Number(user.posts || 0).toLocaleString()}</td><td className="px-4 py-4">{Number(user.verified) ? <span className="font-bold text-blue-700"><i className="fa-solid fa-circle-check mr-1" />Verified</span> : <span className="text-xs text-slate-400">Not verified</span>}</td><td className="px-4 py-4"><Status value={user.account_status} /></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{user.account_status !== 'active' && can('users.restore') && <button disabled={busyId === user.id} onClick={() => actOnUser(user, 'restore')} className="rounded-md bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700">Restore</button>}{user.account_status === 'active' && can('users.suspend') && <button disabled={busyId === user.id} onClick={() => actOnUser(user, 'suspend')} className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-700">Suspend</button>}{user.account_status !== 'banned' && can('users.ban') && <button disabled={busyId === user.id} onClick={() => actOnUser(user, 'ban')} className="rounded-md bg-rose-50 px-2 py-1.5 text-[10px] font-bold text-rose-700">Ban</button>}{can('users.delete') && <button disabled={busyId === user.id} onClick={() => actOnUser(user, 'delete-request')} className="rounded-md bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-600">Deletion review</button>}</div></td></tr>)}</tbody></table></div>
            {!users.length && !loading && <p className="p-8 text-center text-sm text-slate-400">No matching users found.</p>}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><span>{userPagination ? `Page ${userPagination.page} of ${Math.max(1, userPagination.pages)} · ${userPagination.total} users` : '—'}</span><div className="flex gap-2"><button disabled={!userPagination || userPage <= 1} onClick={() => { const next = userPage - 1; setUserPage(next); loadSection('users', next, search); }} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button><button disabled={!userPagination || userPage >= userPagination.pages} onClick={() => { const next = userPage + 1; setUserPage(next); loadSection('users', next, search); }} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button></div></div>
          </div>
        </section>}

        {section === 'verification' && <section><div className="mb-5"><h2 className="text-lg font-black text-slate-900">Verification review queue</h2><p className="mt-1 text-sm text-slate-500">Review applications before awarding the QuickChat verification badge.</p></div><div className="space-y-3">{verifications.map((app) => <article key={app.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start gap-3"><img src={app.avatar_url || app.picture || '/favicon/favicon-32x32.png'} alt="" className="h-11 w-11 rounded-full bg-slate-100 object-cover" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-slate-900">{app.fullname || app.username}</h3><Status value={app.status} /></div><p className="mt-1 text-xs text-slate-500">{app.username} · {app.account_category} · Submitted {formatDate(app.created_at)}</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{app.reason}</p><div className="mt-4 flex flex-wrap gap-2">{(() => { try { return JSON.parse(app.supporting_links || '[]'); } catch { return []; } })().map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700">{link}</a>)}</div><div className="mt-5 flex flex-wrap gap-2"><button disabled={busyId === app.id} onClick={() => reviewVerification(app, 'approved')} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Approve</button><button disabled={busyId === app.id} onClick={() => reviewVerification(app, 'needs_information')} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50">Request information</button><button disabled={busyId === app.id} onClick={() => reviewVerification(app, 'rejected')} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50">Reject</button></div></article>)}{!verifications.length && !loading && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><i className="fa-solid fa-certificate text-2xl text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">No pending verification applications.</p></div>}</div></section>}

        {section === 'reports' && <section><div className="mb-5"><h2 className="text-lg font-black text-slate-900">Reports & complaints</h2><p className="mt-1 text-sm text-slate-500">Prioritized moderation reports awaiting review.</p></div><div className="space-y-3">{reports.map((report) => <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-400">#{report.id}</span><Status value={report.status} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-600">{report.priority} priority</span><span className="ml-auto text-[11px] text-slate-400">{formatDate(report.created_at)}</span></div><h3 className="mt-3 font-extrabold text-slate-900">{report.category} · {report.entity_type} {report.entity_id}</h3><p className="mt-1 text-xs text-slate-500">Reported by {report.reporter_username || 'Unknown user'}{report.assignee_username ? ` · Assigned to ${report.assignee_username}` : ''}</p><p className="mt-3 text-sm leading-6 text-slate-700">{report.description || 'No additional description supplied.'}</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={busyId === report.id} onClick={() => resolveReport(report, 'resolved')} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">Mark resolved</button><button disabled={busyId === report.id} onClick={() => resolveReport(report, 'dismissed')} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Dismiss report</button><button disabled={busyId === report.id} onClick={() => resolveReport(report, 'escalated')} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700">Escalate</button></div></article>)}{!reports.length && !loading && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">No pending reports.</div>}</div></section>}

        {section === 'roles' && <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Roles & permissions</h2><p className="mt-1 text-sm text-slate-500">Review system roles and the permissions assigned to each role.</p></div>{can('roles.create') && <button onClick={createRole} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white"><i className="fa-solid fa-plus mr-2" />Create role</button>}</div><div className="grid gap-4 xl:grid-cols-2">{roles.map((role) => <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold text-slate-900">{role.name}</h3><p className="mt-1 text-xs text-slate-500">{role.key} · {role.assigned_users} assigned users</p></div>{Number(role.is_system) ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">System role</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">Custom role</span>}</div><div className="mt-4 flex flex-wrap gap-2">{role.permissions.map((permission) => <span key={permission} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{permission}</span>)}</div></article>)}</div><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-extrabold text-slate-900">Permission catalogue</h3><p className="mt-1 text-xs text-slate-500">{permissions.length} permissions registered in the backend.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{permissions.map((permission) => <div key={permission.key} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs font-bold text-slate-800">{permission.key}</p><p className="mt-0.5 text-[10px] text-slate-500">{permission.description}</p></div>)}</div></div></section>}

        {section === 'backups' && <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-black text-slate-900">Backup &amp; recovery</h2><p className="mt-1 text-sm text-slate-500">Create portable snapshots of QuickChat database tables and uploaded media.</p></div>
            {can('backups.create') && <button disabled={backupBusy || backupRunning} onClick={createPlatformBackup} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><i className="fa-solid fa-database mr-2" />{backupBusy || backupRunning ? 'Backup in progress…' : 'Create full backup'}</button>}
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Available archives</p><p className="mt-2 text-2xl font-black text-slate-900">{backups.length}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Backup engine</p><p className="mt-2 text-sm font-extrabold text-emerald-700">Database + media ZIP</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Execution status</p><p className="mt-2 text-sm font-extrabold text-slate-800">{backupRunning || backupBusy ? 'Running' : 'Idle'}</p></div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-extrabold text-slate-900">Backup history</h3><p className="mt-1 text-xs text-slate-500">Archives are stored outside the public web directory.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Archive</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{backups.map((backup) => <tr key={backup.id}><td className="px-5 py-4"><p className="font-bold text-slate-800">{backup.filename}</p><p className="mt-1 text-[10px] text-slate-400">QuickChat platform archive</p></td><td className="px-4 py-4 text-xs text-slate-500">{formatDate(backup.createdAt)}</td><td className="px-4 py-4 text-xs font-semibold text-slate-600">{(backup.sizeBytes / 1048576).toFixed(2)} MB</td><td className="px-4 py-4"><div className="flex justify-end gap-2">{can('backups.download') && <button onClick={() => downloadPlatformBackup(backup)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">Download</button>}{can('backups.delete') && <button disabled={backupBusy} onClick={() => deletePlatformBackup(backup)} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40">Delete</button>}</div></td></tr>)}</tbody></table></div>
            {!backups.length && !loading && <div className="p-10 text-center"><i className="fa-solid fa-box-archive text-2xl text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">No platform backups yet.</p><p className="mt-1 text-xs text-slate-400">Create the first archive to populate this history.</p></div>}
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Recovery limitation:</strong> Archives currently provide database and media snapshots for download and off-site storage. Automated in-place restoration, scheduled execution and Google Drive synchronization are not enabled in this first implementation.</div>
        </section>}

        {section === 'audit' && <section><div className="mb-5"><h2 className="text-lg font-black text-slate-900">Administrative audit trail</h2><p className="mt-1 text-sm text-slate-500">Append-only record of sensitive administrative operations.</p></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Action</th><th className="px-4 py-4">Administrator</th><th className="px-4 py-4">Target</th><th className="px-4 py-4">Reason</th><th className="px-4 py-4">Timestamp</th></tr></thead><tbody className="divide-y divide-slate-100">{auditLogs.map((log) => <tr key={log.id}><td className="px-5 py-4 font-bold text-slate-800">{log.action}</td><td className="px-4 py-4 text-xs">{log.administrator || log.admin_user_id}</td><td className="px-4 py-4 text-xs text-slate-500">{log.target_type || '—'} {log.target_id || ''}</td><td className="max-w-[220px] truncate px-4 py-4 text-xs text-slate-500">{log.reason || '—'}</td><td className="px-4 py-4 text-xs text-slate-500">{formatDate(log.created_at)}</td></tr>)}</tbody></table></div>{!auditLogs.length && <p className="p-8 text-center text-sm text-slate-400">No audit entries recorded.</p>}</div></section>}
      </div>
    </main>
  </div>;
}
