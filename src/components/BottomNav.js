import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import NovaIcon from './NovaIcon';
import UnreadBadge from './UnreadBadge';
import { useUnreadCounts } from './UnreadCountsProvider';

const navItems = [
  { name: 'Home', icon: 'fa-solid fa-house', path: '/home' },
  { name: 'Explore', icon: 'fa-solid fa-compass', path: '/explore' },
  { name: 'Recs', icon: 'fa-solid fa-wand-magic-sparkles', path: '/recommendations' },
  { name: 'Notifications', icon: 'fa-solid fa-bell', path: '/notifications' },
  { name: 'Profile', icon: 'fa-solid fa-user', path: '/profile' },
];

const BottomNav = () => {
  const location = useLocation();
  const { unreadCounts } = useUnreadCounts();
  return <nav className="border-t border-slate-800 bg-slate-900 shadow-lg">
    <div className="flex items-center justify-around py-1.5">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path === '/profile' && location.pathname.startsWith('/profile'));
        const unread = item.path === '/notifications' ? unreadCounts.notifications : 0;
        return <Link key={item.name} to={item.path} className={`relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 no-underline transition-colors ${isActive ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}>
          <span className="relative">{item.icon === 'nova' ? <NovaIcon className="h-5 w-5" /> : <i className={`${item.icon} text-base`} />}<UnreadBadge count={unread} className="absolute -right-2 -top-1" /></span>
          <span className="text-[9px] font-semibold">{item.name}</span>
        </Link>;
      })}
    </div>
  </nav>;
};

export default BottomNav;
