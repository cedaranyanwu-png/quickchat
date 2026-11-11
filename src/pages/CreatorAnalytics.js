import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';
import CreatorSidebar from '../components/CreatorSidebar';

const number = (value) => Number(value || 0).toLocaleString();
const dateLabel = (value) => { try { return new Intl.DateTimeFormat('en-NG', { month: 'short', day: 'numeric' }).format(new Date(value + 'T00:00:00')); } catch (_) { return value; } };

function LineChart({ data, series, height = 190, emptyLabel = 'Not enough activity yet' }) {
  const width = 720, pad = 24;
  const values = data.flatMap((row) => series.map((item) => Number(row[item.key] || 0)));
  const max = Math.max(1, ...values);
  const points = (key) => data.map((row, index) => {
    const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
    const y = height - pad - (Number(row[key] || 0) / max) * (height - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  if (!data.length || values.every((value) => value === 0)) return <div className="grid h-48 place-items-center rounded-xl bg-slate-50 text-xs text-slate-400">{emptyLabel}</div>;
  return <div className="w-full overflow-hidden">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Engagement activity line chart" className="h-48 w-full">
      {[0,1,2,3].map((line) => <line key={line} x1={pad} x2={width-pad} y1={pad + line*(height-2*pad)/3} y2={pad + line*(height-2*pad)/3} stroke="#e2e8f0" strokeDasharray="4 5"/>)}
      {series.map((item) => <polyline key={item.key} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points(item.key)}/>)}
      {data.map((row,index) => index % Math.max(1,Math.ceil(data.length/6))===0 ? <text key={row.day} x={pad+(index/Math.max(1,data.length-1))*(width-pad*2)} y={height-4} textAnchor="middle" fill="#94a3b8" fontSize="10">{dateLabel(row.day)}</text> : null)}
    </svg>
    <div className="mt-1 flex flex-wrap gap-4">{series.map((item) => <span key={item.key} className="inline-flex items-center gap-2 text-[10px] font-semibold text-slate-500"><span className="h-2 w-2 rounded-full" style={{background:item.color}}/>{item.label}</span>)}</div>
  </div>;
}

function Metric({ label, value, previous, icon }) {
  const change = previous > 0 ? Math.round(((value-previous)/previous)*100) : value > 0 ? 100 : 0;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold">{label}</span><i className={`fa-solid ${icon} text-blue-600`}/></div>
    <p className="mt-3 text-2xl font-black tabular-nums text-slate-950">{number(value)}</p>
    <p className={`mt-1 text-[10px] font-bold ${change>0?'text-emerald-600':change<0?'text-rose-600':'text-slate-400'}`}>{change>0?'↑':change<0?'↓':'—'} {Math.abs(change)}% vs previous 30 days</p>
  </div>;
}

function PostTrend({ post }) {
  const days = useMemo(() => {
    const map = new Map();
    for (const event of post.timeline || []) {
      const row = map.get(event.day) || {day:event.day,views:0,engagement:0};
      if (event.type === 'view') row.views += event.count;
      else row.engagement += event.count;
      map.set(event.day,row);
    }
    return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day));
  }, [post.timeline]);
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{post.text || 'Media post'}</p><p className="mt-1 text-[10px] text-slate-400">{post.category} · {new Date(post.createdAt).toLocaleDateString('en-NG')}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${post.trend==='rising'?'bg-emerald-50 text-emerald-700':post.trend==='falling'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600'}`}>{post.trend==='rising'?'↑ Rising':post.trend==='falling'?'↓ Falling':'Steady'} {post.change>0?'+':''}{post.change}%</span>
    </div>
    <div className="mt-4 grid grid-cols-4 gap-2">{[['Views',post.views],['Likes',post.likes],['Comments',post.comments],['Shares',post.shares]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-2"><p className="text-[9px] font-semibold text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-800">{number(value)}</p></div>)}</div>
    <div className="mt-4"><LineChart data={days} series={[{key:'engagement',label:'Daily engagement',color:'#2563eb'},{key:'views',label:'Daily views',color:'#0d9488'}]} height={150}/></div>
    {post.hashtags?.length>0 && <p className="mt-3 text-[10px] text-blue-700">{post.hashtags.map(tag=>'#'+String(tag).replace(/^#/,'')).join('  ')}</p>}
  </article>;
}

export default function CreatorAnalytics() {
  const [data,setData]=useState(null), [error,setError]=useState(''), [loading,setLoading]=useState(true), [lastUpdated,setLastUpdated]=useState(null);
  const load=useCallback(async(silent=false)=>{
    try { const result=await apiRequest('/creator/analytics'); setData(result); setLastUpdated(new Date()); setError(''); }
    catch(e){setError(e.message||'Analytics could not be loaded.');}
    finally{if(!silent)setLoading(false);}
  },[]);
  useEffect(()=>{load();const timer=window.setInterval(()=>load(true),30000);return()=>window.clearInterval(timer);},[load]);
  const posts=data?.posts||[];
  const rising=posts.filter(post=>post.trend==='rising').slice(0,4);
  const falling=posts.filter(post=>post.trend==='falling').slice(0,4);
  return <div className="min-h-screen bg-slate-50"><CreatorSidebar/><main className="min-w-0 px-4 pb-12 pt-5 lg:ml-64 lg:px-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">Creator intelligence</p><h1 className="mt-1 text-3xl font-black text-slate-950">Analytics & Insights</h1><p className="mt-2 text-sm text-slate-500">Understand what your audience watches, likes, discusses and shares.</p></div><div className="flex items-center gap-3"><span className="text-[10px] text-slate-400">{lastUpdated?'Updated '+lastUpdated.toLocaleTimeString('en-NG'):'Live updates every 30 seconds'}</span><button onClick={()=>{setLoading(true);load();}} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><i className="fa-solid fa-rotate mr-2"/>Refresh</button></div></header>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading&&!data?<div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading your analytics…</div>:<>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Post views" value={data?.recentPerformance?.views} previous={data?.previousPerformance?.views} icon="fa-eye"/>
        <Metric label="Likes" value={data?.recentPerformance?.likes} previous={data?.previousPerformance?.likes} icon="fa-heart"/>
        <Metric label="Comments" value={data?.recentPerformance?.replies} previous={data?.previousPerformance?.replies} icon="fa-comments"/>
        <Metric label="Shares" value={data?.recentPerformance?.reposts} previous={data?.previousPerformance?.reposts} icon="fa-share-nodes"/>
        <Metric label="Published posts" value={data?.recentPerformance?.posts} previous={data?.previousPerformance?.posts} icon="fa-file-lines"/>
      </section>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="text-base font-black text-slate-950">Audience activity</h2><p className="mt-1 text-xs text-slate-500">Daily views and interactions recorded over the last 30 days.</p></div><LineChart data={data?.daily||[]} series={[{key:'views',label:'Views',color:'#0d9488'},{key:'likes',label:'Likes',color:'#2563eb'},{key:'comments',label:'Comments',color:'#d97706'},{key:'shares',label:'Shares',color:'#9333ea'}]}/></section>
      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">Rising posts</h2><p className="mt-1 text-xs text-slate-500">Posts gaining engagement compared with the previous 7-day period.</p><div className="mt-4 space-y-2">{rising.length?rising.map(post=><div key={post.id} className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50/70 p-3"><p className="line-clamp-2 text-xs font-semibold text-slate-700">{post.text||'Media post'}</p><span className="shrink-0 text-xs font-black text-emerald-700">+{post.change}%</span></div>):<p className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-400">No rising posts detected yet.</p>}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">Posts losing momentum</h2><p className="mt-1 text-xs text-slate-500">Posts receiving fewer interactions than the previous 7-day period.</p><div className="mt-4 space-y-2">{falling.length?falling.map(post=><div key={post.id} className="flex items-center justify-between gap-3 rounded-xl bg-rose-50/70 p-3"><p className="line-clamp-2 text-xs font-semibold text-slate-700">{post.text||'Media post'}</p><span className="shrink-0 text-xs font-black text-rose-700">{post.change}%</span></div>):<p className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-400">No declining posts detected yet.</p>}</div></div>
      </section>
      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">Hashtags that work</h2><p className="mt-1 text-xs text-slate-500">Ranked by likes, comments and shares across your posts.</p><div className="mt-4 space-y-3">{(data?.hashtags||[]).length?data.hashtags.map((tag,index)=><div key={tag.tag} className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">#{tag.tag}</p><p className="mt-0.5 text-[10px] text-slate-400">{tag.posts} posts · {number(tag.likes)} likes</p></div><span className="text-xs font-black text-slate-800">{number(tag.comments*2+tag.shares*2+tag.likes)} interactions</span></div>):<p className="text-xs text-slate-400">Hashtag insights appear after you publish posts with hashtags.</p>}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-950">Topics your audience responds to</h2><p className="mt-1 text-xs text-slate-500">Topics and categories ranked by actual post interactions.</p><div className="mt-4 space-y-3">{(data?.topics||[]).length?data.topics.map(topic=><div key={topic.topic} className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-800">{topic.topic}</p><p className="mt-0.5 text-[10px] text-slate-400">{topic.posts} posts · {number(topic.likes)} likes</p></div><span className="text-xs font-black text-slate-800">{number(topic.comments*2+topic.shares*2+topic.likes)} interactions</span></div>):<p className="text-xs text-slate-400">Topic insights appear as your posts receive engagement.</p>}</div></div>
      </section>
      <section className="mt-5"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">Performance by post</h2><p className="mt-1 text-xs text-slate-500">Individual performance curves. View tracking starts when this release is live.</p></div><Link to="/creator/content-library" className="text-xs font-bold text-blue-700 no-underline">Open content library →</Link></div><div className="grid gap-4 xl:grid-cols-2">{posts.length?posts.map(post=><PostTrend key={post.id} post={post}/>):<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">Your published posts will appear here.</div>}</div></section>
    </>}</main></div>;
}
