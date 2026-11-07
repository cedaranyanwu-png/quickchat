import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import { useUnreadCounts } from '../components/UnreadCountsProvider';

const iconFor = (type) => ({
  like: ['fa-heart', 'text-red-500', 'bg-red-100'],
  follow: ['fa-user-plus', 'text-blue-700', 'bg-blue-100'],
  reply: ['fa-comment', 'text-emerald-600', 'bg-emerald-100'],
  video_comment: ['fa-comment', 'text-emerald-600', 'bg-emerald-100'],
  repost: ['fa-retweet', 'text-green-700', 'bg-green-100'],
  message: ['fa-envelope', 'text-blue-700', 'bg-blue-100'],
  live: ['fa-tower-broadcast', 'text-red-600', 'bg-red-100'],
  interest_post: ['fa-compass', 'text-purple-700', 'bg-purple-100'],
  system: ['fa-bullhorn', 'text-amber-700', 'bg-amber-100'],
}[type] || ['fa-bell', 'text-slate-600', 'bg-slate-100']);

export default function Notifications() {
  const navigate = useNavigate();
  const { refreshUnreadCounts } = useUnreadCounts();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async (markSeen = false) => {
    const result = await apiRequest('/notifications');
    setNotifications(result.notifications || []);
    setUnread(Number(result.unread || 0));
    setError('');
    if (markSeen && Number(result.unread || 0) > 0) {
      await apiRequest('/notifications/read', { method: 'PATCH' });
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
      setUnread(0);
      await refreshUnreadCounts();
    }
  }, [refreshUnreadCounts]);

  useEffect(() => {
    let active = true;
    const refresh = async (markSeen = false) => {
      try {
        const result = await apiRequest('/notifications');
        if (!active) return;
        setNotifications(result.notifications || []);
        setUnread(Number(result.unread || 0));
        setError('');
        if (markSeen && Number(result.unread || 0) > 0) {
          await apiRequest('/notifications/read', { method: 'PATCH' });
          await refreshUnreadCounts();
          if (active) {
            setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
            setUnread(0);
          }
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    refresh(true);
    const timer = setInterval(() => refresh(false), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [refreshUnreadCounts]);

  const openNotification = async (notification) => {
    if (!notification.read) {
      try {
        await apiRequest('/notifications/read', { method: 'PATCH' });
        await loadNotifications(false);
        await refreshUnreadCounts();
      } catch (_error) {
        // Navigation should still work when marking a notice read is temporarily unavailable.
      }
    }
    if (notification.type === 'message' && notification.actor?.id) {
      navigate(`/messages?userId=${encodeURIComponent(notification.actor.id)}`);
    } else if (notification.liveSessionId) {
      navigate(`/live/${notification.liveSessionId}`);
    } else if (notification.actor?.username) {
      navigate(`/profile/${encodeURIComponent(notification.actor.username)}`);
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read', { method: 'PATCH' });
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
      setUnread(0);
      await refreshUnreadCounts();
    } catch (requestError) { setError(requestError.message); }
  };

  return <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
    <header className="sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3">
      <div><h2 className="text-lg font-extrabold text-slate-900">Notifications</h2><p className="text-xs text-slate-500">Updates from people and interests you follow</p></div>
      {unread > 0 && <button onClick={markAllRead} className="text-xs font-bold text-blue-700 hover:text-blue-800">Mark all as read</button>}
    </header>
    {error && <p className="p-4 text-sm text-red-600" role="alert">{error}</p>}
    {notifications.map((notification) => {
      const [icon, color, background] = iconFor(notification.type);
      const isSystem = notification.type === 'system';
      return <button key={notification.id} onClick={() => openNotification(notification)} className={`w-full flex items-center gap-3 p-4 border-b border-slate-200 text-left hover:bg-slate-50 ${notification.read ? 'bg-white' : 'bg-blue-50/60'}`}>
        {isSystem
          ? <span className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-white"><i className="fa-solid fa-comment-dots text-sm" /></span>
          : <span className={`w-9 h-9 rounded-full ${background} flex items-center justify-center ${color}`}><i className={`fa-solid ${icon}`} /></span>}
        {notification.actor && <Avatar name={notification.actor.name} picture={notification.actor.picture} size={36} />}
        <span className="flex-1 text-sm text-slate-700"><strong className="text-slate-900">{isSystem ? 'QuickChat' : notification.actor?.name || 'A user'} {!isSystem && <VerifiedBadge verified={notification.actor?.verified} />}</strong> {notification.text}<span className="block text-xs text-slate-400 mt-1">{notification.time}</span></span>
        {!notification.read && <span className="h-2.5 w-2.5 rounded-full bg-blue-700" aria-label="Unread" />}
      </button>;
    })}
    {!error && notifications.length === 0 && <p className="p-8 text-center text-sm text-slate-500">You are all caught up. New activity will appear here.</p>}
  </div>;
}
