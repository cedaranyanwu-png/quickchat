import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';

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
  const touchStartRef = useRef(null);
  const endOfMessagesRef = useRef(null);
  const openedUserRef = useRef('');
  const typingTimeoutRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);

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
    const result = await apiRequest(`/messages/conversations/${conversationId}/messages`);
    setMessages(result.messages || []);
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
    if (!activeId) { setMessages([]); return undefined; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest(`/messages/conversations/${activeId}/messages`);
        if (active) { setMessages(result.messages || []); setError(''); }
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
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{contact.name}</strong><span className="text-xs text-slate-500">{contact.online ? 'Online · ' : ''}{contact.handle}</span></span>
              <span className="text-[10px] text-blue-700">{contact.following && contact.follower ? 'Follows you' : contact.following ? 'Following' : 'Follower'}</span>
            </button>)}
            {contacts.length === 0 && <p className="px-4 py-2 text-xs text-slate-400">People you follow or who follow you will appear here.</p>}
            {contactsHaveMore && <button type="button" onClick={loadMoreContacts} disabled={loadingMoreContacts} className="w-full p-3 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{loadingMoreContacts ? 'Loading…' : 'Load more people'}</button>}
          </section>
          {additionalUsers.length > 0 && <section>
            <h3 className="px-4 pb-2 pt-5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">People</h3>
            {additionalUsers.map((user) => <button key={`person-${user.id}`} onClick={() => startConversation(user)} disabled={startingConversation} className="flex w-full items-center gap-3 border-b border-slate-100 p-3 text-left hover:bg-slate-50 disabled:opacity-60">
              <Avatar name={user.name} picture={user.picture} size={38} />
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{user.name}</strong><span className="text-xs text-slate-500">{user.handle}</span></span>
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
            <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">{activeConversation.name}</h3><p className="text-xs text-slate-500">{activeStatus.typing ? 'Typing…' : activeUserOnline ? 'Online' : ' '}</p></div>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 pb-24 lg:pb-24">
            {messages.map((message) => {
              const isMine = message.sender === 'me';
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
                      <p id={`message-${message.id}`} className="break-words whitespace-pre-wrap text-sm">{message.text}</p>
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

        <form onSubmit={sendMessage} className="absolute inset-x-0 bottom-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
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
          <button type="submit" disabled={!activeId || !messageInput.trim() || sending} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50" aria-label={sending ? 'Sending message' : 'Send message'} title={sending ? 'Sending…' : 'Send message'}>
            <i className={`fa-solid ${sending ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'} text-sm`} />
          </button>
        </form>
      </section>
      {error && <div role="alert" className="fixed bottom-20 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-lg bg-red-50 p-3 text-xs text-red-700 shadow">{error}</div>}
    </div>
  );
}
