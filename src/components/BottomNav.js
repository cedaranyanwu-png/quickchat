import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import UnreadBadge from './UnreadBadge';

const navItems = [
  { name: 'Home', icon: 'fa-solid fa-house', path: '/home' },
  { name: 'Explore', icon: 'fa-solid fa-compass', path: '/explore' },
  { name: 'Recs', icon: 'fa-solid fa-wand-magic-sparkles', path: '/recommendations' },
  { name: 'Profile', icon: 'fa-solid fa-user', path: '/profile' },
  { name: 'Menu', icon: 'fa-solid fa-bars', path: '/menu' },
];

const BottomNav = () => {
  const location = useLocation();

  return (
    <nav className="border-t border-slate-800 bg-slate-900 shadow-lg">
      <div className="flex items-center justify-around py-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 no-underline transition-colors ${isActive ? 'text-blue-400' : 'text-slate-300 hover:text-white'}`}
            >
              <i className={`${item.icon} text-base`} />
              <span className="text-[9px] font-semibold">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
