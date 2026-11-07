import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import UnreadBadge from './UnreadBadge';
import { useUnreadCounts } from './UnreadCountsProvider';

const navItems = [
  { name: 'Home', icon: 'fa-solid fa-house', path: '/home' },
  { name: 'Explore', icon: 'fa-solid fa-compass', path: '/explore' },
  { name: 'Messages', icon: 'fa-solid fa-envelope', path: '/messages' },
  { name: 'Communities', icon: 'fa-solid fa-users', path: '/communities' },
  { name: 'Notifications', icon: 'fa-solid fa-bell', path: '/notifications' },
];

const BottomNav = () => {
  const location = useLocation();
  const { unreadCounts } = useUnreadCounts();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuActive = ['/profile', '/settings', '/follow', '/videos', '/books', '/recommendations', '/ads'].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

  return <nav className="relative border-t border-slate-800 bg-slate-900 shadow-lg">
    {menuOpen && <div className="absolute bottom-full right-2 mb-2 w-56 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
      {[
        ['Profile', 'fa-solid fa-user', '/profile'],
        ['Recommendations', 'fa-solid fa-wand-magic-sparkles', '/recommendations'],
        ['People', 'fa-solid fa-user-plus', '/follow'],
        ['Videos', 'fa-solid fa-video', '/videos'],
        ['Books', 'fa-solid fa-book', '/books'],
        ['Ads', 'fa-solid fa-bullhorn', '/ads'],
        ['Settings', 'fa-solid fa-gear', '/settings'],
      ].map(([name, icon, path]) => (
        <Link key={path} to={path} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-200 no-underline hover:bg-slate-800">
          <i className={`${icon} w-5 text-center text-slate-400`} />{name}
        </Link>
      ))}
    </div>}
    <div className="flex items-center justify-around py-1.5">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        const unread = item.path === '/notifications' ? unreadCounts.notifications : item.path === '/messages' ? unreadCounts.messages : 0;
        return <Link key={item.name} to={item.path} className={`relative flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 no-underline transition-colors ${isActive ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}>
          <span className="relative"><i className={`${item.icon} text-base`} /><UnreadBadge count={unread} className="absolute -right-2 -top-2" /></span>
          <span className="text-[9px] font-semibold">{item.name}</span>
        </Link>;
      })}
      <button type="button" onClick={() => setMenuOpen((open) => !open)} className={`relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 ${menuActive || menuOpen ? 'text-blue-400' : 'text-slate-300'}`} aria-label="Open QuickChat menu" aria-expanded={menuOpen}>
        <i className="fa-solid fa-bars text-base" />
        <span className="text-[9px] font-semibold">Menu</span>
      </button>
    </div>
  </nav>;
};

export default BottomNav;
