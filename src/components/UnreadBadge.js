import React from 'react';

export default function UnreadBadge({ count, className = '' }) {
  const unread = Number(count || 0);
  if (unread < 1) return null;
  return <span aria-label={`${unread} unread`} className={`min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center font-bold ${className}`}>
    {unread > 9 ? '9+' : unread}
  </span>;
}
