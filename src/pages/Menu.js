import React from 'react';
import { Link } from 'react-router-dom';

const items = [
  ['Communities', 'fa-solid fa-users', '/communities', 'Create a community or join existing spaces.'],
  ['Profile', 'fa-solid fa-user', '/profile', 'View your profile and posts.'],
  ['Messages', 'fa-solid fa-envelope', '/messages', 'Open your conversations.'],
  ['Videos', 'fa-solid fa-video', '/videos', 'Watch and upload short-form videos.'],
  ['People', 'fa-solid fa-user-plus', '/follow', 'Find people to follow.'],
  ['Recommendations', 'fa-solid fa-wand-magic-sparkles', '/recommendations', 'Tune into content and people you may like.'],
  ['Books', 'fa-solid fa-bookmark', '/books', 'Saved posts and bookmarks.'],
  ['Settings', 'fa-solid fa-gear', '/settings', 'Account, notifications, payments and logout.'],
];

export default function Menu() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24 lg:pb-8">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-extrabold text-slate-900">QuickChat Menu</h1>
        <p className="mt-1 text-xs text-slate-500">Everything that does not fit in the main mobile navigation.</p>
      </header>
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        {items.map(([name, icon, path, description]) => (
          <Link key={path} to={path} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <i className={icon} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-slate-900">{name}</strong>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
            </span>
            <i className="fa-solid fa-chevron-right text-xs text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
