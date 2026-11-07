import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import UnreadBadge from './UnreadBadge';
import { useUnreadCounts } from './UnreadCountsProvider';

const navItems = [
  { name: 'Home', icon: 'fa-solid fa-house', path: '/home' },
  { name: 'Discover', icon: 'fa-solid fa-compass', path: '/discover' },
  { name: 'Messages', icon: 'fa-solid fa-envelope', path: '/messages' },
  { name: 'Communities', icon: 'fa-solid fa-users', path: '/communities' },
  { name: 'Notifications', icon: 'fa-solid fa-bell', path: '/notifications' },
];

const BottomNav = () => {
  const location = useLocation();
  const { unreadCounts } = useUnreadCounts();
  return <nav className="border-t border-slate-800 bg-slate-900 shadow-lg">
    <div className="flex items-center justify-around py-1.5">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        const unread = item.path === '/notifications' ? unreadCounts.notifications : item.path === '/messages' ? unreadCounts.messages : 0;
        return <Link key={item.name} to={item.path} className={`relative flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 no-underline transition-colors ${isActive ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}>
          <span className="relative"><i className={`${item.icon} text-base`} /><UnreadBadge count={unread} className="absolute -right-2 -top-2" /></span>
          <span className="text-[9px] font-semibold">{item.name}</span>
        </Link>;
      })}
      <Link to="/menu" className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 no-underline ${location.pathname.startsWith('/menu') ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}>
        <i className="fa-solid fa-bars text-base" />
        <span className="text-[9px] font-semibold">Menu</span>
      </Link>
    </div>
  </nav>;
};

export default BottomNav;
