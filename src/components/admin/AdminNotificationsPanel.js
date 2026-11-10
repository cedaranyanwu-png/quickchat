import React, { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../../api';

const EMPTY={title:'',message:'',audience:'everyone',channels:['in_app']};
export default function AdminNotificationsPanel(){
 const [form,setForm]=useState(EMPTY),[campaigns,setCampaigns]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const r=await adminRequest('/admin/notifications');setCampaigns(r.campaigns||[]);},[]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 const toggle=(channel)=>setForm(f=>({...f,channels:f.channels.includes(channel)?f.channels.filter(x=>x!==channel):[...f.channels,channel]}));
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await adminRequest('/admin/notifications',{method:'POST',body:form});setNotice(r.message+' Audience: '+r.recipients);setForm(EMPTY);await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="space-y-5">
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-slate-950">Notification centre</h2><p className="mt-1 text-sm text-slate-500">Send announcements through QuickChat inbox, email and on-screen popups.</p>
   {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
   <form onSubmit={submit} className="mt-4 space-y-4">
    <label className="block text-xs font-bold text-slate-700">Notification title<input required maxLength="160" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label>
    <label className="block text-xs font-bold text-slate-700">Message<textarea required rows="4" maxLength="4000" value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label>
    <div><p className="mb-2 text-xs font-bold text-slate-700">Delivery channels</p><div className="flex flex-wrap gap-3">{[['in_app','In-app notification'],['email','Email notification'],['popup','In-app popup']].map(([v,l])=><label key={v} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><input type="checkbox" checked={form.channels.includes(v)} onChange={()=>toggle(v)}/>{l}</label>)}</div></div>
    <label className="block text-xs font-bold text-slate-700">Audience<select value={form.audience} onChange={e=>setForm(f=>({...f,audience:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{[['everyone','Everyone'],['verified','Verified users'],['active','Active in last 30 days'],['inactive','Inactive for 30+ days'],['new_users','Joined in last 7 days']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <button disabled={busy||!form.channels.length} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'Queueing campaign…':'Send notification'}</button>
   </form>
  </section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4"><h3 className="font-extrabold text-slate-900">Campaign history</h3></div><div className="divide-y divide-slate-100">{campaigns.map(c=><div key={c.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm text-slate-900">{c.title}</strong><span className="text-xs font-bold capitalize text-blue-700">{String(c.status).replaceAll('_',' ')}</span></div><p className="mt-1 text-xs text-slate-500">{c.audience} · {c.channels} · {new Date(c.created_at).toLocaleString()}</p><p className="mt-2 text-xs text-slate-600">{c.sent_count}/{c.recipient_count} deliveries processed · {c.failed_count} failed</p></div>)}{!campaigns.length&&<p className="p-6 text-sm text-slate-500">No notification campaigns yet.</p>}</div></section>
 </div>;
}
