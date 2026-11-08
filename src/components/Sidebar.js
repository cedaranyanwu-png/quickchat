import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from './Avatar';
import NovaIcon from './NovaIcon';
import UnreadBadge from './UnreadBadge';
import RecommendationOnboarding from './RecommendationOnboarding';
import { useUnreadCounts } from './UnreadCountsProvider';

export default function Sidebar({ onOpenPost, onLogout }) {
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showRecommendationOnboarding, setShowRecommendationOnboarding] = useState(false);
  const { unreadCounts } = useUnreadCounts();
  const navItems = [
    ['Home', 'fa-solid fa-house', '/home'],
    ['Explore', 'fa-solid fa-compass', '/explore'],
    ['Recommendations', 'fa-solid fa-wand-magic-sparkles', '/recommendations'],
    ['Notifications', 'fa-solid fa-bell', '/notifications'],
    ['Messages', 'fa-solid fa-envelope', '/messages'],
    ['Live', 'fa-solid fa-tower-broadcast', '/live'],
    ['Wallet & earnings', 'fa-solid fa-wallet', '/settings/wallet'],
    ['Videos', 'fa-solid fa-video', '/videos'],
    ['Communities', 'fa-solid fa-users', '/communities'],
    ['People', 'fa-solid fa-user-plus', '/follow'],
    ['Ads', 'fa-solid fa-bullhorn', '/ads'],
    ['Profile', 'fa-solid fa-user', '/profile'],
  ];

  useEffect(() => {
    apiRequest('/profile/me').then((result) => setProfile(result.profile)).catch(() => {});
  }, [location.pathname]);

  return <>
    <aside className="relative flex h-screen w-[220px] flex-col bg-slate-900 px-2">
      <div className="flex items-center gap-2 px-2 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-700 text-sm font-bold text-white">Q</div>
        <span className="text-lg font-extrabold text-white">QuickChat</span>
      </div>
      <button onClick={onOpenPost} className="mx-2 my-3 rounded-full bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800">Post</button>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {navItems.map(([label, icon, path]) => {
          const isActive = location.pathname === path || (path !== '/profile' && location.pathname.startsWith(`${path}/`));
          const unread = path === '/notifications' ? unreadCounts.notifications : path === '/messages' ? unreadCounts.messages : 0;
          return (
            <Link key={path} to={path} className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm no-underline transition-colors ${isActive ? 'bg-slate-800 font-bold text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
              <span className="relative"><i className={`${icon} w-5 text-center`} /><UnreadBadge count={unread} className="absolute -right-2 -top-2" /></span>
              <span>{label}</span>
              {path === '/recommendations' && <NovaIcon className="ml-auto h-4 w-4" />}
            </Link>
          );
        })}
        <button type="button" onClick={() => setShowRecommendationOnboarding(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
          <i className="fa-solid fa-sliders w-5 text-center" />
          <span>Recommendation setup</span>
        </button>
      </nav>
      <div className="relative border-t border-slate-800 py-3">
        <button onClick={() => setShowMenu((open) => !open)} className="flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-slate-800">
          <Avatar name={profile?.fullName || profile?.username || 'User'} picture={profile?.picture} size={36} />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{profile?.fullName || profile?.username || 'Account'}</span>
          <i className="fa-solid fa-ellipsis text-slate-400" />
        </button>
        {showMenu && <div className="absolute bottom-full left-0 z-50 mb-2 w-full rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-xl">
          <Link to="/settings" onClick={() => setShowMenu(false)} className="block rounded-lg px-3 py-2 text-sm text-white hover:bg-slate-700">Settings</Link>
          <p className="px-3 py-2 text-[10px] leading-4 text-slate-400">Log out is available in Settings.</p>
        </div>}
      </div>
    </aside>
    <RecommendationOnboarding open={showRecommendationOnboarding} onClose={() => setShowRecommendationOnboarding(false)} />
  </>;
}
