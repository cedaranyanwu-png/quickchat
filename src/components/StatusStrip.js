import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, resolveMediaUrl, uploadMedia } from '../api';
import Avatar from './Avatar';

const COLORS = ['#123b8a', '#174ea6', '#0f766e', '#7c3aed', '#be185d'];

export default function StatusStrip() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [statusText, setStatusText] = useState('');
  const [backgroundColor, setBackgroundColor] = useState(COLORS[0]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const loadStatuses = useCallback(async () => {
    try {
      const result = await apiRequest('/statuses');
      setGroups(result.statuses || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  const ownGroup = groups.find((group) => group.isOwn);
  const otherGroups = groups.filter((group) => !group.isOwn);

  const openGroup = (group) => {
    if (!group?.statuses?.length) return;
    const firstUnseen = group.statuses.findIndex((status) => !status.viewed);
    setViewer({ group, index: firstUnseen >= 0 ? firstUnseen : 0 });
  };

  const markViewed = useCallback(async (status) => {
    if (!status || status.viewed) return;
    setGroups((current) => current.map((group) => ({
      ...group,
      statuses: group.statuses.map((item) => item.id === status.id ? { ...item, viewed: true } : item),
      viewedCount: group.statuses.filter((item) => item.id === status.id || item.viewed).length,
    })));
    try {
      await apiRequest(`/statuses/${status.id}/views`, { method: 'POST' });
    } catch (_error) {
      // Keep the viewer responsive; the next refresh will reconcile the state.
    }
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const status = viewer.group.statuses[viewer.index];
    if (status) markViewed(status);
  }, [viewer?.group?.userId, viewer?.index, markViewed]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeViewer = () => setViewer(null);
  const moveViewer = (direction) => {
    if (!viewer) return;
    const nextIndex = viewer.index + direction;
    if (nextIndex >= 0 && nextIndex < viewer.group.statuses.length) {
      setViewer({ ...viewer, index: nextIndex });
      return;
    }
    if (direction > 0) {
      const groupIndex = otherGroups.findIndex((group) => group.userId === viewer.group.userId);
      const nextGroup = otherGroups[groupIndex + 1];
      if (nextGroup) {
        const firstUnseen = nextGroup.statuses.findIndex((status) => !status.viewed);
        setViewer({ group: nextGroup, index: firstUnseen >= 0 ? firstUnseen : 0 });
      } else closeViewer();
    }
  };

  const publishStatus = async (event) => {
    event.preventDefault();
    if (posting) return;
    const text = statusText.trim();
    if (!selectedFile && !text) {
      setError('Write a status or select an image/video.');
      return;
    }
    setPosting(true);
    setError('');
    try {
      let type = 'text';
      let mediaUrl = '';
      if (selectedFile) {
        const upload = await uploadMedia(selectedFile);
        mediaUrl = upload.url;
        type = selectedFile.type.startsWith('video/') ? 'video' : 'image';
      }
      await apiRequest('/statuses', {
        method: 'POST',
        body: { type, text, mediaUrl, backgroundColor },
      });
      setComposerOpen(false);
      setStatusText('');
      setSelectedFile(null);
      await loadStatuses();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPosting(false);
    }
  };

  const deleteCurrentStatus = async () => {
    if (!viewer) return;
    const status = viewer.group.statuses[viewer.index];
    if (!viewer.group.isOwn || !status) return;
    try {
      await apiRequest(`/statuses/${status.id}`, { method: 'DELETE' });
      setViewer(null);
      await loadStatuses();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="border-b border-slate-100 bg-white px-3 py-3" aria-label="Status updates">
      <div className="mb-2 flex items-center justify-between px-1">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Status</h3>
          <p className="text-[10px] text-slate-400">Share a moment · disappears in 24 hours</p>
        </div>
        <button type="button" onClick={() => setComposerOpen(true)} className="rounded-full px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50">
          <i className="fa-solid fa-plus mr-1" /> Add status
        </button>
      </div>
      <div className="qc-status-scroll flex gap-4 overflow-x-auto pb-1">
        <button type="button" onClick={() => ownGroup ? openGroup(ownGroup) : setComposerOpen(true)} className="flex w-[66px] flex-shrink-0 flex-col items-center gap-1.5 border-0 bg-transparent p-0">
          <span className="relative grid h-[62px] w-[62px] place-items-center rounded-full border-2 border-dashed border-slate-300 p-1">
            <Avatar name="Your status" picture={ownGroup?.picture} size={48} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-blue-700 text-white shadow"><i className="fa-solid fa-plus text-[10px]" /></span>
          </span>
          <span className="max-w-full truncate text-[10px] font-semibold text-slate-600">My status</span>
        </button>
        {otherGroups.map((group) => <StatusAvatar key={group.userId} group={group} onClick={() => openGroup(group)} />)}
        {!loading && !ownGroup && otherGroups.length === 0 && <p className="self-center text-xs text-slate-400">No new status updates yet.</p>}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

      {composerOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3" onClick={() => !posting && setComposerOpen(false)}>
        <form onSubmit={publishStatus} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-extrabold text-slate-900">Create status</h3><p className="text-xs text-slate-500">Visible to people who follow you</p></div><button type="button" disabled={posting} onClick={() => setComposerOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100" aria-label="Close"><i className="fa-solid fa-xmark" /></button></div>
          <textarea value={statusText} onChange={(event) => setStatusText(event.target.value)} maxLength={700} rows={4} placeholder="What's happening?" className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" />
          <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-slate-400">{statusText.length}/700</span><div className="flex gap-1">{COLORS.map((color) => <button key={color} type="button" onClick={() => setBackgroundColor(color)} aria-label={`Choose ${color} background`} className={`h-5 w-5 rounded-full border-2 ${backgroundColor === color ? 'border-slate-900' : 'border-white'}`} style={{ backgroundColor: color }} />)}</div></div>
          <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:bg-blue-50"><i className="fa-solid fa-photo-film text-blue-700" /><span className="min-w-0 flex-1 truncate">{selectedFile ? selectedFile.name : 'Add photo or video'}</span><input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} /></label>
          {selectedFile && <button type="button" onClick={() => setSelectedFile(null)} className="mt-1 text-xs font-semibold text-red-600">Remove attachment</button>}
          <button type="submit" disabled={posting || (!statusText.trim() && !selectedFile)} className="mt-5 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{posting ? 'Publishing…' : 'Share status'}</button>
        </form>
      </div>}

      {viewer && <StatusViewer viewer={viewer} onClose={closeViewer} onMove={moveViewer} onDelete={deleteCurrentStatus} />}
    </section>
  );
}

function StatusAvatar({ group, onClick }) {
  const count = Math.max(1, group.statuses.length);
  const slice = 360 / count;
  const stops = group.statuses.map((status, index) => {
    const color = status.viewed ? '#cbd5e1' : '#123b8a';
    const start = index * slice;
    return `${color} ${start}deg ${Math.max(start, (index + 1) * slice - 3)}deg, #ffffff ${Math.max(start, (index + 1) * slice - 3)}deg ${(index + 1) * slice}deg`;
  }).join(', ');
  const ringStyle = useMemo(() => ({ background: `conic-gradient(${stops})`, boxShadow: group.statuses.some((status) => !status.viewed) ? '0 0 0 2px rgba(18,59,138,.08), 0 0 13px rgba(18,59,138,.24)' : 'none' }), [stops, group.statuses]);
  return <button type="button" onClick={onClick} className="flex w-[66px] flex-shrink-0 flex-col items-center gap-1.5 border-0 bg-transparent p-0">
    <span className="qc-status-ring grid h-[62px] w-[62px] place-items-center rounded-full p-[3px]" style={ringStyle}><span className="grid h-full w-full place-items-center rounded-full bg-white p-[2px]"><Avatar name={group.name} picture={group.picture} size={48} /></span></span>
    <span className="max-w-full truncate text-[10px] font-semibold text-slate-600">{group.name || group.username}</span>
  </button>;
}

function StatusViewer({ viewer, onClose, onMove, onDelete }) {
  const status = viewer.group.statuses[viewer.index];
  if (!status) return null;
  const mediaUrl = resolveMediaUrl(status.mediaUrl);
  const elapsed = status.createdAt ? new Date(status.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Status viewer">
    <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-slate-950 sm:h-[min(90dvh,760px)] sm:rounded-2xl">
      <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
        {viewer.group.statuses.map((item, index) => <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"><span className={`block h-full rounded-full ${index <= viewer.index ? 'bg-white' : 'bg-transparent'}`} /></span>)}
      </div>
      <header className="relative z-20 mt-5 flex items-center gap-2 px-4 py-3 text-white">
        <Avatar name={viewer.group.name} picture={viewer.group.picture} size={34} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{viewer.group.name || viewer.group.username}</p><p className="text-[10px] text-white/65">{elapsed}</p></div>
        {viewer.group.isOwn && <button type="button" onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Delete status"><i className="fa-solid fa-trash" /></button>}
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close status"><i className="fa-solid fa-xmark text-lg" /></button>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden" style={{ background: status.type === 'text' ? status.backgroundColor : '#020617' }}>
        {status.type === 'image' && mediaUrl && <img src={mediaUrl} alt="Status" className="max-h-full max-w-full object-contain" />}
        {status.type === 'video' && mediaUrl && <video src={mediaUrl} autoPlay playsInline controls className="max-h-full max-w-full" />}
        {status.type === 'text' && <p className="whitespace-pre-wrap px-8 text-center text-2xl font-bold leading-relaxed text-white">{status.text}</p>}
        {status.type !== 'text' && status.text && <p className="absolute bottom-8 left-5 right-5 rounded-xl bg-black/55 px-4 py-3 text-center text-sm text-white">{status.text}</p>}
        <button type="button" onClick={() => onMove(-1)} disabled={viewer.index === 0} className="absolute bottom-0 left-0 top-0 w-1/3" aria-label="Previous status" />
        <button type="button" onClick={() => onMove(1)} className="absolute bottom-0 right-0 top-0 w-2/3" aria-label="Next status" />
      </div>
      <div className="px-4 py-3 text-center text-[11px] text-white/55">Status disappears after 24 hours</div>
    </div>
  </div>;
}
