import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { apiRequest } from '../api';

const links = [
  { to: '/creator', label: 'Overview', icon: 'fa-grid-2', end: true },
  { to: '/creator/content-library', label: 'Content Library', icon: 'fa-calendar-days' },
  { to: '/creator/analytics', label: 'Analytics & Insights', icon: 'fa-chart-line' },
];

const SPACE_GROUPS = [
  { key: 'communities', type: 'community', label: 'Communities', icon: 'fa-users' },
  { key: 'pages', type: 'page', label: 'Pages', icon: 'fa-flag' },
  { key: 'channels', type: 'channel', label: 'Channels', icon: 'fa-tower-broadcast' },
];

export default function CreatorSidebar() {
  const location = useLocation();
  const [spaces, setSpaces] = useState({ communities: [], pages: [], channels: [] });
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [loadingSpaces, setLoadingSpaces] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingSpaces(true);
    apiRequest('/creator-studio/entities')
      .then((result) => {
        if (!active) return;
        setSpaces({
          communities: result.communities || [],
          pages: result.pages || [],
          channels: result.channels || [],
        });
      })
      .catch(() => {
        if (active) setSpaces({ communities: [], pages: [], channels: [] });
      })
      .finally(() => { if (active) setLoadingSpaces(false); });
    return () => { active = false; };
  }, [location.pathname]);

  const totalSpaces = SPACE_GROUPS.reduce((sum, group) => sum + spaces[group.key].length, 0);

  return <aside className="z-30 border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
    <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-6">
      <NavLink to="/creator" className="flex items-center gap-2 font-black tracking-tight text-slate-950 no-underline">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 text-white"><i className="fa-solid fa-bolt"/></span>
        <span>QUICKCHAT <span className="text-blue-700">CREATOR</span></span>
      </NavLink>
      <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-blue-700 lg:inline-flex">Studio</span>
    </div>
    <div className="px-3 pb-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-3">
      <p className="hidden px-3 pb-2 pt-4 text-[9px] font-black uppercase tracking-[.2em] text-slate-400 lg:block">Workspace</p>
      <nav className="flex gap-2 overflow-x-auto lg:flex-col">
        {links.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold no-underline transition-colors lg:w-full ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
          <i className={`fa-solid ${item.icon} w-4 text-center text-sm`}/><span>{item.label}</span>
        </NavLink>)}
      </nav>

      <section className="mt-4 border-t border-slate-100 pt-3">
        <button type="button" onClick={() => setSpacesOpen((open) => !open)} aria-expanded={spacesOpen} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-extrabold text-slate-700 hover:bg-slate-50">
          <i className="fa-solid fa-layer-group w-4 text-center text-blue-700"/>
          <span className="flex-1">My Spaces</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{loadingSpaces ? '…' : totalSpaces}</span>
          <i className={`fa-solid fa-chevron-${spacesOpen ? 'up' : 'down'} text-[9px] text-slate-400`}/>
        </button>
        {spacesOpen && <div className="mt-1 space-y-2 pb-2">
          {loadingSpaces && <p className="px-3 py-2 text-[11px] text-slate-400">Loading your spaces…</p>}
          {!loadingSpaces && SPACE_GROUPS.map((group) => {
            const items = spaces[group.key];
            if (!items.length) return null;
            return <div key={group.key}>
              <p className="px-3 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-[.16em] text-slate-400">{group.label}</p>
              {items.map((space) => <Link key={space.id} to={`/creator/spaces/${space.platformId}`} title={space.name} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs no-underline transition-colors ${location.pathname === `/creator/spaces/${space.platformId}` ? 'bg-blue-50 font-bold text-blue-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
                <i className={`fa-solid ${group.icon} w-4 text-center text-[11px] text-slate-400`}/>
                <span className="min-w-0 flex-1 truncate">{space.name}</span>
              </Link>)}
            </div>;
          })}
          {!loadingSpaces && !totalSpaces && <div className="px-3 py-2">
            <p className="text-[11px] leading-5 text-slate-500">Communities, pages and channels you create will appear here.</p>
            <a href="#creator-spaces" className="mt-2 inline-flex text-[11px] font-bold text-blue-700 no-underline hover:text-blue-900">Create a space <i className="fa-solid fa-arrow-right ml-1"/></a>
          </div>}
        </div>}
      </section>

      <div className="mt-4 hidden rounded-2xl bg-slate-950 p-4 text-white lg:block">
        <i className="fa-solid fa-lightbulb text-blue-300"/>
        <p className="mt-2 text-xs font-extrabold">Create with insight</p>
        <p className="mt-1 text-[10px] leading-5 text-slate-400">Use real audience activity to understand what is working and what needs a new approach.</p>
      </div>
    </div>
    <div className="hidden border-t border-slate-100 p-4 lg:block"><p className="text-[10px] font-semibold text-slate-400">Creator workspace</p><p className="mt-1 text-xs font-bold text-slate-700">Independent creator tools</p></div>
  </aside>;
}
