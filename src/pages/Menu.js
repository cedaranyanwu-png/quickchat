import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const items = [
  { label: 'Creator Studio', description: 'Switch to creator mode, publish and track your audience.', icon: 'fa-solid fa-clapperboard', path: '/creator-studio' },
  { label: 'Creator Programme', description: 'Discover creator opportunities and join the recruitment programme.', icon: 'fa-solid fa-star', path: '/creator-program' },
  { label: 'Live', description: 'Start or discover live sessions.', icon: 'fa-solid fa-tower-broadcast', path: '/live' },
  { label: 'Communities', description: 'Create, discover, and join communities.', icon: 'fa-solid fa-users', path: '/communities' },
  { label: 'People', description: 'Find people to follow.', icon: 'fa-solid fa-user-plus', path: '/follow' },
  { label: 'Videos', description: 'Watch and discover short videos.', icon: 'fa-solid fa-video', path: '/videos' },
  { label: 'Recommendations', description: 'Discover content and people you may like.', icon: 'fa-solid fa-wand-magic-sparkles', path: '/recommendations' },
  { label: 'Account Booster', description: 'Promote your profile and grow content reach.', icon: 'fa-solid fa-rocket', path: '/account-booster' },
  { label: 'Ads', description: 'Manage your advertising campaigns.', icon: 'fa-solid fa-bullhorn', path: '/ads' },
  { label: 'Wallet & earnings', description: 'Manage points, payments, and earnings.', icon: 'fa-solid fa-wallet', path: '/settings/wallet' },
  { label: 'Rewards & tasks', description: 'Earn Stars, points and withdrawable rewards.', icon: 'fa-solid fa-star', path: '/rewards' },
  { label: 'Verification', description: 'Manage account verification.', icon: 'fa-solid fa-circle-check', path: '/verification' },
  { label: 'Saved posts', description: 'View your bookmarks and saved posts.', icon: 'fa-solid fa-bookmark', path: '/books' },
  { label: 'Saved articles', description: 'Read articles you have saved.', icon: 'fa-solid fa-newspaper', path: '/saved-articles' },
  { label: 'Lists', description: 'Organize accounts and people into lists.', icon: 'fa-solid fa-list', path: '/lists' },
  { label: 'Nova AI', description: 'Open your QuickChat AI assistant.', icon: 'fa-solid fa-wand-sparkles', path: '/nova' },
  { label: 'Settings', description: 'Account, notifications, payments, and preferences.', icon: 'fa-solid fa-gear', path: '/settings' },
];

export default function Menu({ onLogout }) {
  const navigate = useNavigate();

  const logout = () => {
    onLogout?.();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  return (
    <div className="mx-auto min-h-full max-w-2xl bg-white pb-24 lg:pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
          <i className="fa-solid fa-arrow-left" />
        </button>
        <div>
          <h1 className="text-base font-extrabold text-slate-900">QuickChat menu</h1>
          <p className="text-[11px] text-slate-500">Your communities, content, and account tools.</p>
        </div>
      </header>

      <section className="p-4">
        <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700"><i className="fa-solid fa-bars" /></span>
            <div>
              <h2 className="text-sm font-extrabold">Everything in one place</h2>
              <p className="mt-1 text-xs text-slate-300">Quick access to the rest of QuickChat.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {items.map((item) => (
            <Link key={item.path} to={item.path} className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 no-underline transition hover:bg-slate-50 last:border-b-0">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className={item.icon} /></span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-slate-900">{item.label}</strong>
                <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
              </span>
              <i className="fa-solid fa-chevron-right text-xs text-slate-400" />
            </Link>
          ))}
        </div>

        <button type="button" onClick={logout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-50">
          <i className="fa-solid fa-right-from-bracket" /> Log out
        </button>
      </section>
    </div>
  );
}
