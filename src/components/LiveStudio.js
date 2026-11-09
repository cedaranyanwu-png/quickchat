import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, uploadMedia } from '../api';
import Avatar from './Avatar';
import useLiveActivity from '../live/useLiveActivity';
import { GiftBanner, HeartRain, LiveComments } from './live/LiveOverlays';

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

// Full-screen live studio. The host's camera fills the screen, viewers' comments
// and hearts appear over the video, and gifts are announced as they arrive.
// Every viewer gets a direct WebRTC connection; signaling travels over the API.
export default function LiveStudio({ caption = '', profile, onCancel, onPosted }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionRef = useRef(null);
  const iceServersRef = useRef([]);
  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const signalCursorRef = useRef(0);
  const heartsIdRef = useRef(0);
  const endingRef = useRef(false);
  const postedRef = useRef(null);
  const onPostedRef = useRef(onPosted);
  const captionRef = useRef(caption);
  const onCancelRef = useRef(onCancel);
  const likeCountRef = useRef(0);

  const [phase, setPhase] = useState('starting');
  const [session, setSession] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [replayError, setReplayError] = useState('');
  const [replayStatus, setReplayStatus] = useState('idle');
  const [summary, setSummary] = useState(null);
  const [muted, setMuted] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [likeBurst, setLikeBurst] = useState({ id: 0, count: 0 });
  const [giftBanner, setGiftBanner] = useState(null);
  const [draftComment, setDraftComment] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [facingMode, setFacingMode] = useState('user');


  const live = useLiveActivity(session?.id, { enabled: Boolean(session?.id) && phase === 'live' });

  useEffect(() => {
    onPostedRef.current = onPosted;
    onCancelRef.current = onCancel;
    captionRef.current = caption;
  }, [onPosted, onCancel, caption]);

  const sendSignal = useCallback(async (to, kind, payload) => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    try {
      await apiRequest(`/live/sessions/${activeSession.id}/signals`, {
        method: 'POST',
        body: { to, kind, payload },
      });
    } catch (_error) {
      // A viewer that left mid-negotiation is expected; keep the stream running.
    }
  }, []);

  const closePeer = useCallback((viewerId) => {
    const pc = peersRef.current.get(viewerId);
    if (pc) {
      try { pc.close(); } catch (_error) { /* already closed */ }
      peersRef.current.delete(viewerId);
    }
    pendingIceRef.current.delete(viewerId);
  }, []);

  const createPeerFor = useCallback(async (viewerId) => {
    if (!streamRef.current) return;
    closePeer(viewerId);
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peersRef.current.set(viewerId, pc);
    pendingIceRef.current.set(viewerId, []);

    streamRef.current.getTracks().forEach((track) => pc.addTrack(track, streamRef.current));
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(viewerId, 'ice', event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(viewerId);
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(viewerId, 'offer', { type: 'offer', sdp: pc.localDescription.sdp });
    } catch (_error) {
      closePeer(viewerId);
    }
  }, [closePeer, sendSignal]);

  const handleSignal = useCallback(async (signal) => {
    const from = Number(signal.from);
    if (signal.kind === 'join') {
      await createPeerFor(from);
      return;
    }
    if (signal.kind === 'bye') {
      closePeer(from);
      return;
    }
    const pc = peersRef.current.get(from);
    if (!pc) return;
    try {
      if (signal.kind === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        const queued = pendingIceRef.current.get(from) || [];
        pendingIceRef.current.set(from, []);
        for (const candidate of queued) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else if (signal.kind === 'ice' && signal.payload) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.payload)).catch(() => {});
        } else {
          pendingIceRef.current.get(from)?.push(signal.payload);
        }
      }
    } catch (_error) {
      // Negotiation failures for one viewer do not affect the rest of the stream.
    }
  }, [closePeer, createPeerFor]);

  // Poll for viewer joins/answers while this host is live.
  useEffect(() => {
    const activeSession = session?.id;
    if (!activeSession || phase !== 'live') return undefined;
    let active = true;
    let timer;

    const poll = async () => {
      try {
        const result = await apiRequest(`/live/sessions/${activeSession}/signals/poll`, {
          method: 'POST',
          body: { afterId: signalCursorRef.current },
        });
        const signals = result.signals || [];
        if (signals.length) signalCursorRef.current = Math.max(signalCursorRef.current, Number(signals[signals.length - 1].id));
        for (const signal of signals) await handleSignal(signal);
      } catch (_error) {
        // Retry on the next tick.
      } finally {
        if (active) timer = setTimeout(poll, 1200);
      }
    };

    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [session?.id, phase, handleSignal]);

  // Heart bursts and gift announcements come from the polled activity feed.
  useEffect(() => {
    if (live.likes > likeCountRef.current) {
      const delta = Math.min(live.likes - likeCountRef.current, 8);
      likeCountRef.current = live.likes;
      heartsIdRef.current += 1;
      setLikeBurst({ id: heartsIdRef.current, count: delta });
    }
  }, [live.likes]);

  useEffect(() => {
    const latest = live.gifts[live.gifts.length - 1];
    if (latest) setGiftBanner(latest);
  }, [live.gifts]);

  // Publish the recording as a replay post after the stream ends.
  const publishReplay = useCallback(async (blob) => {
    if (!blob?.size) {
      setReplayError('No recording was captured, so no replay was posted.');
      setReplayStatus('failed');
      return;
    }
    setReplayStatus('publishing');
    try {
      const file = new File([blob], `live-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
      const uploaded = await uploadMedia(file);
      const result = await apiRequest('/posts', {
        method: 'POST',
        body: {
          text: `🔴 LIVE replay · ${captionRef.current.trim() || 'Live from QuickChat'}`,
          media: [{ type: 'video', url: uploaded.url }],
        },
      });
      postedRef.current = result.post;
      setReplayStatus('published');
    } catch (requestError) {
      setReplayStatus('failed');
      setReplayError(requestError.message);
    }
  }, []);

  // Start the camera once, then open the live session and recorder.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let sessionTimer;

    const stopTracks = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support camera access. Use a recent Chrome, Edge, or Safari build.');
        setPhase('error');
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (cameraError) {
        if (cancelled) return;
        setError(cameraError?.name === 'NotAllowedError'
          ? 'Camera and microphone permission was denied. Allow access and try again.'
          : 'Could not start the camera. Check that no other app is using it.');
        setPhase('error');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;



      if (typeof MediaRecorder === 'undefined') {
        setError('This browser can show the camera but cannot record. Try Chrome or Edge.');
        setPhase('error');
        return;
      }

      let created;
      try {
        created = await apiRequest('/live/sessions', {
          method: 'POST',
          body: { title: captionRef.current.trim().slice(0, 200) },
        });
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
          setPhase('error');
        }
        return;
      }
      if (cancelled) return;

      sessionRef.current = created.session;
      iceServersRef.current = created.iceServers || [];
      setSession(created.session);

      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        if (discardRef.current || !mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        void publishReplay(blob);
      };
      recorderRef.current = recorder;
      recorder.start(1000);

      setPhase('live');
      setSeconds(0);
    };

    start();
    // The host heartbeat keeps the session alive even if activity polling stalls.
    sessionTimer = setInterval(() => {
      const activeSession = sessionRef.current;
      if (!activeSession || endingRef.current) return;
      apiRequest(`/live/sessions/${activeSession.id}/heartbeat`, { method: 'POST' }).catch(() => {});
    }, 20000);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(sessionTimer);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        discardRef.current = true;
        recorderRef.current.stop();
      }
      stopTracks();
      // Snapshot the map so the cleanup iterates the peers that existed at setup time.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const peers = peersRef.current;
      for (const viewerId of [...peers.keys()]) closePeer(viewerId);
    };
  }, [closePeer, publishReplay]);

  useEffect(() => {
    if (phase !== 'live') return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!shareNote) return undefined;
    const timer = setTimeout(() => setShareNote(''), 2500);
    return () => clearTimeout(timer);
  }, [shareNote]);

  // Keep the page behind the full-screen stream from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }, [muted]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.();
    } catch (_error) {
      // Fullscreen is a nicety; the studio already fills the viewport.
    }
  };

  const flipCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !streamRef.current) return;
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }).catch(async () => {
        // Fallback without exact constraint if device doesn't support exact facingMode
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const oldVideoTrack = streamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        streamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      streamRef.current.addTrack(newVideoTrack);

      // Update RTCPeerConnections for viewers
      for (const pc of peersRef.current.values()) {
        const senders = pc.getSenders ? pc.getSenders() : [];
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(newVideoTrack).catch(() => {});
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      setFacingMode(nextMode);
    } catch (_err) {
      // Could not flip camera
    }
  };

  const shareLive = async () => {
    if (!session) return;
    const url = `${window.location.origin}/live/${session.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: session.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareNote('Live link copied');
      }
    } catch (_error) {
      setShareNote(url);
    }
  };

  const sendHeart = async () => {
    if (!session) return;
    heartsIdRef.current += 1;
    setLikeBurst({ id: heartsIdRef.current, count: 1 });
    apiRequest(`/live/sessions/${session.id}/reactions`, { method: 'POST', body: { count: 1 } }).catch(() => {});
  };

  const sendComment = async (event) => {
    event?.preventDefault();
    const text = draftComment.trim();
    if (!text || !session) return;
    setDraftComment('');
    try {
      const result = await apiRequest(`/live/sessions/${session.id}/comments`, {
        method: 'POST',
        body: { text },
      });
      live.applyComment(result.comment);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const endLive = async () => {
    if (!session || endingRef.current) return;
    endingRef.current = true;
    setConfirmEnd(false);
    setPhase('ending');
    try {
      const result = await apiRequest(`/live/sessions/${session.id}/end`, { method: 'POST' });
      setSummary(result.summary);
    } catch (requestError) {
      setError(requestError.message);
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }
    for (const viewerId of [...peersRef.current.keys()]) {
      sendSignal(viewerId, 'bye', null);
      closePeer(viewerId);
    }
    setPhase('summary');
  };

  const cancel = () => {
    discardRef.current = true;
    const activeSession = sessionRef.current;
    if (activeSession) {
      apiRequest(`/live/sessions/${activeSession.id}/end`, { method: 'POST' }).catch(() => {});
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      discardRef.current = true;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onCancelRef.current?.();
  };

  const done = () => {
    if (postedRef.current) onPostedRef.current?.(postedRef.current);
    else onCancelRef.current?.();
  };

  const host = session?.host || { name: profile?.fullName, picture: profile?.picture };
  const isFullscreenSupported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  if (phase === 'error') {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950 p-6 text-center text-white">
        <div className="max-w-sm">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-500/15 text-red-400">
            <i className="fa-solid fa-video-slash text-xl" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold">Live could not start</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">{error}</p>
          <button type="button" onClick={cancel} className="mt-6 w-full rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-900 hover:bg-white/90">
            Back to composer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onDoubleClick={sendHeart}
        className={`absolute inset-0 h-full w-full ${facingMode === 'user' ? 'scale-x-[-1]' : ''} object-cover cursor-pointer`}
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-black/80" />

      <HeartRain burst={likeBurst} />

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-red-500">
            {host?.picture
              ? <img src={host.picture} alt="" className="h-full w-full object-cover" />
              : <Avatar name={host?.name} size={40} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-extrabold">{host?.name || 'You'}</p>
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide">
                <span className="mr-1 inline-block h-1 w-1 animate-pulse rounded-full bg-white align-middle" />LIVE
              </span>
            </div>
            <p className="truncate text-[11px] text-white/70">
              {formatDuration(seconds)} · <i className="fa-solid fa-eye mx-0.5" />{live.viewerCount} watching
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={flipCamera}
            className="grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white/90 backdrop-blur hover:bg-black/55 transition active:scale-95"
            aria-label="Flip camera"
            title="Flip camera"
          >
            <i className="fa-solid fa-camera-rotate text-sm" />
          </button>
          {isFullscreenSupported && (
            <button type="button" onClick={toggleFullscreen} className="grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white/90 backdrop-blur hover:bg-black/55" aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
              <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'} text-sm`} />
            </button>
          )}
          <button type="button" onClick={() => setMuted((value) => !value)} className={`grid h-9 w-9 place-items-center rounded-full backdrop-blur ${muted ? 'bg-red-600' : 'bg-black/35 text-white/90 hover:bg-black/55'}`} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
            <i className={`fa-solid ${muted ? 'fa-microphone-slash' : 'fa-microphone'} text-sm`} />
          </button>
          <button type="button" onClick={() => setConfirmEnd(true)} className="rounded-full bg-red-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-red-700">
            End
          </button>
        </div>
      </header>

      {/* Right action rail */}
      <div className="absolute bottom-32 right-3 z-20 flex flex-col items-center gap-4">
        <button type="button" onClick={sendHeart} className="flex flex-col items-center gap-1 text-white" aria-label="Send a heart">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur transition active:scale-90 hover:bg-black/55">
            <i className="fa-solid fa-heart text-lg text-rose-400" />
          </span>
          <span className="text-[10px] font-bold text-white/80">{live.likes.toLocaleString()}</span>
        </button>
        <button type="button" onClick={shareLive} className="flex flex-col items-center gap-1 text-white" aria-label="Share live stream">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur transition active:scale-90 hover:bg-black/55">
            <i className="fa-solid fa-paper-plane text-base" />
          </span>
          <span className="text-[10px] font-bold text-white/80">Share</span>
        </button>
        <div className="flex flex-col items-center gap-1" title="Points earned this stream">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur">
            <i className="fa-solid fa-coins text-base text-amber-300" />
          </span>
          <span className="text-[10px] font-bold text-amber-200">{live.giftPoints.toLocaleString()}</span>
        </div>
        <button type="button" onClick={() => setCommentsOpen((value) => !value)} className="flex flex-col items-center gap-1 text-white" aria-label="Toggle comments">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 backdrop-blur transition active:scale-90 hover:bg-black/55">
            <i className={`fa-solid ${commentsOpen ? 'fa-comment' : 'fa-comment-slash'} text-base`} />
          </span>
          <span className="text-[10px] font-bold text-white/80">{commentsOpen ? 'Hide' : 'Chat'}</span>
        </button>
      </div>

      {/* Bottom overlays */}
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16">
        {giftBanner && (
          <GiftBanner key={giftBanner.id} gift={giftBanner} onDone={() => setGiftBanner(null)} />
        )}

        {commentsOpen && (
          <LiveComments comments={live.comments.slice(-14)} className="pr-14" />
        )}
        {live.comments.length === 0 && commentsOpen && phase === 'live' && (
          <p className="pr-14 text-[11px] text-white/45">Comments will appear here as people join.</p>
        )}
        {live.error && <p className="text-[11px] text-amber-200">{live.error}</p>}
        {shareNote && <p className="text-[11px] font-semibold text-white/80">{shareNote}</p>}

        <form onSubmit={sendComment} className="flex items-center gap-2 pr-14">
          <input
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value.slice(0, 300))}
            placeholder="Say something to your viewers…"
            className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-black/40 px-4 text-[13px] text-white placeholder:text-white/40 outline-none backdrop-blur focus:border-white/35"
          />
          <button type="submit" disabled={!draftComment.trim()} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-white text-slate-900 transition active:scale-95 disabled:opacity-40" aria-label="Send comment">
            <i className="fa-solid fa-paper-plane text-sm" />
          </button>
        </form>
      </div>

      {phase === 'starting' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 text-center">
          <div>
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-white/70" />
            <p className="mt-3 text-sm font-semibold">Starting your camera…</p>
            <p className="mt-1 text-[11px] text-white/50">Allow camera and microphone access to go live.</p>
          </div>
        </div>
      )}

      {phase === 'ending' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 text-center">
          <div>
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-white/70" />
            <p className="mt-3 text-sm font-semibold">Ending live…</p>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 p-6 text-center backdrop-blur">
          <div className="w-full max-w-xs rounded-3xl bg-slate-900 p-5 ring-1 ring-white/10">
            <h3 className="text-base font-extrabold">End this live stream?</h3>
            <p className="mt-1.5 text-xs leading-5 text-white/60">Your recording is posted as a replay so people can watch later.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmEnd(false)} className="flex-1 rounded-full border border-white/20 px-4 py-2.5 text-xs font-bold text-white/80 hover:bg-white/10">Keep streaming</button>
              <button type="button" onClick={endLive} className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-xs font-extrabold hover:bg-red-700">End live</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/95 p-5 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              <Avatar name={host?.name} picture={host?.picture} size={44} />
              <div>
                <h3 className="text-base font-extrabold">Live ended</h3>
                <p className="text-[11px] text-white/55">Here is how your stream did.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              {[
                ['Duration', formatDuration(summary?.durationSeconds ?? seconds)],
                ['Peak viewers', (summary?.peakViewers ?? live.viewerCount).toLocaleString()],
                ['Hearts', (summary?.likes ?? live.likes).toLocaleString()],
                ['Comments', (summary?.comments ?? live.comments.length).toLocaleString()],
                ['Gift points', (summary?.giftPoints ?? live.giftPoints).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/5 px-2 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-white/45">{label}</p>
                  <p className="mt-0.5 text-sm font-extrabold text-white">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[11px] leading-4 text-white/60">
              {replayStatus === 'publishing' && <><i className="fa-solid fa-circle-notch fa-spin mr-1.5" />Publishing your replay post…</>}
              {replayStatus === 'published' && <><i className="fa-solid fa-circle-check mr-1.5 text-emerald-400" />Replay posted to your profile.</>}
              {replayStatus === 'failed' && <><i className="fa-solid fa-triangle-exclamation mr-1.5 text-amber-400" />{replayError || 'The replay could not be posted.'}</>}
              {replayStatus === 'idle' && 'Finishing the recording…'}
            </p>
            <button type="button" onClick={done} className="mt-4 w-full rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-900 hover:bg-white/90">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
