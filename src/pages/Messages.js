import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest, uploadMedia } from '../api';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';

export default function Messages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedUserId = searchParams.get('userId');
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactsHaveMore, setContactsHaveMore] = useState(false);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const [otherUsers, setOtherUsers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeStatus, setActiveStatus] = useState({ online: false, typing: false });
  const [messageInput, setMessageInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyMenuId, setReplyMenuId] = useState(null);
  const [swipedMessageId, setSwipedMessageId] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [recordingMode, setRecordingMode] = useState('');
  const [call, setCall] = useState(null);
  const [callError, setCallError] = useState('');
  const [callMuted, setCallMuted] = useState(false);
  const [callCameraOff, setCallCameraOff] = useState(false);
  const [paidChatAccess, setPaidChatAccess] = useState(null);
  const [unlockingChat, setUnlockingChat] = useState(false);
  const [dayPassOffer, setDayPassOffer] = useState(false);
  const [dayPassBusy, setDayPassBusy] = useState(false);
  const messageRequestRef = useRef(0);
  const touchStartRef = useRef(null);
  const endOfMessagesRef = useRef(null);
  const openedUserRef = useRef('');
  const typingTimeoutRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const callRef = useRef(null);
  const callPcRef = useRef(null);
  const callLocalStreamRef = useRef(null);
  const callRemoteStreamRef = useRef(null);
  const callCursorRef = useRef(0);
  const pendingCallIceRef = useRef([]);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);

  const reportTyping = useCallback((conversationId, typing) => {
    if (!conversationId) return;
    apiRequest(`/messages/conversations/${conversationId}/typing`, { method: 'POST', body: { typing } }).catch(() => {});
  }, []);

  const loadConversations = useCallback(async () => {
    const result = await apiRequest('/messages/conversations');
    setConversations(result.conversations || []);
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    const requestId = ++messageRequestRef.current;
    const result = await apiRequest(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`);
    if (requestId !== messageRequestRef.current) return;
    const nextMessages = Array.isArray(result?.messages) ? result.messages : [];
    setPaidChatAccess(result?.locked ? { requiresUnlock: true, unlocked: false, pricePoints: Number(result.pricePoints || 100) } : { requiresUnlock: false, unlocked: true });
    setMessages(nextMessages);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest('/messages/conversations');
        if (active) { setConversations(result.conversations || []); setError(''); }
      } catch (requestError) { if (active) setError(requestError.message); }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    setContacts([]);
    const refreshContacts = () => apiRequest(`/messages/contacts?q=${encodeURIComponent(search)}&limit=100&offset=0`)
      .then((result) => {
        if (active) {
          const firstPage = result.contacts || [];
          const refreshedIds = new Set(firstPage.map((contact) => String(contact.id)));
          setContacts((current) => [...firstPage, ...current.filter((contact) => !refreshedIds.has(String(contact.id)))]);
          setContactsHaveMore(Boolean(result.hasMore));
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message); });
    refreshContacts();
    const timer = setInterval(refreshContacts, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [search]);

  useEffect(() => {
    if (!search.trim()) { setOtherUsers([]); return undefined; }
    let active = true;
    apiRequest(`/users?q=${encodeURIComponent(search)}`)
      .then((result) => { if (active) setOtherUsers(result.users || []); })
      .catch(() => { if (active) setOtherUsers([]); });
    return () => { active = false; };
  }, [search]);

  useEffect(() => {
    if (!activeId) { setMessages([]); setPaidChatAccess(null); return undefined; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest(`/messages/conversations/${encodeURIComponent(activeId)}/messages`);
        if (active) {
          setMessages(Array.isArray(result?.messages) ? result.messages : []);
          setPaidChatAccess(result?.locked ? { requiresUnlock: true, unlocked: false, pricePoints: Number(result.pricePoints || 100) } : { requiresUnlock: false, unlocked: true });
          setError('');
        }
      } catch (requestError) { if (active) setError(requestError.message); }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) { setActiveStatus({ online: false, typing: false }); return undefined; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest(`/messages/conversations/${activeId}/status`);
        if (active) {
          const otherUser = result.users?.[0];
          setActiveStatus({ online: Boolean(otherUser?.online), typing: Boolean(otherUser?.typing) });
        }
      } catch { /* Presence is best-effort and expires automatically. */ }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [activeId]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (activeId) reportTyping(activeId, false);
  }, [activeId, reportTyping]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, activeId]);

  const startConversation = useCallback(async (user) => {
    if (!user?.id || startingConversation) return;
    setStartingConversation(true);
    setError('');
    try {
      const result = await apiRequest('/messages/conversations', { method: 'POST', body: { userId: user.id } });
      const refreshed = await apiRequest('/messages/conversations');
      setConversations(refreshed.conversations || []);
      setActiveId(result.conversationId);
      setSearch('');
      if (searchParams.has('userId')) setSearchParams({}, { replace: true });
    } catch (requestError) { setError(requestError.message); }
    finally { setStartingConversation(false); }
  }, [searchParams, setSearchParams, startingConversation]);

  const loadMoreContacts = async () => {
    if (loadingMoreContacts || !contactsHaveMore) return;
    setLoadingMoreContacts(true);
    try {
      const result = await apiRequest(`/messages/contacts?q=${encodeURIComponent(search)}&limit=100&offset=${contacts.length}`);
      setContacts((current) => [...current, ...(result.contacts || [])]);
      setContactsHaveMore(Boolean(result.hasMore));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoadingMoreContacts(false); }
  };

  useEffect(() => {
    if (!requestedUserId || openedUserRef.current === requestedUserId) return;
    openedUserRef.current = requestedUserId;
    startConversation({ id: requestedUserId }).catch(() => {});
  }, [requestedUserId, startConversation]);

  const sendAttachment = async (file) => {
    if (!activeId || !file || uploadingMedia) return;
    setUploadingMedia(true);
    setError('');
    try {
      const uploaded = await uploadMedia(file);
      await apiRequest(`/messages/conversations/${activeId}/messages`, { method: 'POST', body: { mediaUploadId: uploaded.id, text: '', replyToMessageId: replyingTo?.id || null } });
      setReplyingTo(null);
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (uploadError) {
      setError(uploadError.message || 'The attachment could not be sent.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageSelected = (event) => {
    const file = event.target.files?.[0];
    if (file) void sendAttachment(file);
  };

  const unlockPaidChat = async () => {
    if (!activeId || unlockingChat) return;
    setUnlockingChat(true); setError('');
    try {
      await apiRequest(`/messages/conversations/${activeId}/unlock`, { method: 'POST' });
      setPaidChatAccess({ requiresUnlock: true, unlocked: true });
      await loadMessages(activeId);
    } catch (unlockError) { setError(unlockError.message); }
    finally { setUnlockingChat(false); }
  };

  const buyDayPass = async () => {
    if (dayPassBusy) return;
    setDayPassBusy(true); setCallError('');
    try {
      await apiRequest('/messages/access/day-pass', { method: 'POST' });
      setDayPassOffer(false);
      setCallError('Your 24-hour advanced chat pass is active. Start your call again.');
    } catch (passError) { setCallError(passError.message); }
    finally { setDayPassBusy(false); }
  };

  const startRecording = async (mode) => {
    if (!activeId || recordingMode || typeof MediaRecorder === 'undefined') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mode === 'voice'
        ? { audio: { echoCancellation: true, noiseSuppression: true } }
        : { audio: true, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      const candidates = mode === 'voice' ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'] : ['video/webm;codecs=vp8,opus', 'video/webm'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      discardRecordingRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || (mode === 'voice' ? 'audio/webm' : 'video/webm') });
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecordingMode('');
        if (!discardRecordingRef.current && blob.size) void sendAttachment(new File([blob], `${mode}-${Date.now()}.webm`, { type: blob.type }));
      };
      recorder.start(500);
      setRecordingMode(mode);
    } catch (recordError) {
      setError(recordError?.name === 'NotAllowedError' ? 'Allow microphone and camera access to record a message.' : 'Recording is unavailable on this device or browser.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  };

  const updateCall = (next) => { callRef.current = next; setCall(next); };

  const sendCallSignal = async (data, kind, payload = null) => {
    if (!data?.callId || !data?.peerId) return;
    await apiRequest(`/messages/calls/${data.callId}/signals`, { method: 'POST', body: { to: data.peerId, kind, payload } });
  };

  const closeDirectCall = () => {
    try { callPcRef.current?.close(); } catch (_error) {}
    callPcRef.current = null;
    callLocalStreamRef.current?.getTracks().forEach((track) => track.stop());
    callLocalStreamRef.current = null;
    callRemoteStreamRef.current = null;
    pendingCallIceRef.current = [];
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    updateCall(null);
    setCallMuted(false);
    setCallCameraOff(false);
  };

  const createDirectPeer = async (data, initiator) => {
    const pc = new RTCPeerConnection({ iceServers: data.iceServers || [] });
    callPcRef.current = pc;
    callLocalStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, callLocalStreamRef.current));
    pc.onicecandidate = (event) => { if (event.candidate) void sendCallSignal(data, 'ice', event.candidate.toJSON()).catch(() => {}); };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      callRemoteStreamRef.current = stream;
      if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = stream; remoteVideoRef.current.play().catch(() => {}); }
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = stream; remoteAudioRef.current.play().catch(() => {}); }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') setCallError('The call connection failed. Check your network and try again.');
    };
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendCallSignal(data, 'offer', { type: 'offer', sdp: pc.localDescription.sdp });
    }
    return pc;
  };

  const startCall = async (mediaType) => {
    if (!activeId || !activeConversation || callRef.current) return;
    setCallError('');
    try {
      const access = await apiRequest('/messages/access');
      if (!access.active) { setDayPassOffer(true); return; }
      const stream = await navigator.mediaDevices.getUserMedia(mediaType === 'video'
        ? { audio: true, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { audio: true });
      callLocalStreamRef.current = stream;
      const result = await apiRequest('/messages/calls/start', { method: 'POST', body: { conversationId: activeId, mediaType } });
      const data = { callId: result.callId, conversationId: activeId, peerId: result.to, mediaType, status: 'outgoing', peerName: activeConversation.name, iceServers: result.iceServers || [], initiator: true };
      updateCall(data);
      if (localVideoRef.current && mediaType === 'video') localVideoRef.current.srcObject = stream;
    } catch (callStartError) {
      callLocalStreamRef.current?.getTracks().forEach((track) => track.stop());
      callLocalStreamRef.current = null;
      setCallError(callStartError?.name === 'NotAllowedError' ? 'Allow microphone and camera access before starting a call.' : callStartError.message || 'Could not start the call.');
    }
  };

  const answerCall = async () => {
    const current = callRef.current;
    if (!current || current.status !== 'incoming') return;
    try {
      const access = await apiRequest('/messages/access');
      if (!access.active) { setDayPassOffer(true); return; }
      const stream = await navigator.mediaDevices.getUserMedia(current.mediaType === 'video'
        ? { audio: true, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { audio: true });
      callLocalStreamRef.current = stream;
      const accepted = { ...current, status: 'connecting', initiator: false };
      updateCall(accepted);
      if (localVideoRef.current && current.mediaType === 'video') localVideoRef.current.srcObject = stream;
      await sendCallSignal(accepted, 'accept');
    } catch (callAcceptError) {
      setCallError(callAcceptError?.name === 'NotAllowedError' ? 'Allow microphone and camera access to answer this call.' : callAcceptError.message || 'Could not answer the call.');
    }
  };

  const rejectCall = async () => {
    const current = callRef.current;
    if (current) await sendCallSignal(current, 'reject').catch(() => {});
    closeDirectCall();
  };

  const endCall = async () => {
    const current = callRef.current;
    if (current) await sendCallSignal(current, 'end').catch(() => {});
    closeDirectCall();
  };

  useEffect(() => {
    if (!call?.mediaType || !callLocalStreamRef.current) return;
    if (call.mediaType === 'video' && localVideoRef.current) {
      localVideoRef.current.srcObject = callLocalStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [call?.callId, call?.mediaType]);

  useEffect(() => {
    if (!call?.callId || !['connecting', 'active'].includes(call.status)) return undefined;
    const beat = () => apiRequest(`/messages/calls/${call.callId}/heartbeat`, { method: 'POST' }).catch(() => {});
    beat();
    const timer = setInterval(beat, 15000);
    return () => clearInterval(timer);
  }, [call?.callId, call?.status]);

  useEffect(() => {
    let active = true;
    let timer;
    const pollCalls = async () => {
      try {
        const result = await apiRequest('/messages/calls/poll', { method: 'POST', body: { afterId: callCursorRef.current } });
        for (const signal of result.signals || []) {
          callCursorRef.current = Math.max(callCursorRef.current, Number(signal.id));
          let current = callRef.current;
          if (signal.kind === 'invite' && !current) {
            const convo = conversations.find((item) => Number(item.id) === Number(signal.conversationId));
            current = { callId: signal.callId, conversationId: signal.conversationId, peerId: Number(signal.from), peerName: signal.payload?.callerName || convo?.name || 'QuickChat member', mediaType: signal.mediaType, status: 'incoming', iceServers: result.iceServers || [], initiator: false };
            updateCall(current);
            setActiveId(signal.conversationId);
          } else if (!current || current.callId !== signal.callId) continue;
          else if (signal.kind === 'accept' && current.initiator) {
            updateCall({ ...current, status: 'connecting' });
            await createDirectPeer(current, true);
          } else if (signal.kind === 'offer' && !current.initiator) {
            const pc = callPcRef.current || await createDirectPeer(current, false);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendCallSignal(current, 'answer', { type: 'answer', sdp: pc.localDescription.sdp });
            for (const candidate of pendingCallIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            pendingCallIceRef.current = [];
            updateCall({ ...current, status: 'active' });
          } else if (signal.kind === 'answer' && current.initiator && callPcRef.current) {
            await callPcRef.current.setRemoteDescription(new RTCSessionDescription(signal.payload));
            updateCall({ ...current, status: 'active' });
            for (const candidate of pendingCallIceRef.current) await callPcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            pendingCallIceRef.current = [];
          } else if (signal.kind === 'ice' && signal.payload) {
            if (callPcRef.current?.remoteDescription) await callPcRef.current.addIceCandidate(new RTCIceCandidate(signal.payload)).catch(() => {});
            else pendingCallIceRef.current.push(signal.payload);
          } else if (signal.kind === 'reject') {
            setCallError('The other person declined your call.');
            closeDirectCall();
          } else if (signal.kind === 'missed') {
            setCallError('There was no answer to your call.');
            closeDirectCall();
          } else if (signal.kind === 'end') closeDirectCall();
        }
      } catch (_error) { /* polling retries after a short delay */ }
      finally { if (active) timer = setTimeout(pollCalls, 900); }
    };
    pollCalls();
    return () => { active = false; clearTimeout(timer); };
    // The call handlers intentionally use the latest refs and state snapshot while polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    const activeCall = callRef.current;
    if (activeCall?.callId && activeCall?.peerId) {
      apiRequest(`/messages/calls/${activeCall.callId}/signals`, { method: 'POST', body: { to: activeCall.peerId, kind: 'end' } }).catch(() => {});
    }
    try { callPcRef.current?.close(); } catch (_error) {}
    callLocalStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = messageInput.trim();
    if (!activeId || !text || sending) return;
    setSending(true);
    setError('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    reportTyping(activeId, false);
    lastTypingSentAtRef.current = 0;
    try {
      await apiRequest(`/messages/conversations/${activeId}/messages`, { method: 'POST', body: { text, replyToMessageId: replyingTo?.id || null } });
      setMessageInput('');
      setReplyingTo(null);
      setReplyMenuId(null);
      setSwipedMessageId(null);
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (requestError) { setError(requestError.message); }
    finally { setSending(false); }
  };

  const handleMessageInputChange = (event) => {
    const value = event.target.value;
    setMessageInput(value);
    if (!activeId) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!value.trim()) { reportTyping(activeId, false); return; }
    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 1000) {
      reportTyping(activeId, true);
      lastTypingSentAtRef.current = now;
    }
    const conversationId = activeId;
    typingTimeoutRef.current = setTimeout(() => {
      reportTyping(conversationId, false);
      typingTimeoutRef.current = null;
      lastTypingSentAtRef.current = 0;
    }, 1600);
  };

  const matchingConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => !query || `${conversation.name} ${conversation.handle} ${conversation.lastMessage}`.toLowerCase().includes(query));
  }, [conversations, search]);
  const contactIds = new Set(contacts.map((contact) => String(contact.id)));
  const additionalUsers = otherUsers.filter((user) => !contactIds.has(String(user.id)));
  const activeConversation = conversations.find((conversation) => String(conversation.id) === String(activeId));
  const activeUserOnline = activeStatus.online || Boolean(activeConversation?.online);

  const beginReply = useCallback((message) => {
    if (!message) return;
    setReplyingTo(message);
    setReplyMenuId(null);
    setSwipedMessageId(null);
    requestAnimationFrame(() => document.getElementById('quickchat-message-input')?.focus());
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
    setReplyMenuId(null);
    setSwipedMessageId(null);
  }, []);

  const handleMessageTouchStart = (message, event) => {
    const touch = event.touches[0];
    touchStartRef.current = { id: message.id, x: touch.clientX, y: touch.clientY };
    setReplyMenuId(null);
  };

  const handleMessageTouchMove = (message, event) => {
    const start = touchStartRef.current;
    if (!start || start.id !== message.id) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    const clamped = Math.max(-76, Math.min(76, dx));
    if (Math.abs(clamped) >= 8) setSwipedMessageId(message.id);
  };

  const handleMessageTouchEnd = (message, event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || start.id !== message.id) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy)) beginReply(message);
    else setSwipedMessageId(null);
  };

  return (
    <div className="flex h-[calc(100dvh-6.25rem)] min-h-0 overflow-hidden bg-white pb-[4.5rem] lg:h-screen lg:pb-0">
      <aside className={`${activeConversation ? 'hidden lg:flex' : 'flex'} min-h-0 w-full flex-col border-r border-slate-200 lg:w-[320px]`}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Messages</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people or conversations" className="w-full rounded-full bg-slate-100 px-3 py-2 text-xs outline-none ring-0 focus:ring-0" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section>
            <h3 className="px-4 pb-2 pt-4 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Conversations</h3>
            {matchingConversations.map((conversation) => <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`flex w-full gap-3 border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${String(activeId) === String(conversation.id) ? 'bg-blue-50' : ''}`}>
              <span className="relative h-[38px] w-[38px] shrink-0"><Avatar name={conversation.name} picture={conversation.picture} size={38} />{conversation.online && <span aria-label="Online" title="Online" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}</span>
              <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><strong className="truncate text-xs text-slate-900">{conversation.name}</strong><small className="shrink-0 text-[10px] text-slate-400">{conversation.time}</small></span><span className="block truncate text-[11px] text-slate-500">{conversation.lastMessage || 'Start a conversation'}</span></span>
              {conversation.unread > 0 && <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-700 text-[10px] text-white">{conversation.unread > 9 ? '9+' : conversation.unread}</span>}
            </button>)}
            {matchingConversations.length === 0 && <p className="px-4 py-2 text-xs text-slate-400">No conversations found.</p>}
          </section>
          <section>
            <h3 className="px-4 pb-2 pt-5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Followers &amp; following</h3>
            {contacts.map((contact) => <button key={`contact-${contact.id}`} onClick={() => startConversation(contact)} disabled={startingConversation} className="flex w-full items-center gap-3 border-b border-slate-100 p-3 text-left hover:bg-slate-50 disabled:opacity-60">
              <span className="relative h-[38px] w-[38px] shrink-0"><Avatar name={contact.name} picture={contact.picture} size={38} />{contact.online && <span aria-label="Online" title="Online" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{contact.name} <VerifiedBadge verified={contact.verified} /></strong><span className="text-xs text-slate-500">{contact.online ? 'Online · ' : ''}{contact.handle}</span></span>
              <span className="text-[10px] text-blue-700">{contact.following && contact.follower ? 'Follows you' : contact.following ? 'Following' : 'Follower'}</span>
            </button>)}
            {contacts.length === 0 && <p className="px-4 py-2 text-xs text-slate-400">People you follow or who follow you will appear here.</p>}
            {contactsHaveMore && <button type="button" onClick={loadMoreContacts} disabled={loadingMoreContacts} className="w-full p-3 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{loadingMoreContacts ? 'Loading…' : 'Load more people'}</button>}
          </section>
          {additionalUsers.length > 0 && <section>
            <h3 className="px-4 pb-2 pt-5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">People</h3>
            {additionalUsers.map((user) => <button key={`person-${user.id}`} onClick={() => startConversation(user)} disabled={startingConversation} className="flex w-full items-center gap-3 border-b border-slate-100 p-3 text-left hover:bg-slate-50 disabled:opacity-60">
              <Avatar name={user.name} picture={user.picture} size={38} />
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{user.name} <VerifiedBadge verified={user.verified} /></strong><span className="text-xs text-slate-500">{user.handle}</span></span>
              <span className="text-xs text-blue-700">Message</span>
            </button>)}
          </section>}
        </div>
      </aside>

      <section className={`${activeConversation ? 'flex' : 'hidden lg:flex'} relative min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
        {activeConversation ? <>
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white p-3">
            <button type="button" onClick={() => setActiveId(null)} aria-label="Back to conversations" className="text-slate-500 lg:hidden"><i className="fa-solid fa-arrow-left" /></button>
            <span className="relative h-9 w-9 shrink-0"><Avatar name={activeConversation.name} picture={activeConversation.picture} size={36} />{activeUserOnline && <span aria-label="Online" title="Online" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}</span>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900">{activeConversation.name} <VerifiedBadge verified={activeConversation.verified} /></h3><p className="text-xs text-slate-500">{activeStatus.typing ? 'Typing…' : activeUserOnline ? 'Online' : ' '}</p></div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => startCall('audio')} disabled={Boolean(call)} title="Voice call" aria-label="Start voice call" className="grid h-9 w-9 place-items-center rounded-full text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><i className="fa-solid fa-phone" /></button>
              <button type="button" onClick={() => startCall('video')} disabled={Boolean(call)} title="Video call" aria-label="Start video call" className="grid h-9 w-9 place-items-center rounded-full text-blue-700 hover:bg-blue-50 disabled:opacity-40"><i className="fa-solid fa-video" /></button>
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 pb-24 lg:pb-24">
            {paidChatAccess?.requiresUnlock && !paidChatAccess.unlocked && (
              <div className="mx-auto max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-amber-600"><i className="fa-solid fa-lock" /></span>
                <h3 className="mt-2 text-sm font-extrabold text-slate-900">Unlock this creator’s chat</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">This creator charges {Number(paidChatAccess.pricePoints || 100).toLocaleString()} points for a conversation. Once unlocked, you can continue chatting without paying again.</p>
                <button type="button" onClick={unlockPaidChat} disabled={unlockingChat} className="mt-3 rounded-full bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{unlockingChat ? 'Unlocking…' : `Unlock for ${Number(paidChatAccess.pricePoints || 100).toLocaleString()} points`}</button>
              </div>
            )}
            {paidChatAccess?.requiresUnlock && !paidChatAccess.unlocked ? null : messages.map((message) => {
              const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
              const isMine = message.sender === 'me' || Number(message.senderId) === Number(currentUser.id);
              const isSwiped = swipedMessageId === message.id;
              const isMenuOpen = replyMenuId === message.id;
              const dragStyle = isSwiped ? { transform: 'translateX(52px)' } : undefined;
              return (
                <div key={message.id} className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="relative max-w-[82%] lg:max-w-[75%] touch-pan-y"
                    style={dragStyle}
                    onTouchStart={(event) => handleMessageTouchStart(message, event)}
                    onTouchMove={(event) => handleMessageTouchMove(message, event)}
                    onTouchEnd={(event) => handleMessageTouchEnd(message, event)}
                  >
                    <button
                      type="button"
                      onClick={() => beginReply(message)}
                      className={`absolute top-1/2 z-0 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-700 shadow-sm lg:flex ${isMine ? '-left-11' : '-right-11'}`}
                      aria-label="Reply to message"
                      title="Reply to message"
                    >
                      <i className="fa-solid fa-reply text-xs" />
                    </button>
                    {isSwiped && (
                      <div className="absolute bottom-full left-0 z-30 mb-2 w-64 max-w-[75vw] rounded-xl border border-blue-100 bg-white px-3 py-2 shadow-lg lg:hidden">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                          <i className="fa-solid fa-reply" />
                          Replying to
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-700">{message.text}</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => beginReply(message)}
                      className={`absolute top-1/2 z-0 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-700 shadow-sm lg:hidden ${isMine ? '-left-10' : '-right-10'} ${isSwiped ? 'opacity-100' : 'pointer-events-none opacity-0'} transition-opacity`}
                      aria-label="Reply to message"
                    >
                      <i className="fa-solid fa-reply text-xs" />
                    </button>
                    {isSwiped && (
                      <div className={`absolute top-1/2 z-0 w-48 -translate-y-1/2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-left shadow-sm ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}>
                        <span className="block text-[10px] font-extrabold uppercase tracking-wide text-blue-700">Replying to</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-600">{message.text}</span>
                      </div>
                    )}
                    <div className={`relative z-10 ${isMine ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-900'} rounded-2xl px-3 py-2 shadow-sm`}>
                      {message.replyTo && (
                        <button
                          type="button"
                          onClick={() => {
                            const target = document.getElementById(`message-${message.replyTo.id}`);
                            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          className={`mb-2 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[11px] ${isMine ? 'border-white/60 bg-white/10 text-white/90' : 'border-blue-500 bg-white text-slate-600'}`}
                        >
                          <span className="block font-bold opacity-80">{message.replyTo.sender === 'me' ? 'You' : activeConversation.name}</span>
                          <span className="block truncate">{message.replyTo.text}</span>
                        </button>
                      )}
                      {message.mediaType === 'image' && message.mediaUrl && <img src={message.mediaUrl} alt="Shared image" loading="lazy" className="mb-2 max-h-72 max-w-full rounded-xl object-contain" />}
                      {message.mediaType === 'video' && message.mediaUrl && <video src={message.mediaUrl} controls playsInline preload="metadata" className="mb-2 max-h-80 max-w-full rounded-xl bg-black" />}
                      {message.mediaType === 'audio' && message.mediaUrl && <div className="mb-2 flex min-w-[220px] items-center gap-2"><i className={`fa-solid fa-microphone ${isMine ? 'text-white' : 'text-blue-700'}`} /><audio src={message.mediaUrl} controls preload="metadata" className="h-9 max-w-full" /></div>}
                      {message.text && <p id={`message-${message.id}`} className="break-words whitespace-pre-wrap text-sm">{message.text}</p>}
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <small className="opacity-70">{message.time}</small>
                        <button
                          type="button"
                          onClick={() => setReplyMenuId((current) => current === message.id ? null : message.id)}
                          className="grid h-5 w-5 place-items-center rounded-full text-current opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-70 lg:hidden"
                          aria-label="Message actions"
                        >
                          <i className="fa-solid fa-ellipsis text-[10px]" />
                        </button>
                      </div>
                    </div>
                    {isMenuOpen && (
                      <div className={`absolute bottom-[-2.75rem] z-40 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}>
                        <button type="button" onClick={() => beginReply(message)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          <i className="fa-solid fa-reply text-blue-700" /> Reply
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <p className="text-center text-sm text-slate-500">Send the first message.</p>}
            {activeStatus.typing && <div role="status" aria-label={`${activeConversation.name} is typing`} className="flex justify-start" aria-live="polite"><span className="chat-typing-bubble flex h-9 items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-3"><span className="chat-typing-dot"/><span className="chat-typing-dot"/><span className="chat-typing-dot"/></span></div>}
            <div ref={endOfMessagesRef} />
          </div>
        </> : <div className="grid flex-1 place-items-center pb-24 text-sm text-slate-500">Choose a conversation or message someone you follow.</div>}

        <form onSubmit={sendMessage} className="absolute inset-x-0 bottom-0 z-30 flex min-h-16 shrink-0 items-center gap-1.5 border-t border-slate-200 bg-white px-2 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleImageSelected} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!activeId || Boolean(paidChatAccess?.requiresUnlock && !paidChatAccess.unlocked) || uploadingMedia || Boolean(recordingMode)} title="Send image" aria-label="Send image" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-blue-700 hover:bg-blue-50 disabled:opacity-40"><i className="fa-regular fa-image text-lg" /></button>
          <button type="button" onClick={() => recordingMode === 'voice' ? stopRecording() : startRecording('voice')} disabled={!activeId || Boolean(paidChatAccess?.requiresUnlock && !paidChatAccess.unlocked) || uploadingMedia || (recordingMode && recordingMode !== 'voice')} title={recordingMode === 'voice' ? 'Stop voice recording' : 'Record voice message'} aria-label={recordingMode === 'voice' ? 'Stop voice recording' : 'Record voice message'} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${recordingMode === 'voice' ? 'animate-pulse bg-red-100 text-red-600' : 'text-slate-600 hover:bg-slate-100'} disabled:opacity-40`}><i className={`fa-solid ${recordingMode === 'voice' ? 'fa-stop' : 'fa-microphone'}`} /></button>
          <button type="button" onClick={() => recordingMode === 'video' ? stopRecording() : startRecording('video')} disabled={!activeId || Boolean(paidChatAccess?.requiresUnlock && !paidChatAccess.unlocked) || uploadingMedia || (recordingMode && recordingMode !== 'video')} title={recordingMode === 'video' ? 'Stop video recording' : 'Record video message'} aria-label={recordingMode === 'video' ? 'Stop video recording' : 'Record video message'} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${recordingMode === 'video' ? 'animate-pulse bg-red-100 text-red-600' : 'text-slate-600 hover:bg-slate-100'} disabled:opacity-40`}><i className={`fa-solid ${recordingMode === 'video' ? 'fa-stop' : 'fa-video'}`} /></button>
          {recordingMode && <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />REC</span>}
          {uploadingMedia && <span className="shrink-0 text-[10px] font-semibold text-blue-700">Uploading…</span>}
          <div className="absolute inset-x-0 bottom-full border-t border-slate-100 bg-white px-3 py-2 shadow-sm">
          {replyingTo && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-blue-700"><i className="fa-solid fa-reply text-xs" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-blue-700">Replying to {replyingTo.sender === 'me' ? 'yourself' : activeConversation?.name}</p>
                <p className="truncate text-xs text-slate-600">{replyingTo.text}</p>
              </div>
              <button type="button" onClick={cancelReply} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900" aria-label="Cancel reply">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          )}
        </div>
        <input
            id="quickchat-message-input"
            value={messageInput}
            onChange={handleMessageInputChange}
            maxLength={5000}
            placeholder={activeConversation ? 'Write a message' : 'Choose a conversation to message'}
            disabled={!activeId || sending}
            className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label="Write a message"
          />
          <button type="submit" disabled={!activeId || Boolean(paidChatAccess?.requiresUnlock && !paidChatAccess.unlocked) || !messageInput.trim() || sending} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50" aria-label={sending ? 'Sending message' : 'Send message'} title={sending ? 'Sending…' : 'Send message'}>
            <i className={`fa-solid ${sending ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'} text-sm`} />
          </button>
        </form>
      </section>
      {dayPassOffer && <div className="fixed inset-0 z-[115] grid place-items-center bg-slate-950/70 p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><i className="fa-solid fa-headset text-xl" /></span>
          <h3 className="mt-3 text-lg font-extrabold text-slate-900">Advanced chat pass</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Voice and video calls require a 24-hour pass costing 1,000 points. Your call audio and video are not recorded or saved by QuickChat.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setDayPassOffer(false)} className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">Not now</button>
            <button type="button" onClick={buyDayPass} disabled={dayPassBusy} className="flex-1 rounded-full bg-blue-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{dayPassBusy ? 'Activating…' : 'Pay 1,000 points'}</button>
          </div>
        </div>
      </div>}
      {call && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-3">
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="bg-slate-950 px-6 py-7 text-center text-white">
            <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full border-2 border-white/30 bg-slate-800"><Avatar name={call.peerName} picture={activeConversation?.picture} size={64} /></div>
            <h3 className="text-lg font-extrabold">{call.peerName || 'QuickChat member'}</h3>
            <p className="mt-1 text-xs text-slate-300">{call.status === 'incoming' ? `Incoming ${call.mediaType === 'video' ? 'video' : 'voice'} call` : call.status === 'outgoing' ? 'Calling…' : call.status === 'connecting' ? 'Connecting…' : 'Call connected'}</p>
          </div>
          {call.mediaType === 'video' && <div className="relative aspect-video bg-black"><video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" /><video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-3 right-3 h-20 w-28 rounded-xl border border-white/70 bg-slate-800 object-cover" /></div>}
          {call.mediaType === 'audio' && <audio ref={remoteAudioRef} autoPlay className="hidden" />}
          {callError && <p role="alert" className="px-4 pt-3 text-center text-xs text-rose-600">{callError}</p>}
          <div className="flex items-center justify-center gap-5 px-5 py-6">
            {call.status === 'incoming' ? <>
              <button type="button" onClick={rejectCall} className="flex flex-col items-center gap-2 text-xs font-bold text-slate-600"><span className="grid h-14 w-14 place-items-center rounded-full bg-rose-600 text-xl text-white"><i className="fa-solid fa-phone-slash" /></span>Reject</button>
              <button type="button" onClick={answerCall} className="flex flex-col items-center gap-2 text-xs font-bold text-slate-600"><span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-xl text-white"><i className="fa-solid fa-phone" /></span>Answer</button>
            </> : <>
              <button type="button" onClick={() => { callLocalStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = callMuted; }); setCallMuted((value) => !value); }} className="flex flex-col items-center gap-2 text-xs font-bold text-slate-600"><span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-lg"><i className={`fa-solid ${callMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} /></span>{callMuted ? 'Unmute' : 'Mute'}</button>
              {call.mediaType === 'video' && <button type="button" onClick={() => { callLocalStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = callCameraOff; }); setCallCameraOff((value) => !value); }} className="flex flex-col items-center gap-2 text-xs font-bold text-slate-600"><span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-lg"><i className={`fa-solid ${callCameraOff ? 'fa-video-slash' : 'fa-video'}`} /></span>Camera</button>}
              <button type="button" onClick={endCall} className="flex flex-col items-center gap-2 text-xs font-bold text-slate-600"><span className="grid h-14 w-14 place-items-center rounded-full bg-rose-600 text-xl text-white"><i className="fa-solid fa-phone-slash" /></span>End call</button>
            </>}
          </div>
        </div>
      </div>}
      {(error || callError) && <div role="alert" className="fixed bottom-20 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-lg bg-red-50 p-3 text-xs text-red-700 shadow">{error || callError}</div>}
    </div>
  );
}
