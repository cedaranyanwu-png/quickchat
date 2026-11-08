import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, apiRequest, normalizeNetworkError } from '../api';
import Avatar from '../components/Avatar';
import NovaIcon from '../components/NovaIcon';

async function streamNova({ text, conversationId, onEvent, signal }) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/nova/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text, conversationId }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `NovaAI request failed (${response.status}).`);
  }
  if (!response.body) throw new Error('This browser cannot stream NovaAI responses.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}

function timeLabel(value) {
  if (!value) return '';
  try {
    const text = String(value);
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
      ? `${text.replace(' ', 'T')}Z`
      : text;
    return new Date(normalized).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (_error) {
    return '';
  }
}

export default function NovaAI() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState({ available: true, provider: 'ollama', model: '' });
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const streamAbortRef = useRef(null);

  const loadConversations = useCallback(() => apiRequest('/nova/conversations')
    .then((result) => setConversations(result.conversations || []))
    .catch(() => {}), []);

  useEffect(() => {
    let active = true;
    apiRequest('/nova/messages')
      .then((result) => {
        if (!active) return;
        setMessages(result.messages || []);
        setConversationId(result.conversationId || null);
      })
      .catch((requestError) => { if (active) setError(normalizeNetworkError(requestError)); });
    apiRequest('/nova/status').then((result) => { if (active) setStatus(result); }).catch(() => {
      if (active) setStatus({ available: false, provider: 'ollama', model: '', message: 'Could not reach the NovaAI status check.' });
    });
    apiRequest('/profile/me').then((result) => { if (active) setProfile(result.profile || null); }).catch(() => {});
    loadConversations();
    return () => {
      active = false;
      streamAbortRef.current?.abort();
    };
  }, [loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sending) return;
    const pendingUser = { id: `pending-user-${Date.now()}`, role: 'user', text: trimmed };
    const pendingAssistant = { id: `pending-assistant-${Date.now()}`, role: 'assistant', text: '', pending: true };
    const controller = new AbortController();
    streamAbortRef.current = controller;
    let answerText = '';
    setSending(true);
    setError('');
    setInput('');
    setMessages((current) => [...current, pendingUser, pendingAssistant]);
    try {
      await streamNova({
        text: trimmed,
        conversationId,
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === 'meta') {
            if (data.conversationId) setConversationId(data.conversationId);
            if (data.userMessage) {
              setMessages((current) => current.map((message) => message.id === pendingUser.id ? data.userMessage : message));
            }
          }
          if (event === 'token' && data.token) {
            answerText += data.token;
            setMessages((current) => current.map((message) => message.id === pendingAssistant.id
              ? { ...message, text: message.text + data.token }
              : message));
          }
          if (event === 'done' && data.assistantMessage) {
            setMessages((current) => current.map((message) => message.id === pendingAssistant.id
              ? { ...data.assistantMessage, pending: false }
              : message));
          }
          if (event === 'error') throw new Error(data.message || 'NovaAI could not answer.');
        },
      });
      if (!answerText) throw new Error('NovaAI returned an empty answer. Try rephrasing your message.');
      setMessages((current) => current.map((message) => message.id === pendingAssistant.id
        ? { ...message, pending: false }
        : message));
      loadConversations();
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== pendingUser.id && message.id !== pendingAssistant.id));
      if (requestError.name !== 'AbortError') {
        setError(requestError.message);
        setInput(trimmed);
      }
    } finally {
      streamAbortRef.current = null;
      setSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    send(input);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  };

  const startNewChat = () => {
    streamAbortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setInput('');
    setError('');
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const openConversation = async (conversation) => {
    streamAbortRef.current?.abort();
    setShowHistory(false);
    setError('');
    try {
      const result = await apiRequest(`/nova/messages?conversationId=${encodeURIComponent(conversation.id)}`);
      setMessages(result.messages || []);
      setConversationId(result.conversationId || null);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (_error) {
      setError('Could not copy this answer.');
    }
  };

  const firstInterest = profile?.interests?.[0];
  const suggestions = [
    firstInterest ? `Draft a post about ${firstInterest}` : 'Draft a post about my interests',
    'Summarize what is happening in my Home feed',
    'Help me write a reply to a comment',
    'Suggest communities I should join',
  ];

  return <div className="mx-auto flex h-full min-h-[80vh] max-w-4xl flex-col bg-white">
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-900 p-2"><NovaIcon className="h-full w-full" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-extrabold text-slate-900">NovaAI</h2>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {status.available ? 'Ready' : 'Offline'}
          </span>
        </div>
        <p className="truncate text-[10px] text-slate-500">Your QuickChat assistant{status.model ? ` · ${status.model}` : ''}</p>
      </div>
      <button type="button" onClick={() => setShowHistory((shown) => !shown)} className={`grid h-9 w-9 place-items-center rounded-full ${showHistory ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`} aria-label="Conversation history" title="Conversation history"><i className="fa-solid fa-clock-rotate-left" /></button>
      <button type="button" onClick={startNewChat} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="New conversation" title="New conversation"><i className="fa-solid fa-plus" /></button>
    </header>

    {showHistory && <section className="border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between px-1"><h3 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Recent conversations</h3></div>
      {conversations.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">No previous conversations yet.</p>}
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className={`block w-full rounded-lg px-2 py-2 text-left ${String(conversation.id) === String(conversationId) ? 'bg-blue-50' : 'hover:bg-white'}`}>
          <span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-900">{conversation.title || 'QuickChat chat'}</strong><small className="shrink-0 text-[10px] text-slate-400">{timeLabel(conversation.created_at)}</small></span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{conversation.last_message || 'Empty conversation'}</span>
        </button>)}
      </div>
    </section>}

    <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
      {messages.length === 0 ? <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-900 p-4 shadow-lg"><NovaIcon className="h-full w-full" /></div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900">Hi, I&apos;m Nova</h1>
        <p className="mt-1 text-sm text-slate-600">I can help you write posts, find communities, plan content, and understand QuickChat. What are we working on?</p>
        {!status.available && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{status.message || 'NovaAI is offline right now.'}</p>}
        <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
          {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50">
            <i className="fa-solid fa-wand-magic-sparkles mr-2 text-blue-700" />{suggestion}
          </button>)}
        </div>
      </div> : <div className="mx-auto max-w-2xl space-y-3">
        {messages.map((message) => {
          const isTyping = message.role !== 'user' && message.pending && !message.text;
          return <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role !== 'user' && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 p-1.5"><NovaIcon className="h-full w-full" /></span>}
            <div className={`max-w-[85%] ${message.role === 'user' ? 'order-first' : ''}`}>
              {isTyping
                ? <span className="chat-typing-bubble flex h-9 items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3"><span className="chat-typing-dot" /><span className="chat-typing-dot" /><span className="chat-typing-dot" /></span>
                : <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${message.role === 'user' ? 'rounded-br-sm bg-blue-700 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900 shadow-sm'}`}>{message.text}</div>}
              {message.role !== 'user' && !isTyping && !message.pending && <button type="button" onClick={() => copyMessage(message)} className="mt-1 text-[10px] font-semibold text-slate-400 hover:text-blue-700">{copiedId === message.id ? 'Copied' : 'Copy'}</button>}
            </div>
            {message.role === 'user' && <Avatar name={profile?.fullName} picture={profile?.picture} size={28} />}
          </div>;
        })}
        <div ref={endRef} />
      </div>}
    </div>

    <div className="border-t border-slate-200 bg-white p-3">
      {error && <p className="mx-auto mb-2 max-w-2xl rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={8000}
          placeholder="Ask Nova anything about QuickChat…"
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
        />
        <button type="submit" disabled={!input.trim() || sending} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50" aria-label="Send message">
          <i className={`fa-solid ${sending ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'} text-sm`} />
        </button>
      </form>
      <p className="mx-auto mt-2 max-w-2xl text-center text-[10px] text-slate-400">NovaAI can make mistakes. Check important information before publishing.</p>
    </div>
  </div>;
}
