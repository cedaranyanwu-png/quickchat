import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api';

const POLL_MS = 2000;

const EMPTY = {
  session: null,
  status: 'live',
  viewerCount: 0,
  likes: 0,
  giftPoints: 0,
  comments: [],
  gifts: [],
  loading: true,
};

// Polls the live activity feed for both the host and every viewer. Only new
// comments and gifts are ever appended, so the chat history grows the same way
// on every device.
export default function useLiveActivity(sessionId, { enabled = true, onEnded } = {}) {
  const [activity, setActivity] = useState(EMPTY);
  const [error, setError] = useState('');
  const cursors = useRef({ comment: 0, gift: 0 });
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    cursors.current = { comment: 0, gift: 0 };
    endedRef.current = false;
    setActivity(EMPTY);
    setError('');
  }, [sessionId]);

  const applyComment = useCallback((comment) => {
    setActivity((current) => ({
      ...current,
      comments: [...current.comments, comment].slice(-100),
    }));
    cursors.current.comment = Math.max(cursors.current.comment, Number(comment.id) || 0);
  }, []);

  const applyGift = useCallback((gift) => {
    setActivity((current) => ({
      ...current,
      gifts: [...current.gifts, gift].slice(-40),
      giftPoints: current.giftPoints + Number(gift.points || 0),
    }));
    cursors.current.gift = Math.max(cursors.current.gift, Number(gift.id) || 0);
  }, []);

  useEffect(() => {
    if (!sessionId || !enabled) return undefined;
    let active = true;
    let timer;

    const poll = async () => {
      try {
        const result = await apiRequest(
          `/live/sessions/${sessionId}/activity?afterComment=${cursors.current.comment}&afterGift=${cursors.current.gift}`,
        );
        if (!active) return;

        if (result.comments?.length) {
          const last = result.comments[result.comments.length - 1];
          cursors.current.comment = Math.max(cursors.current.comment, Number(last.id) || 0);
        }
        if (result.gifts?.length) {
          const last = result.gifts[result.gifts.length - 1];
          cursors.current.gift = Math.max(cursors.current.gift, Number(last.id) || 0);
        }

        setActivity((current) => ({
          ...current,
          session: result.session,
          status: result.status,
          viewerCount: Number(result.viewerCount || 0),
          likes: Number(result.reactions?.total || 0),
          giftPoints: Number(result.session?.giftPoints ?? current.giftPoints),
          comments: [...current.comments, ...(result.comments || [])].slice(-100),
          gifts: [...current.gifts, ...(result.gifts || [])].slice(-40),
          loading: false,
        }));
        setError('');

        if (result.status !== 'live' && !endedRef.current) {
          endedRef.current = true;
          onEndedRef.current?.(result.session);
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) timer = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sessionId, enabled]);

  return { ...activity, error, applyComment, applyGift };
}
