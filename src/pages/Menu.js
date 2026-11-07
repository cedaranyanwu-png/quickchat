import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const items = [
  { label: 'Communities', description: 'Create, discover, and join communities.', icon: 'fa-solid fa-users', path: '/communities' },
  { label: 'Messages', description: 'Open your conversations.', icon: 'fa-solid fa-envelope', path: '/messages' },
  { label: 'Videos', description: 'Watch and discover short videos.', icon: 'fa-solid fa-video', path: '/videos' },
  { label: 'People', description: 'Find people to follow.', icon: 'fa-solid fa-user-plus', path: '/follow' },
  { label: 'Saved posts', description: 'View your bookmarked posts.', icon: 'fa-solid fa-bookmark', path: '/books' },
  { label: 'Settings', description: 'Account, notifications, payouts, and preferences.', icon: 'fa-solid fa-gear', path: '/settings' },
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
          <h1 className="text-base font-extrabold text-slate-900">Menu</h1>
          <p className="text-[11px] text-slate-500">Everything QuickChat keeps outside the main navigation.</p>
        </div>
      </header>

      <section className="p-4">
        <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700"><i className="fa-solid fa-bars" /></span>
            <div>
              <h2 className="text-sm font-extrabold">QuickChat menu</h2>
              <p className="mt-1 text-xs text-slate-300">Communities, settings, saved content, and more.</p>
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

        <p className="mt-4 px-1 text-[11px] leading-5 text-slate-500">
          To keep the mobile menu focused, logout is available from <strong>Settings</strong>.
        </p>
      </section>
    </div>
  );
}
