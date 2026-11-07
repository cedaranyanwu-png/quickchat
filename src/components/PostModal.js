import React, { useState, useEffect, useRef } from 'react';
import { apiRequest, uploadMedia } from '../api';
import Avatar from './Avatar';
import LiveStudio from './LiveStudio';

const PostModal = ({ isOpen, onClose, onOpenAdvanced, onPost }) => {
  const [postText, setPostText] = useState('');
  const [media, setMedia] = useState([]); 
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoSlide, setIsAutoSlide] = useState(true);
  const [isPosting, setIsPosting] = useState(false); 
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('post');
  const [postTarget, setPostTarget] = useState('feed');

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  useEffect(() => {
    if (!isAutoSlide || media.length <= 1 || !isOpen) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % media.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAutoSlide, media.length, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      setIsAutoSlide(true);
      setMode('post');
      setPostTarget('feed');
      setError('');
      // The composer uses the signed-in account returned by the backend.
      apiRequest('/profile/me').then((result) => setProfile(result.profile)).catch(() => {});
    }
  }, [isOpen]);

  const handleLivePosted = (post) => {
    onPost?.(post);
    media.forEach((item) => URL.revokeObjectURL(item.url));
    setPostText('');
    setMedia([]);
    setCurrentSlide(0);
    setMode('post');
    onClose();
  };

  const openAdvancedComposer = () => {
    const handoff = {
      text: postText,
      media: media.map((item) => ({ file: item.file, type: item.type })),
    };
    media.forEach((item) => URL.revokeObjectURL(item.url));
    setPostText('');
    setMedia([]);
    setCurrentSlide(0);
    onOpenAdvanced?.(handoff);
  };

  if (!isOpen) return null;

  if (mode === 'live') {
    return <LiveStudio caption={postText} profile={profile} onCancel={() => setMode('post')} onPosted={handleLivePosted} />;
  }

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const available = postTarget === 'status' ? (media.length ? 0 : 1) : Math.max(0, 4 - media.length);
    const newMedia = files.slice(0, available).map((file) => ({ type: 'image', url: URL.createObjectURL(file), file }));
    setMedia((prev) => [...prev, ...newMedia]);
    setError(files.length > available ? (postTarget === 'status' ? 'A status can contain one photo or video.' : 'Posts can have at most four attachments.') : '');
    e.target.value = '';
  };

  const handleVideoUpload = (e) => {
    const files = Array.from(e.target.files);
    const available = postTarget === 'status' ? (media.length ? 0 : 1) : Math.max(0, 4 - media.length);
    const newMedia = files.slice(0, available).map((file) => ({ type: 'video', url: URL.createObjectURL(file), file }));
    setMedia((prev) => [...prev, ...newMedia]);
    setError(files.length > available ? (postTarget === 'status' ? 'A status can contain one photo or video.' : 'Posts can have at most four attachments.') : '');
    e.target.value = '';
  };

  const removeMedia = (index) => {
    setMedia((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (currentSlide >= updated.length) setCurrentSlide(Math.max(0, updated.length - 1));
      return updated;
    });
  };

  const goToSlide = (index) => setCurrentSlide(index);
  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % media.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + media.length) % media.length);

  const handlePost = async () => {
    const text = postText.trim();
    if (!text && media.length === 0) return;
    if (postTarget === 'status' && media[0]?.type === 'video' && text.length > 300) {
      setError('Video status captions must be 300 characters or fewer.');
      return;
    }
    setIsPosting(true);
    setError('');
    try {
      // Upload selected files first; both destinations store backend media URLs.
      const uploadedMedia = await Promise.all(media.map(async (item) => {
        const uploaded = await uploadMedia(item.file);
        return { type: uploaded.type || item.type, url: uploaded.url };
      }));
      if (postTarget === 'status') {
        await apiRequest('/statuses', {
          method: 'POST',
          body: {
            type: uploadedMedia[0]?.type || 'text',
            text,
            mediaUrl: uploadedMedia[0]?.url || '',
            backgroundColor: '#123b8a',
          },
        });
      } else {
        const result = await apiRequest('/posts', {
          method: 'POST',
          body: { text, media: uploadedMedia },
        });
        onPost?.(result.post);
      }
      // Refresh the Home feed and status tray after either successful publish.
      if (postTarget === 'status') onPost?.(null);
      media.forEach((item) => URL.revokeObjectURL(item.url));
      setPostText('');
      setMedia([]);
      setCurrentSlide(0);
      setPostTarget('feed');
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsPosting(false);
    }
  };

  const changePostTarget = (target) => {
    if (target === postTarget) return;
    if (target === 'status' && media.length > 1) {
      media.slice(1).forEach((item) => URL.revokeObjectURL(item.url));
      setMedia((current) => current.slice(0, 1));
      setCurrentSlide(0);
    }
    setPostTarget(target);
    setError('');
  };

  const handleClose = () => {
    media.forEach((item) => URL.revokeObjectURL(item.url));
    setPostText('');
    setMedia([]);
    setCurrentSlide(0);
    setMode('post');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <button onClick={handleClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
            <i className="fa-solid fa-xmark text-slate-700 text-lg"></i>
          </button>
          <h3 className="font-bold text-slate-900 text-base">{postTarget === 'status' ? 'Create Status' : 'Create Post'}</h3>
          <div className="w-8"></div>
        </div>

        <div className="p-4">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Choose where to publish">
            <button type="button" onClick={() => changePostTarget('feed')} className={`rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${postTarget === 'feed' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <i className="fa-solid fa-newspaper mr-1.5" /> Normal feed
            </button>
            <button type="button" onClick={() => changePostTarget('status')} className={`rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${postTarget === 'status' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <i className="fa-solid fa-circle-notch mr-1.5" /> Status · 24 hours
            </button>
          </div>
          <div className="flex gap-3">
            <Avatar name={profile?.fullName} picture={profile?.picture} size={40} />
            <div className="flex-1">
              <div className="font-bold text-sm text-slate-900">{profile?.fullName || 'Your account'}</div>
              <div className="text-slate-500 text-xs">{profile?.handle || ''}</div>
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={postTarget === 'status' ? 'Write a status update…' : "What's happening?!"}
                maxLength={postTarget === 'status' ? 700 : undefined}
                className="w-full border-none outline-none text-sm resize-none min-h-[80px] mt-2 text-slate-900 placeholder-slate-400"
              />
            </div>
          </div>

          {postTarget === 'status' && <p className="mt-1 text-[11px] text-slate-400">Your status is visible for 24 hours. Add one photo or video, or share text only.</p>}
          {error && <p className="mt-3 text-xs text-red-600" role="alert">{error}</p>}

          {media.length > 0 && (
            <div className="mt-3 relative">
              <div className="relative bg-slate-100 rounded-xl overflow-hidden aspect-video">
                {media.map((item, index) => (
                  <div key={index} className={`absolute inset-0 transition-opacity duration-300 ${index === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {item.type === 'image' ? (
                      <img src={item.url} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <video src={item.url} controls className="w-full h-full object-cover" onClick={(e) => e.stopPropagation()} />
                    )}
                    <button onClick={() => removeMedia(index)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                      <i className="fa-solid fa-xmark text-sm"></i>
                    </button>
                    <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center gap-1">
                      <i className={item.type === 'image' ? 'fa-regular fa-image' : 'fa-solid fa-video'}></i>
                      {item.type === 'image' ? 'Image' : 'Video'}
                    </div>
                  </div>
                ))}
                {media.length > 1 && (
                  <>
                    <button onClick={prevSlide} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                      <i className="fa-solid fa-chevron-left text-sm"></i>
                    </button>
                    <button onClick={nextSlide} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                      <i className="fa-solid fa-chevron-right text-sm"></i>
                    </button>
                  </>
                )}
              </div>
              {media.length > 1 && (
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-1.5">
                    {media.map((_, index) => (
                      <button key={index} onClick={() => goToSlide(index)} className={`h-1.5 rounded-full transition-all ${index === currentSlide ? 'bg-blue-700 w-6' : 'bg-slate-300 w-1.5 hover:bg-slate-400'}`} />
                    ))}
                  </div>
                  <div className="text-xs text-slate-500">{currentSlide + 1} / {media.length}</div>
                </div>
              )}
              {media.length > 1 && (
                <button onClick={() => setIsAutoSlide(!isAutoSlide)} className={`mt-2 text-xs font-semibold flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${isAutoSlide ? 'text-blue-700 bg-blue-50' : 'text-slate-500 bg-slate-100'}`}>
                  <i className={`fa-solid ${isAutoSlide ? 'fa-pause' : 'fa-play'} text-[10px]`}></i>
                  {isAutoSlide ? 'Auto-slide ON' : 'Auto-slide OFF'}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
            <div className="flex gap-1">
              <button onClick={() => imageInputRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-blue-50 transition-colors" title="Add images">
                <i className="fa-regular fa-image text-blue-700"></i>
              </button>
              <button onClick={() => videoInputRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-purple-50 transition-colors" title="Add videos">
                <i className="fa-solid fa-video text-purple-600"></i>
              </button>
              <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-amber-50 transition-colors">
                <i className="fa-regular fa-face-smile text-amber-500"></i>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMode('live')} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50" title="Go live">
                <i className="fa-solid fa-tower-broadcast" /> Go live
              </button>
              <button type="button" onClick={openAdvancedComposer} className="flex h-9 w-9 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50" aria-label="Open advanced composer with this draft" title="Advanced composer">
                <i className="fa-solid fa-sliders" />
              </button>
              <button onClick={handlePost} disabled={(!postText.trim() && media.length === 0) || isPosting} className="px-5 py-2 bg-blue-700 text-white rounded-full text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {isPosting ? (<><i className="fa-solid fa-circle-notch fa-spin text-xs"></i> Publishing...</>) : postTarget === 'status' ? 'Share status' : 'Post'}
              </button>
            </div>
          </div>

          <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
          <input ref={videoInputRef} type="file" accept="video/*" multiple onChange={handleVideoUpload} className="hidden" />
        </div>
      </div>
    </div>
  );
};

export default PostModal;
