import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../api';

const MENU_WIDTH = 224;
const VIEWPORT_GUTTER = 12;
const TOP_SAFE_AREA = 80;

export function sharedUrl(path) {
  return new URL(path, window.location.origin).toString();
}

export function mediaDownloadUrl(mediaUrl) {
  if (!mediaUrl) return '';
  try {
    const parsed = new URL(mediaUrl, window.location.origin);
    const match = parsed.pathname.match(/\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|gif|webp|mp4|webm|mov))$/i);
    if (!match) return mediaUrl;
    const apiBase = API_BASE_URL.startsWith('http')
      ? API_BASE_URL
      : new URL(API_BASE_URL, window.location.origin).toString().replace(/\/$/, '');
    return `${apiBase}/downloads/${encodeURIComponent(match[1])}`;
  } catch (_error) {
    return mediaUrl;
  }
}

export default function ShareMenu({ path, title, text = '', downloads = [], label = 'Share', downloadTextLabel = 'Download post text', buttonClassName = '' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const menuRef = useRef(null);
  const menuPanelRef = useRef(null);
  const buttonRef = useRef(null);
  const url = useMemo(() => sharedUrl(path), [path]);
  const shareText = [text, url].filter(Boolean).join(' ');
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent([title, text].filter(Boolean).join(' '));

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeFromKeyboard = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', closeFromOutside);
    document.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.removeEventListener('click', closeFromOutside);
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const positionMenu = () => {
      const button = buttonRef.current;
      const panel = menuPanelRef.current;
      if (!button || !panel) return;

      const rect = button.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const safeTop = Math.min(TOP_SAFE_AREA, viewportHeight - VIEWPORT_GUTTER);
      const maxWidth = Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2);
      const width = Math.min(MENU_WIDTH, maxWidth);
      const left = Math.max(VIEWPORT_GUTTER, Math.min(rect.right - width, viewportWidth - width - VIEWPORT_GUTTER));
      const above = Math.max(0, rect.top - safeTop - VIEWPORT_GUTTER);
      const below = Math.max(0, viewportHeight - rect.bottom - VIEWPORT_GUTTER);
      const placeAbove = above >= Math.min(panel.scrollHeight, 280) || above > below;
      const availableHeight = placeAbove ? above : below;
      const height = Math.min(panel.scrollHeight, availableHeight);
      const top = placeAbove ? Math.max(safeTop, rect.top - height - VIEWPORT_GUTTER) : rect.bottom + VIEWPORT_GUTTER;

      setMenuStyle({ left, top, width, maxHeight: height });
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, downloads.length]);

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_error) {
      setCopied(false);
    }
  };

  const downloadText = () => {
    const content = [title, text, url].filter(Boolean).join('\n\n');
    const blobUrl = window.URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    const resourceName = path.split('/').filter(Boolean).slice(-2).join('-').replace(/[^a-z0-9-]/gi, '') || 'post';
    anchor.href = blobUrl;
    anchor.download = `quickchat-${resourceName}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
  };

  const nativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, text, url });
      setOpen(false);
    } catch (error) {
      if (error?.name !== 'AbortError') setCopied(false);
    }
  };

  return <div ref={menuRef} className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
    <button ref={buttonRef} type="button" onClick={() => setOpen((shown) => !shown)} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${buttonClassName}`}>
      <i className="fa-solid fa-arrow-up-from-bracket" />
      <span>{label}</span>
    </button>
    {open && <div ref={menuPanelRef} role="menu" aria-label="Share options" style={menuStyle} className="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-800 shadow-xl">
      {typeof navigator !== 'undefined' && navigator.share && <button type="button" role="menuitem" onClick={nativeShare} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"><i className="fa-solid fa-share-nodes w-4 text-blue-700" />Share…</button>}
      <button type="button" role="menuitem" onClick={copyLink} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"><i className="fa-regular fa-copy w-4 text-slate-500" />{copied ? 'Link copied' : 'Copy link'}</button>
      <a role="menuitem" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 no-underline hover:bg-slate-50"><i className="fa-brands fa-whatsapp w-4 text-emerald-600" />WhatsApp</a>
      <a role="menuitem" href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 no-underline hover:bg-slate-50"><i className="fa-brands fa-x-twitter w-4 text-slate-900" />X</a>
      <a role="menuitem" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 no-underline hover:bg-slate-50"><i className="fa-brands fa-facebook w-4 text-blue-700" />Facebook</a>
      <div className="my-1 border-t border-slate-100" />
      <button type="button" role="menuitem" onClick={downloadText} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"><i className="fa-solid fa-download w-4 text-blue-700" />{downloadTextLabel}</button>
      {downloads.map((media, index) => <a key={`${media.url}-${index}`} role="menuitem" href={mediaDownloadUrl(media.url)} download={media.filename || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 no-underline hover:bg-slate-50"><i className="fa-solid fa-download w-4 text-blue-700" />{media.label || `Download ${media.type || 'media'}`}</a>)}
      <div className="px-3 pb-1 pt-1 text-[10px] text-slate-400">{copied ? 'Ready to share anywhere' : 'Share this QuickChat link'}</div>
    </div>}
  </div>;
}
