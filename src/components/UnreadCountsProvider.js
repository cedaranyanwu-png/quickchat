import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../api';
import { showLocalNotification } from '../push';

const UnreadCountsContext = createContext({ unreadCounts: { notifications: 0, messages: 0 }, refreshUnreadCounts: async () => {} });

export function UnreadCountsProvider({ children, refreshKey }) {
  const [unreadCounts, setUnreadCounts] = useState({ notifications: 0, messages: 0 });
  const previousCounts = useRef(null);

  // Polled counts double as an in-app fallback for push: if the tab is hidden
  // and the numbers go up, raise a system notification for this browser.
  const applyCounts = useCallback((next) => {
    const previous = previousCounts.current;
    previousCounts.current = next;
    setUnreadCounts(next);
    if (!previous || !document.hidden || document.visibilityState === 'visible') return;

    const newMessages = next.messages - previous.messages;
    const newNotifications = next.notifications - previous.notifications;
    if (newMessages === 1) {
      showLocalNotification('New message on QuickChat', {
        body: 'Open QuickChat to reply.',
        tag: 'quickchat-messages',
        data: { url: '/messages', type: 'message' },
      });
    } else if (newMessages > 1) {
      showLocalNotification(`${newMessages} new messages`, {
        body: 'Open QuickChat to catch up.',
        tag: 'quickchat-messages',
        data: { url: '/messages', type: 'message' },
      });
    }
    if (newNotifications === 1) {
      showLocalNotification('New activity on QuickChat', {
        body: 'See who liked, replied, or followed you.',
        tag: 'quickchat-notifications',
        data: { url: '/notifications', type: 'activity' },
      });
    } else if (newNotifications > 1) {
      showLocalNotification(`${newNotifications} new notifications`, {
        body: 'See what happened while you were away.',
        tag: 'quickchat-notifications',
        data: { url: '/notifications', type: 'activity' },
      });
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const [notificationResult, messageResult] = await Promise.all([
        apiRequest('/notifications/unread-count'),
        apiRequest('/messages/unread-count'),
      ]);
      applyCounts({
        notifications: Number(notificationResult.unread || 0),
        messages: Number(messageResult.unread || 0),
      });
    } catch (_error) {
      // Keep the last known counts when the API is briefly unreachable.
    }
  }, [applyCounts]);

  const refreshUnreadCounts = useCallback(async () => {
    await loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadCounts();
    const timer = setInterval(loadCounts, 5000);
    return () => clearInterval(timer);
  }, [loadCounts, refreshKey]);

  const value = useMemo(() => ({ unreadCounts, refreshUnreadCounts }), [unreadCounts, refreshUnreadCounts]);
  return <UnreadCountsContext.Provider value={value}>{children}</UnreadCountsContext.Provider>;
}

export function useUnreadCounts() {
  return React.useContext(UnreadCountsContext);
}
