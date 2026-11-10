import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';

export default function RewardPopupHost() {
  const [popup, setPopup] = useState(null);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await apiRequest('/rewards-program/popup');
        if (active && result.popups?.length) setPopup(result.popups[0]);
      } catch (_error) {}
    };
    poll();
    const timer = setInterval(poll, 20000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!popup) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="quickchat-popup-title">
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-2xl text-blue-700"><i className="fa-solid fa-bell" /></div>
      <h2 id="quickchat-popup-title" className="mt-4 text-xl font-black text-slate-950">{popup.title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{popup.message}</p>
      <button onClick={()=>setPopup(null)} className="mt-5 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">Continue</button>
    </div>
  </div>;
}
