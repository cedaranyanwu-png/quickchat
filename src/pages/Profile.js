import React from 'react';
import { Link } from 'react-router-dom';
import ProfilePage from '../components/ProfilePage';

export default function Profile(props) {
  return <>
    <div className="mx-auto flex max-w-4xl justify-end px-4 pt-3 lg:hidden">
      <Link to="/settings" aria-label="Open settings" title="Settings" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-blue-700">
        <i className="fa-solid fa-gear" />
      </Link>
    </div>
    <ProfilePage {...props} />
  </>;
}
