import React from 'react';
import { useNavigate } from 'react-router-dom';
import UnreadBadge from './UnreadBadge';
import { useUnreadCounts } from './UnreadCountsProvider';

const TopNav = () => {
  const navigate = useNavigate();
  const { unreadCounts } = useUnreadCounts();
  return (
    <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 z-20 px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {/* Logo Section */}
        {/* Removed bg-blue-700 and padding so the image covers the whole area */}
        <div className="w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden">
          <img 
            src="/favicon/logo.png" 
            alt="QuickChat Logo" 
            className="w-full h-full object-cover" 
          />
        </div>
        <span className="text-slate-900 text-base font-extrabold">QuickChat</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/explore')} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors" aria-label="Search">
          <i className="fa-solid fa-magnifying-glass text-slate-700 text-sm"></i>
        </button>
        <button onClick={() => navigate('/messages')} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors relative" aria-label="Messages">
          <i className="fa-solid fa-envelope text-slate-700 text-sm"></i>
          <UnreadBadge count={unreadCounts.messages} className="absolute -right-2 -top-2" />
        </button>
        <button onClick={() => navigate('/notifications')} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors relative" aria-label="Notifications">
          <i className="fa-regular fa-bell text-slate-700 text-sm"></i>
          <UnreadBadge count={unreadCounts.notifications} className="absolute -right-2 -top-2" />
        </button>
      </div>
    </div>
  );
};

export default TopNav;
