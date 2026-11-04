import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api';
import Avatar from './Avatar';
import useLiveActivity from '../live/useLiveActivity';
import { GiftBanner, GiftTray, HeartRain, LiveComments, LiveEndedCard, QuickGiftBar } from './live/LiveOverlays';

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

// Full-screen audience view of a live stream. The host's camera arrives over a
// peer connection negotiated through the API; comments, hearts, and gifts poll
// while the viewer stays in the room.
export default function LiveWatch({ sessionId, onExit }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const pendingIceRef = useRef([]);
  const signalCursorRef = useRef(0);
  const heartsIdRef = useRef(0);
  const likeCountRef = useRef(0);

  const [session, setSession] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [iceServers, setIceServers] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showUnmute, setShowUnmute] = useState(false);
  const [giftTrayOpen, setGiftTrayOpen] = useState(false);
  const [likeBurst, setLikeBurst] = useState({ id: 0, count: 0 });
  const [giftBanner, setGiftBanner] = useState(null);
  const [draftComment, setDraftComment] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [shareNote, setShareNote] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wallet, setWallet] = useState(null);

  const live = useLiveActivity(sessionId, {
    enabled: Boolean(sessionId),
    onEnded: () => setEnded(true),
  });

  const loadWallet = useCallback(async () => {
    try {
      const res = await apiRequest('/live/wallet');
      setWallet(res);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const sendQuickGift = async (gift) => {
    const balance = Number(wallet?.balance || 0);
    if (balance < gift.points) {
      setGiftTrayOpen(true);
      return;
    }
    try {
      const result = await apiRequest(`/live/sessions/${sessionId}/gifts`, {
        method: 'POST',
        body: { giftKey: gift.key },
      });
      setWallet((curr) => (curr ? { ...curr, balance: result.balance } : curr));
      live.applyGift(result.gift);
      setGiftBanner(result.gift);
    } catch (_err) {
      setGiftTrayOpen(true);
    }
  };

  // Heart bursts from other viewers and gift announcements.
  useEffect(() => {
    if (live.likes > likeCountRef.current) {
      const delta = Math.min(live.likes - likeCountRef.current, 6);
      likeCountRef.current = live.likes;
      heartsIdRef.current += 1;
      setLikeBurst({ id: heartsIdRef.current, count: delta });
    }
  }, [live.likes]);

  useEffect(() => {
    const latest = live.gifts[live.gifts.length - 1];
    if (latest) setGiftBanner(latest);
  }, [live.gifts]);

  useEffect(() => {
    if (!shareNote) return undefined;
    const timer = setTimeout(() => setShareNote(''), 2500);
    return () => clearTimeout(timer);
  }, [shareNote]);

  // Load the session description and ICE configuration.
  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    setError('');
    apiRequest(`/live/sessions/${sessionId}`)
      .then((result) => {
        if (!active) return;
        setSession(result.session);
        setIsHost(Boolean(result.isHost));
        setSeconds(Number(result.session.durationSeconds || 0));
        setIceServers(result.iceServers || []);
        if (result.session.status !== 'live') setEnded(true);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => { active = false; };
  }, [sessionId, reloadKey]);

  const sendSignal = useCallback(async (to, kind, payload) => {
    try {
      await apiRequest(`/live/sessions/${sessionId}/signals`, {
        method: 'POST',
        body: { to, kind, payload },
      });
    } catch (_error) {
      // The host may have just ended the stream.
    }
  }, [sessionId]);

  // Build the peer connection once the host's ICE servers are known.
  useEffect(() => {
    if (!session || isHost || !iceServers.length || ended) return undefined;
    if (pcRef.current) return undefined;

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(session.hostId, 'ice', event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {
          setMuted(true);
          setShowUnmute(true);
          if (videoRef.current) videoRef.current.muted = true;
        });
      }
      setConnectionState('connected');
    };
    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'failed') setError('The live connection dropped. Check your network and try again.');
    };

    void sendSignal(session.hostId, 'join', { name: 'viewer' });

    return () => {
      try { pc.close(); } catch (_error) { /* already closed */ }
      pcRef.current = null;
    };
  }, [session, isHost, iceServers, ended, sendSignal]);

  // Receive offers and ICE candidates from the host.
  useEffect(() => {
    if (!session || ended) return undefined;
    let active = true;
    let timer;

    const poll = async () => {
      try {
        const result = await apiRequest(`/live/sessions/${sessionId}/signals/poll`, {
          method: 'POST',
          body: { afterId: signalCursorRef.current },
        });
        const signals = result.signals || [];
        if (signals.length) signalCursorRef.current = Math.max(signalCursorRef.current, Number(signals[signals.length - 1].id));

        for (const signal of signals) {
          const pc = pcRef.current;
          if (!active || !pc) continue;
          if (signal.kind === 'offer' && signal.payload) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload)).catch(() => {});
            const answer = await pc.createAnswer().catch(() => null);
            if (answer) {
              await pc.setLocalDescription(answer).catch(() => {});
              if (pc.localDescription) {
                await sendSignal(session.hostId, 'answer', { type: 'answer', sdp: pc.localDescription.sdp });
              }
            }
            const queued = pendingIceRef.current;
            pendingIceRef.current = [];
            for (const candidate of queued) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else if (signal.kind === 'ice' && signal.payload) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.payload)).catch(() => {});
            } else {
              pendingIceRef.current.push(signal.payload);
            }
          } else if (signal.kind === 'bye') {
            setEnded(true);
          }
        }
      } catch (_error) {
        // The room may have ended; the activity feed reports that separately.
      } finally {
        if (active) timer = setTimeout(poll, 1200);
      }
    };

    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [session, sessionId, ended, sendSignal]);

  // Presence heartbeat plus a clean exit on navigation.
  useEffect(() => {
    if (!sessionId) return undefined;
    const beat = () => apiRequest(`/live/sessions/${sessionId}/heartbeat`, { method: 'POST' }).catch(() => {});
    beat();
    const timer = setInterval(beat, 12000);
    return () => {
      clearInterval(timer);
      apiRequest(`/live/sessions/${sessionId}/presence`, { method: 'DELETE' }).catch(() => {});
      sendSignal(session?.hostId, 'bye', null);
    };
  }, [sessionId, session?.hostId, sendSignal]);

  // The displayed duration ticks locally; the initial value is set when the
  // session description loads.
  useEffect(() => {
    if (!session || ended) return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [session?.id, ended]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
    if (!muted && videoRef.current) videoRef.current.play().catch(() => {});
  }, [muted]);

  const sendHeart = () => {
    heartsIdRef.current += 1;
    setLikeBurst({ id: heartsIdRef.current, count: 1 });
    apiRequest(`/live/sessions/${sessionId}/reactions`, { method: 'POST', body: { count: 1 } }).catch(() => {});
  };

  const sendComment = async (event) => {
    event?.preventDefault();
    const text = draftComment.trim();
    if (!text) return;
    setDraftComment('');
    try {
      const result = await apiRequest(`/live/sessions/${sessionId}/comments`, {
        method: 'POST',
        body: { text },
      });
      live.applyComment(result.comment);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const shareLive = async () => {
    const url = `${window.location.origin}/live/${sessionId}`;
    try {
      if (navigator.share) await navigator.share({ title: session?.title || 'Watch live on QuickChat', url });
      else {
        await navigator.clipboard.writeText(url);
        setShareNote('Live link copied');
      }
    } catch (_error) {
      setShareNote(url);
    }
  };

  const host = session?.host;
  const hosting = isHost || live.isHost;

  if (error && !session) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950 p-6 text-center text-white">
        <div className="max-w-sm">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10">
            <i className="fa-solid fa-tower-broadcast text-xl text-white/70" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold">This live is unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">{error}</p>
          <button type="button" onClick={onExit} className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-900">Back to live</button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black text-white">
        <div className="text-center">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-white/60" />
          <p className="mt-3 text-sm text-white/70">Joining the live stream…</p>
        </div>
      </div>
    );
  }

  if (hosting) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950 p-6 text-center text-white">
        <div className="max-w-sm">
          <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-white/10 ring-4 ring-red-500/40">
            {host?.picture
              ? <img src={host.picture} alt="" className="h-full w-full object-cover" />
              : <Avatar name={host?.name} size={80} />}
          </div>
          <h2 className="mt-4 text-lg font-extrabold">You are hosting this live</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {live.viewerCount} {live.viewerCount === 1 ? 'person is' : 'people are'} watching. Manage the stream from the device where you started it.
          </p>
          <button type="button" onClick={onExit} className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-900">Back to live</button>
        </div>
      </div>
    );
  }

  const isFullscreenSupported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  return (
    <div className="fixed inset-0 z-[100] h-full w-full overflow-hidden bg-black text-white select-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        onDoubleClick={sendHeart}
        className="absolute inset-0 h-full w-full object-cover cursor-pointer"
        title="Double tap to send hearts"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/85 pointer-events-none" />

      {/* Waiting poster while WebRTC connects */}
      {connectionState !== 'connected' && !ended && (
        <div className="absolute inset-0 z-[5] grid place-items-center bg-slate-950/75 backdrop-blur-sm">
          <div className="text-center p-6">
            <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-white/10 ring-4 ring-red-500/50 shadow-2xl">
              {host?.picture
                ? <img src={host.picture} alt="" className="h-full w-full object-cover" />
                : <Avatar name={host?.name} size={96} />}
            </div>
            <p className="mt-4 text-base font-extrabold">{host?.name || 'Creator'} is live</p>
            <p className="mt-1 text-xs text-white/60">
              <i className="fa-solid fa-circle-notch fa-spin mr-1.5 text-cyan-400" />Connecting to live stream…
            </p>
            {connectionState === 'failed' && (
              <button type="button" onClick={() => { setError(''); setConnectionState('connecting'); setReloadKey((value) => value + 1); }} className="mt-4 rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-900 shadow-lg active:scale-95">Try again</button>
            )}
          </div>
        </div>
      )}

      <HeartRain burst={likeBurst} />

      {/* TOP HEADER */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2 bg-black/40 backdrop-blur-md rounded-full py-1 pl-1 pr-3 border border-white/15">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-red-500 shadow-md">
            {host?.picture
              ? <img src={host.picture} alt="" className="h-full w-full object-cover" />
              : <Avatar name={host?.name} size={40} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs font-extrabold text-white">{host?.name || 'Creator'}</p>
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-wider">
                LIVE
              </span>
            </div>
            <p className="truncate text-[10.5px] text-white/70">
              <i className="fa-solid fa-eye text-[9px] mr-1 text-cyan-300" />{live.viewerCount} watching
              <span className="ml-1.5 text-white/50">· {formatDuration(seconds)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {/* Host Points earned pill */}
          <div className="flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-md border border-amber-300/30 text-amber-300 text-xs font-extrabold">
            <i className="fa-solid fa-coins text-amber-400 text-xs" />
            <span>{live.giftPoints.toLocaleString()}</span>
          </div>

          {showUnmute && (
            <button type="button" onClick={() => { setMuted(false); setShowUnmute(false); }} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-slate-900 shadow-md">
              <i className="fa-solid fa-volume-high" />Unmute
            </button>
          )}

          {isFullscreenSupported && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md border border-white/15 hover:bg-black/60 transition active:scale-95"
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'} text-sm`} />
            </button>
          )}

          <button
            type="button"
            onClick={onExit}
            className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md border border-white/15 hover:bg-black/60 transition active:scale-95"
            aria-label="Close live stream"
          >
            <i className="fa-solid fa-xmark text-base" />
          </button>
        </div>
      </header>

      {/* RIGHT ACTION RAIL */}
      <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-3.5">
        <button type="button" onClick={sendHeart} className="flex flex-col items-center gap-0.5 text-white group" aria-label="Send hearts">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 border border-white/15 backdrop-blur-md transition active:scale-75 group-hover:scale-105 shadow-xl">
            <i className="fa-solid fa-heart text-2xl text-rose-500 animate-pulse" />
          </span>
          <span className="text-[10px] font-extrabold text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">{live.likes.toLocaleString()}</span>
        </button>

        <button type="button" onClick={() => setGiftTrayOpen(true)} className="flex flex-col items-center gap-0.5 text-white group" aria-label="Send gift or buy points">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 shadow-2xl transition active:scale-75 group-hover:scale-105 ring-2 ring-white/30">
            <i className="fa-solid fa-gift text-xl text-white drop-shadow" />
          </span>
          <span className="text-[9.5px] font-extrabold text-amber-300 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">Gift / Buy</span>
        </button>

        <button type="button" onClick={shareLive} className="flex flex-col items-center gap-0.5 text-white" aria-label="Share live stream">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45 border border-white/15 backdrop-blur-md transition active:scale-90 hover:bg-black/65 shadow-lg">
            <i className="fa-solid fa-share-nodes text-sm" />
          </span>
          <span className="text-[9.5px] font-semibold text-white/80">Share</span>
        </button>

        <button type="button" onClick={() => setCommentsOpen((value) => !value)} className="flex flex-col items-center gap-0.5 text-white" aria-label="Toggle comments">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45 border border-white/15 backdrop-blur-md transition active:scale-90 hover:bg-black/65 shadow-lg">
            <i className={`fa-solid ${commentsOpen ? 'fa-comment' : 'fa-comment-slash'} text-sm`} />
          </span>
          <span className="text-[9.5px] font-semibold text-white/80">{commentsOpen ? 'Hide' : 'Show'}</span>
        </button>
      </div>

      {/* BOTTOM OVERLAYS: COMMENTS & INPUT */}
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-20 pointer-events-none">
        {giftBanner && <GiftBanner key={giftBanner.id} gift={giftBanner} onDone={() => setGiftBanner(null)} />}

        {commentsOpen && <LiveComments comments={live.comments.slice(-18)} className="pr-16" />}
        {live.comments.length === 0 && commentsOpen && (
          <p className="pr-16 text-[12px] text-white/60 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)] font-medium">Say hello — comments and hearts are visible to the host!</p>
        )}
        {error && session && <p className="text-[11.5px] text-amber-200 bg-black/60 px-2.5 py-1 rounded-md inline-block">{error}</p>}
        {shareNote && <p className="text-[11.5px] font-extrabold text-white bg-black/60 px-2.5 py-1 rounded-md inline-block">{shareNote}</p>}

        {/* 1-Tap Quick Gift Bar */}
        <div className="pointer-events-auto pr-14">
          <QuickGiftBar
            wallet={wallet}
            onSendQuickGift={sendQuickGift}
            onOpenFullTray={() => setGiftTrayOpen(true)}
          />
        </div>

        {ended ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 backdrop-blur-md border border-white/10">
            <i className="fa-solid fa-circle-stop text-red-400" />
            <span className="text-xs font-bold">This live stream has ended.</span>
          </div>
        ) : (
          <form onSubmit={sendComment} className="pointer-events-auto flex items-center gap-2 pr-14">
            <input
              value={draftComment}
              onChange={(event) => setDraftComment(event.target.value.slice(0, 300))}
              placeholder="Add a comment… (double tap video for hearts)"
              className="h-10 min-w-0 flex-1 rounded-full border border-white/20 bg-black/50 px-4 text-[13px] text-white placeholder:text-white/45 outline-none backdrop-blur-md focus:border-cyan-400 focus:bg-black/70 shadow-lg"
            />
            <button
              type="submit"
              disabled={!draftComment.trim()}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 text-white transition active:scale-90 disabled:opacity-40 shadow-lg"
              aria-label="Send comment"
            >
              <i className="fa-solid fa-paper-plane text-sm" />
            </button>
          </form>
        )}
      </div>

      <GiftTray
        open={giftTrayOpen}
        sessionId={sessionId}
        hostName={host?.name}
        onClose={() => setGiftTrayOpen(false)}
        onSent={(gift) => {
          live.applyGift(gift);
          setGiftBanner(gift);
        }}
      />

      {ended && (
        <LiveEndedCard
          session={session}
          onClose={onExit}
          headline="Live ended"
        />
      )}
    </div>
  );
}
