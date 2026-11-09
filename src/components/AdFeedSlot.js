import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api';

function ScriptAdFrame({ ad }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(160);

  useEffect(() => {
    const onMessage = (event) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const nextHeight = Number(event.data?.quickchatAdHeight);
      if (Number.isFinite(nextHeight) && nextHeight >= 80 && nextHeight <= 1200) {
        setHeight(Math.ceil(nextHeight));
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <article className="border-b border-slate-200 bg-white px-4 py-3" aria-label="Sponsored advertisement">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Sponsored</span>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-blue-700">Ad</span>
        </div>
        <iframe
          ref={iframeRef}
          title={`Advertisement: ${ad.title || 'Sponsored content'}`}
          src={`/api/ads/render/${encodeURIComponent(ad.id)}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          style={{
            display: 'block',
            width: '100%',
            height: `${height}px`,
            minHeight: 80,
            border: 0,
            background: 'transparent',
          }}
        />
      </div>
    </article>
  );
}

function AdCard({ ad }) {
  if (!ad) return null;
  return (
    <article className="border-b border-slate-200 bg-white px-4 py-4 transition-colors hover:bg-slate-50/60">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700"><i className="fa-solid fa-bullhorn text-sm" /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-900">QuickChat Ads</p><p className="text-[10px] text-slate-400">Sponsored</p></div>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-blue-700">Ad</span>
        </div>
        <h3 className="mt-3 text-sm font-extrabold leading-5 text-slate-900">{ad.title}</h3>
        {ad.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{ad.description}</p>}
        {ad.imageUrl && <a href={ad.destinationUrl} target="_blank" rel="noopener noreferrer sponsored" aria-label={`Open ${ad.title}`} className="mt-3 block overflow-hidden rounded-xl border border-slate-100 bg-slate-50"><img src={ad.imageUrl} alt={ad.title} loading="lazy" className="max-h-72 w-full object-cover" /></a>}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="min-w-0 truncate text-[10px] font-semibold text-slate-400">Sponsored content</span><a href={ad.destinationUrl} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800">Learn more <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" /></a></div>
      </div>
    </article>
  );
}

export default function AdFeedSlot({ className = '', placement = 'home', slotIndex = 0 }) {
  const [ad, setAd] = useState(null);

  useEffect(() => {
    let active = true;
    apiRequest('/ads/placements')
      .then((result) => {
        if (!active) return;
        const eligible = (result.ads || []).filter((item) => item.active && (item.placement === 'both' || item.placement === placement));
        if (eligible.length) setAd(eligible[Math.abs(Number(slotIndex) || 0) % eligible.length]);
      })
      .catch(() => { if (active) setAd(null); });
    return () => { active = false; };
  }, [placement, slotIndex]);

  if (!ad) return null;
  if (ad.type === 'script' && ad.scriptCode) return <div className={className}><ScriptAdFrame ad={ad} /></div>;
  return <section aria-label="Sponsored content" className={className}><AdCard ad={ad} /></section>;
}
