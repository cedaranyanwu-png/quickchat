import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';

// A slim "who is live" rail on Home. It only appears when somebody is live so
// the feed stays calm when nobody is streaming.
export default function LiveNowStrip() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await apiRequest('/live/sessions');
        if (active) setSessions(result.sessions || []);
      } catch (_error) {
        // Home should never fail because the live directory is unavailable.
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  if (!sessions.length) return null;

  return (
    <div className="border-b border-slate-200 bg-gradient-to-r from-rose-50 via-white to-white px-4 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
        </span>
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-red-600">Live now</span>
        <button type="button" onClick={() => navigate('/live')} className="ml-auto text-[11px] font-bold text-slate-500 hover:text-slate-800">See all</button>
      </div>
      <div className="qc-no-scrollbar flex gap-3 overflow-x-auto pb-0.5">
        {sessions.slice(0, 12).map((session) => (
          <button key={session.id} type="button" onClick={() => navigate(`/live/${session.id}`)} className="flex w-16 flex-shrink-0 flex-col items-center gap-1 text-center">
            <span className="relative">
              <span className="block h-14 w-14 overflow-hidden rounded-full ring-2 ring-red-500 ring-offset-2 ring-offset-white">
                {session.host?.picture
                  ? <img src={session.host.picture} alt="" className="h-full w-full object-cover" />
                  : <Avatar name={session.host?.name} size={56} />}
              </span>
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-1.5 py-[1px] text-[8px] font-extrabold text-white">LIVE</span>
            </span>
            <span className="mt-1 w-full truncate text-[10px] font-bold text-slate-700">{session.host?.name} <VerifiedBadge verified={session.host?.verified} /></span>
            <span className="text-[9px] text-slate-400">{session.viewers} watching</span>
          </button>
        ))}
      </div>
    </div>
  );
}
