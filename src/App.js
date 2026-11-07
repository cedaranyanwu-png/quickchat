import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate, Link } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { API_BASE_URL, apiRequest, resolveMediaUrl } from './api';

// Components
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import TopNav from './components/TopNav';
import BottomNav from './components/BottomNav';
import FAB from './components/FAB';
import PostModal from './components/PostModal';

// Pages
import Home from './pages/Home';
import Explore from './pages/Explore';
import RSSAdmin from './pages/RSSAdmin';
import SavedArticles from './pages/SavedArticles';
import Notifications from './pages/Notifications';
import Messages from './pages/Messages';
import Videos from './pages/Videos';
import Books from './pages/Books';
import Communities from './pages/Communities';
import CommunityFeed from './pages/CommunityFeed';
import Lists from './pages/Lists';
import Profile from './pages/Profile';
import ViewProfile from './pages/ViewProfile';
import Follow from './pages/Follow';
import NovaAI from './pages/NovaAI';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import EditProfile from './pages/EditProfile';
import Settings from './pages/Settings';
import AdvancedComposer from './pages/AdvancedComposer';
import Verification from './pages/Verification';
import SharePreview from './pages/SharePreview';
import Live from './pages/Live';
import RecommendationAssistant from './pages/RecommendationAssistant';
import AdsDashboard from './pages/AdsDashboard';
import Wallet from './pages/Wallet';
import Admin from './pages/Admin';
import AdminModeration from './pages/AdminModeration';
import Menu from './pages/Menu';
import VideoModal from './components/VideoModal';
import PushNotificationPrompt from './components/PushNotificationPrompt';
import { UnreadCountsProvider } from './components/UnreadCountsProvider';
import { AdultContentProvider, getAgeConsentIdentity } from './components/AdultContent';
import { registerServiceWorker, syncPushSubscription } from './push';

const SettingsHub = ({ onLogout }) => <>
  <div className="mx-auto max-w-3xl px-4 pt-3">
    <Link to="/settings/wallet" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm no-underline hover:border-blue-200 hover:text-blue-700">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><i className="fa-solid fa-wallet" /></span>
      <span className="flex-1">Wallet &amp; earnings</span>
      <i className="fa-solid fa-chevron-right text-xs" />
    </Link>
  </div>
  <Settings onLogout={onLogout} />
</>;

const Layout = ({ googleEnabled, isAuthenticated, onAuthenticated }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [modalImage, setModalImage] = useState(null);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [feedRevision, setFeedRevision] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState(null);
  const presenceSessionId = useRef('');
  if (!presenceSessionId.current) {
    presenceSessionId.current = window.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const openModal = (src, type = 'image') => {
    const resolvedSrc = resolveMediaUrl(src);
    if (resolvedSrc) setModalImage({ src: resolvedSrc, type });
  };
  const closeModal = () => setModalImage(null);
  const openPostModal = () => setIsPostModalOpen(true);
  const closePostModal = () => setIsPostModalOpen(false);
  const openAdvancedComposer = (handoff) => {
    setIsPostModalOpen(false);
    navigate('/compose/advanced', { state: handoff ? { handoff } : undefined });
  };

  const isAuthPage = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email'].includes(location.pathname);
  const isSharePage = location.pathname.startsWith('/share/');
  const isLiveWatchPage = /^\/live\/[^/]+\/?$/.test(location.pathname);
  const isVideosPage = location.pathname === '/videos';
  const isMessagesPage = location.pathname.replace(/\/$/, '') === '/messages';
  const showRightSidebar = !isMessagesPage && !isAuthPage;

  useEffect(() => {
    if (!isAuthenticated) return;
    registerServiceWorker().then(() => syncPushSubscription()).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (isVideosPage) setActiveVideoId(null);
  }, [isVideosPage]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const markOffline = () => apiRequest('/messages/presence', { method: 'DELETE', body: { sessionId: presenceSessionId.current }, keepalive: true }).catch(() => {});
    const heartbeat = () => apiRequest('/messages/presence', { method: 'POST', body: { sessionId: presenceSessionId.current } }).catch(() => {});
    heartbeat();
    const timer = setInterval(heartbeat, 15000);
    window.addEventListener('pagehide', markOffline);
    return () => { clearInterval(timer); window.removeEventListener('pagehide', markOffline); };
  }, [isAuthenticated]);

  if (isSharePage) {
    return <Routes>
      <Route path="/share/post/:postId" element={<SharePreview kind="post" />} />
      <Route path="/share/video/:videoId" element={<SharePreview kind="video" />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>;
  }

  // The administration console is an independent portal and must be reachable
  // without creating or signing into a QuickChat member account.
  if (location.pathname.replace(/\/+$/, '').startsWith('/admin')) {
    return <Routes><Route path="/admin" element={<Admin />} /><Route path="/admin/moderation" element={<AdminModeration />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes>;
  }

  if (isAuthPage) {
    if (isAuthenticated && (location.pathname === '/' || location.pathname === '/login')) return <Navigate to="/home" replace />;
    return <Routes>
      <Route path="/" element={<Login googleEnabled={googleEnabled} onAuthenticated={onAuthenticated} />} />
      <Route path="/login" element={<Login googleEnabled={googleEnabled} onAuthenticated={onAuthenticated} />} />
      <Route path="/register" element={<Register googleEnabled={googleEnabled} onAuthenticated={onAuthenticated} />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
    </Routes>;
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (isLiveWatchPage) {
    return <Routes><Route path="/live/:sessionId" element={<Live />} /><Route path="*" element={<Navigate to="/live" replace />} /></Routes>;
  }

  return (
    <UnreadCountsProvider refreshKey={location.pathname}>
      <div className="flex h-screen w-screen overflow-hidden bg-white font-sans">
        <div className="hidden h-screen flex-shrink-0 lg:block">
          <Sidebar onOpenPost={openPostModal} onLogout={() => {
            apiRequest('/messages/presence', { method: 'DELETE', body: { sessionId: presenceSessionId.current }, keepalive: true }).catch(() => {});
            onAuthenticated(false);
          }} />
        </div>
        <main className="h-screen flex-1 bg-white" style={isVideosPage || isMessagesPage ? { overflow: 'hidden' } : { overflowY: 'auto' }}>
          <PushNotificationPrompt />
          <div className="lg:hidden"><TopNav /></div>
          <Routes>
            <Route path="/home" element={<Home refreshKey={feedRevision} openModal={openModal} onOpenPost={openPostModal} openVideo={setActiveVideoId} />} />
            <Route path="/explore" element={<Explore openModal={openModal} openVideo={setActiveVideoId} />} />
            <Route path="/discover" element={<Navigate to="/explore?tab=rss" replace />} />
            <Route path="/admin/rss" element={<RSSAdmin />} />
            <Route path="/saved-articles" element={<SavedArticles />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/menu" element={<Menu onLogout={() => onAuthenticated(false)} />} />
            <Route path="/nova" element={<NovaAI />} />
            <Route path="/live" element={<Live />} />
            <Route path="/follow" element={<Follow />} />
            <Route path="/videos" element={<Videos openVideo={setActiveVideoId} />} />
            <Route path="/books" element={<Books openModal={openModal} openVideo={setActiveVideoId} />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/communities/:communityId" element={<CommunityFeed openModal={openModal} openVideo={setActiveVideoId} />} />
            <Route path="/lists" element={<Lists />} />
            <Route path="/profile" element={<Profile openModal={openModal} openVideo={setActiveVideoId} />} />
            <Route path="/profile/edit" element={<EditProfile />} />
            <Route path="/settings" element={<SettingsHub onLogout={() => {
              apiRequest('/messages/presence', { method: 'DELETE', body: { sessionId: presenceSessionId.current }, keepalive: true }).catch(() => {});
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              onAuthenticated(false);
            }} />} />

            <Route path="/settings/wallet" element={<Wallet />} />
            <Route path="/wallet" element={<Navigate to="/settings/wallet" replace />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/compose/advanced" element={<AdvancedComposer onPublished={() => setFeedRevision((revision) => revision + 1)} />} />
            <Route path="/recommendations" element={<RecommendationAssistant openModal={openModal} openVideo={setActiveVideoId} />} />
            <Route path="/ads" element={<AdsDashboard />} />
            <Route path="/profile/:username" element={<ViewProfile openModal={openModal} openVideo={setActiveVideoId} />} />
          </Routes>
        </main>
        {showRightSidebar && <div className="hidden h-screen flex-shrink-0 lg:block"><RightSidebar /></div>}
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"><BottomNav /></div>
        {!isVideosPage && !isMessagesPage && <div className="fixed bottom-20 right-4 z-40 lg:hidden"><FAB onOpenPost={openPostModal} /></div>}
        <PostModal isOpen={isPostModalOpen} onClose={closePostModal} onOpenAdvanced={openAdvancedComposer} onPost={() => setFeedRevision((revision) => revision + 1)} />
        <VideoModal videoId={activeVideoId} onClose={() => setActiveVideoId(null)} />
        {modalImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={closeModal}>
          <button className="absolute right-4 top-4 text-xl text-white" onClick={closeModal}><i className="fa-solid fa-xmark" /></button>
          {modalImage.type === 'video'
            ? <video src={modalImage.src} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg bg-black shadow-2xl" onClick={(event) => event.stopPropagation()} />
            : <img src={modalImage.src} alt="Full view" className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={(event) => event.stopPropagation()} />}
        </div>}

      </div>
    </UnreadCountsProvider>
  );
};

export default function App() {
  const [googleClientId, setGoogleClientId] = useState(process.env.REACT_APP_GOOGLE_CLIENT_ID || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const handleExpiredSession = () => setIsAuthenticated(false);
    window.addEventListener('quickchat:session-expired', handleExpiredSession);
    return () => window.removeEventListener('quickchat:session-expired', handleExpiredSession);
  }, []);

  useEffect(() => {
    if (googleClientId) return undefined;
    let isActive = true;
    fetch(`${API_BASE_URL}/config`)
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => { if (isActive && config?.googleClientId) setGoogleClientId(config.googleClientId); })
      .catch(() => {});
    return () => { isActive = false; };
  }, [googleClientId]);

  const handleAuthenticated = (authenticated = true) => setIsAuthenticated(authenticated);
  const ageConsentIdentity = getAgeConsentIdentity();
  const app = <BrowserRouter><AdultContentProvider key={ageConsentIdentity} identity={ageConsentIdentity}>
    <Layout googleEnabled={Boolean(googleClientId)} onAuthenticated={handleAuthenticated} isAuthenticated={isAuthenticated} />
  </AdultContentProvider></BrowserRouter>;
  return googleClientId ? <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider> : app;
}
