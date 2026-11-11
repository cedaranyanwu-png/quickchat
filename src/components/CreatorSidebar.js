import React from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/creator', label: 'Overview', icon: 'fa-grid-2', end: true },
  { to: '/creator/content-library', label: 'Content Library', icon: 'fa-calendar-days' },
  { to: '/creator/analytics', label: 'Analytics & Insights', icon: 'fa-chart-line' },
];

export default function CreatorSidebar() {
  return <aside className="z-30 border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
    <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-6">
      <NavLink to="/creator" className="flex items-center gap-2 font-black tracking-tight text-slate-950 no-underline">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white"><i className="fa-solid fa-bolt"/></span>
        <span>QUICKCHAT <span className="text-blue-700">CREATOR</span></span>
      </NavLink>
      <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-blue-700 lg:inline-flex">Studio</span>
    </div>
    <div className="px-3 pb-3 lg:flex-1 lg:px-3">
      <p className="hidden px-3 pb-2 pt-4 text-[9px] font-black uppercase tracking-[.2em] text-slate-400 lg:block">Workspace</p>
      <nav className="flex gap-2 overflow-x-auto lg:flex-col">
        {links.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold no-underline transition-colors lg:w-full ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
          <i className={`fa-solid ${item.icon} w-4 text-center text-sm`}/><span>{item.label}</span>
        </NavLink>)}
      </nav>
      <div className="mt-6 hidden rounded-2xl bg-slate-950 p-4 text-white lg:block">
        <i className="fa-solid fa-lightbulb text-blue-300"/>
        <p className="mt-2 text-xs font-extrabold">Create with insight</p>
        <p className="mt-1 text-[10px] leading-5 text-slate-400">Use real audience activity to understand what is working and what needs a new approach.</p>
      </div>
    </div>
    <div className="hidden border-t border-slate-100 p-4 lg:block"><p className="text-[10px] font-semibold text-slate-400">Creator workspace</p><p className="mt-1 text-xs font-bold text-slate-700">Independent creator tools</p></div>
  </aside>;
}
