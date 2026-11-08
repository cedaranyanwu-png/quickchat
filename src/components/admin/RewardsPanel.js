import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

function money(value) {
  return '₦' + Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RewardsPanel() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [totals, setTotals] = useState(null);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [withdrawalData, commissionData] = await Promise.all([
        adminRequest('/admin/rewards/withdrawals?status=' + status),
        adminRequest('/admin/rewards/commissions'),
      ]);
      setWithdrawals(withdrawalData.withdrawals || []);
      setCommissions(commissionData.commissions || []);
      setTotals(commissionData.totals || null);
    } catch (requestError) {
      setError(requestError.message || 'Could not load reward administration.');
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const review = async (row, action) => {
    const label = action === 'mark_paid' ? 'Mark this withdrawal paid? Only do this after you have sent the bank transfer.' : action === 'approve' ? 'Approve this withdrawal for manual bank transfer?' : 'Reject this withdrawal and return the money to the user wallet?';
    if (!window.confirm(label)) return;
    setBusyId(row.id); setError(''); setNotice('');
    try {
      const result = await adminRequest('/admin/rewards/withdrawals/' + row.id + '/review', {
        method: 'POST', body: { action, note: action === 'reject' ? 'Rejected by administrator' : '' },
      });
      setNotice(result.message || 'Withdrawal updated.');
      await load();
    } catch (requestError) { setError(requestError.message || 'Could not update withdrawal.'); }
    finally { setBusyId(null); }
  };

  return <section className="space-y-5">
    <div><h2 className="text-lg font-black text-slate-900">Rewards & withdrawals</h2><p className="mt-1 text-sm text-slate-500">Review creator reward withdrawals and monitor the 10% platform commission from points-based monetization.</p></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Gross reward value</p><p className="mt-1 text-xl font-black text-slate-900">{Number(totals?.gross_points || 0).toLocaleString()} pts</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Platform commission</p><p className="mt-1 text-xl font-black text-emerald-700">{Number(totals?.commission_points || 0).toLocaleString()} pts</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Creator reward share</p><p className="mt-1 text-xl font-black text-blue-700">{Number(totals?.recipient_points || 0).toLocaleString()} pts</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-extrabold text-slate-900">Withdrawal requests</h3><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select></div>
    {loading ? <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">Loading reward records…</p> : withdrawals.length ? <div className="space-y-3">{withdrawals.map((row) => <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold text-slate-900">{row.fullname || row.username || 'QuickChat user'}</p><p className="text-xs text-slate-500">{row.email} · Request #{row.id}</p></div><div className="text-right"><p className="text-lg font-black text-slate-900">{money(row.amount)}</p><p className="text-[10px] font-bold uppercase text-slate-500">{row.status}</p></div></div>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><p className="font-bold">{row.bank_name} · {row.account_masked}</p><p>{row.account_name}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(row.created_at).toLocaleString()}</p></div>
      {row.admin_note && <p className="mt-2 text-xs text-slate-500">Note: {row.admin_note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {row.status === 'pending' && <><button disabled={busyId === row.id} onClick={() => review(row, 'approve')} className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Approve for transfer</button><button disabled={busyId === row.id} onClick={() => review(row, 'reject')} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 disabled:opacity-50">Reject & refund</button></>}
        {row.status === 'approved' && <button disabled={busyId === row.id} onClick={() => review(row, 'mark_paid')} className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Mark transfer paid</button>}
      </div>
    </article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No {status} withdrawal requests.</div>}
    <div><h3 className="mb-2 font-extrabold text-slate-900">Recent point-based commissions</h3><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Source</th><th className="p-3">Gross reward value</th><th className="p-3">Platform</th><th className="p-3">Recipient</th><th className="p-3">Date</th></tr></thead><tbody className="divide-y divide-slate-100">{commissions.map((item) => <tr key={item.id}><td className="p-3 font-bold text-slate-700">{item.source_type}</td><td className="p-3">{Number(item.gross_points).toLocaleString()} pts</td><td className="p-3 text-emerald-700">{Number(item.commission_points).toLocaleString()} pts</td><td className="p-3">{Number(item.recipient_points).toLocaleString()} pts</td><td className="p-3 text-slate-500">{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!commissions.length && <p className="p-6 text-center text-xs text-slate-400">No commission records yet.</p>}</div></div>
    <p className="text-[11px] leading-5 text-slate-500">Approving a request does not send money. Complete the bank transfer through your payout process first, then select “Mark transfer paid”. Rejected requests are automatically returned to the user's withdrawable balance.</p>
  </section>;
}
