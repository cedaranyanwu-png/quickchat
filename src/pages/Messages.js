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
      await apiRequest(`/messages/conversations/${activeId}/messages`, { method: 'POST', body: { text } });
      setMessageInput('');
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
            {messages.map((message) => <div key={message.id} className={`flex ${message.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div className={`${message.sender === 'me' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-900'} max-w-[75%] rounded-xl px-3 py-2`}><p className="break-words whitespace-pre-wrap text-sm">{message.text}</p><small className="opacity-70">{message.time}</small></div>
            </div>)}
            {messages.length === 0 && <p className="text-center text-sm text-slate-500">Send the first message.</p>}
            {activeStatus.typing && <div role="status" aria-label={`${activeConversation.name} is typing`} className="flex justify-start" aria-live="polite"><span className="chat-typing-bubble flex h-9 items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-3"><span className="chat-typing-dot"/><span className="chat-typing-dot"/><span className="chat-typing-dot"/></span></div>}
            <div ref={endOfMessagesRef} />
          </div>
        </> : <div className="grid flex-1 place-items-center pb-24 text-sm text-slate-500">Choose a conversation or message someone you follow.</div>}

        <form onSubmit={sendMessage} className="absolute inset-x-0 bottom-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
          <input
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
