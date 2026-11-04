import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, uploadMedia } from '../api';
import Avatar from '../components/Avatar';
import { INTEREST_OPTIONS } from '../interest-options';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_CAPTION_LENGTH = 5000;
const MAX_ATTACHMENTS = 4;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const PREMIUM_POST_PRICE_NGN = '500.00';

export default function AdvancedComposer({ onPublished }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const handoff = location.state?.handoff;
  const [profile, setProfile] = useState(null);
  const [caption, setCaption] = useState(handoff?.text || '');
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState([]);
  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [customKeywordInput, setCustomKeywordInput] = useState('');
  const [audiences, setAudiences] = useState([]);
  const [suggestedHashtags, setSuggestedHashtags] = useState([]);
  const [suggestedCommunities, setSuggestedCommunities] = useState([]);
  const [optimization, setOptimization] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hashtagInput, setHashtagInput] = useState('');
  const [targetInterests, setTargetInterests] = useState([]);
  const [destination, setDestination] = useState(searchParams.get('destination') === 'community' ? 'community' : 'home');
  const [visibility, setVisibility] = useState('public');
  const [payments, setPayments] = useState(null);
  const [communityId, setCommunityId] = useState(searchParams.get('communityId') || '');
  const [communities, setCommunities] = useState([]);
  const [insights, setInsights] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [insightError, setInsightError] = useState('');
  const [media, setMedia] = useState(() => (Array.isArray(handoff?.media) ? handoff.media : [])
    .filter((item) => item?.file)
    .slice(0, MAX_ATTACHMENTS)
    .map((item, index) => ({
      id: `handoff-${Date.now()}-${index}`,
      file: item.file,
      type: item.type === 'video' ? 'video' : 'image',
      previewUrl: URL.createObjectURL(item.file),
      uploaded: null,
      thumbnail: null,
    })));
  const [error, setError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [novaIdea, setNovaIdea] = useState('');
  const [novaTone, setNovaTone] = useState('friendly');
  const [novaLength, setNovaLength] = useState('standard');
  const [novaBusy, setNovaBusy] = useState('');
  const [novaError, setNovaError] = useState('');
  const [novaNotice, setNovaNotice] = useState('');
  const [novaStatus, setNovaStatus] = useState(null);
  const fileInputRef = useRef(null);
  const mediaRef = useRef(media);
  const hashtags = useMemo(() => [...new Set(hashtagInput.split(/[\s,]+/).map((tag) => tag.trim().replace(/^#+/, '').toLowerCase())
    .filter((tag) => /^[a-z0-9_]{1,40}$/.test(tag)))].slice(0, 10), [hashtagInput]);

  useEffect(() => {
    // Use the current signed-in profile in the preview and composer header.
    apiRequest('/profile/me')
      .then((result) => setProfile(result.profile || null))
      .catch((requestError) => setError(requestError.message));
    apiRequest('/payments/me').then(setPayments).catch(() => setPayments(null));
    apiRequest('/nova/status').then(setNovaStatus).catch(() => setNovaStatus(null));
  }, []);

  useEffect(() => {
    apiRequest('/communities')
      .then((result) => setCommunities((result.communities || []).filter((community) => community.joined)))
      .catch(() => setCommunities([]));
    apiRequest('/creator/analytics')
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        interests: targetInterests.join(','),
        topic,
        hashtags: hashtags.join(','),
      });
      apiRequest(`/composer/insights?${params.toString()}`)
        .then((result) => { if (active) { setInsights(result); setInsightError(''); } })
        .catch((requestError) => { if (active) setInsightError(requestError.message); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [targetInterests, topic, hashtags]);

  const runContentAnalysis = async (textToAnalyze = caption) => {
    if (!textToAnalyze.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await apiRequest('/composer/classify', {
        method: 'POST',
        body: { text: textToAnalyze, hashtags },
      });
      if (res) {
        setSuggestedTopics(res.topics || []);
        if (topics.length === 0 && res.topics?.length) {
          setTopics(res.topics.slice(0, 3));
        }
        if (keywords.length === 0 && res.keywords?.length) {
          setKeywords(res.keywords.slice(0, 5));
        }
        setAudiences(res.audiences || []);
        setSuggestedHashtags(res.hashtags || []);
        setSuggestedCommunities(res.communities || []);
        setOptimization(res.optimization || null);

        if (targetInterests.length === 0 && res.interests?.length) {
          setTargetInterests(res.interests.slice(0, 4));
        }
      }
    } catch (_err) {
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!caption || caption.trim().length < 8) return undefined;
    const timer = setTimeout(() => {
      runContentAnalysis(caption);
    }, 600);
    return () => clearTimeout(timer);
  }, [caption]);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(() => () => {
    // Release local preview URLs when the composer page closes.
    mediaRef.current.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl);
      if (item.thumbnail?.previewUrl) URL.revokeObjectURL(item.thumbnail.previewUrl);
    });
  }, []);

  const addFiles = (fileList) => {
    if (isPublishing) return;
    const files = Array.from(fileList || []);
    const accepted = [];
    let validationMessage = '';

    for (const file of files) {
      const isImage = IMAGE_TYPES.has(file.type);
      const isVideo = VIDEO_TYPES.has(file.type);
      const maxBytes = isVideo ? MAX_VIDEO_BYTES : 15 * 1024 * 1024;
      if (!isImage && !isVideo) {
        validationMessage = 'Choose JPEG, PNG, GIF, WebP, MP4, WebM, or MOV files.';
        continue;
      }
      if (file.size > maxBytes) {
        validationMessage = `Each ${isVideo ? 'video' : 'image'} must be under ${isVideo ? '500 MB' : '15 MB'}.`;
        continue;
      }
      if (media.length + accepted.length >= MAX_ATTACHMENTS) {
        validationMessage = 'A post can have at most four attachments.';
        break;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        type: isVideo ? 'video' : 'image',
        previewUrl: URL.createObjectURL(file),
        uploaded: null,
      thumbnail: null,
      });
    }

    if (accepted.length) setMedia((current) => [...current, ...accepted]);
    setError(validationMessage);
  };

  const setVideoThumbnail = (item, file) => {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type) || file.size > 15 * 1024 * 1024) {
      setError('Video thumbnails must be JPEG, PNG, GIF, or WebP images under 15 MB.');
      return;
    }
    setError('');
    const previous = media.find((attachment) => attachment.id === item.id);
    if (previous?.thumbnail?.previewUrl) URL.revokeObjectURL(previous.thumbnail.previewUrl);
    if (previous?.uploaded?.thumbnailUrl) void deleteUploadedFile(previous.uploaded.thumbnailUrl);
    const previewUrl = URL.createObjectURL(file);
    setMedia((current) => current.map((attachment) => {
      if (attachment.id !== item.id) return attachment;
      return {
        ...attachment,
        uploaded: attachment.uploaded ? { type: attachment.uploaded.type, url: attachment.uploaded.url } : null,
        thumbnail: { file, previewUrl, uploadedUrl: null },
      };
    }));
  };

  const removeMedia = async (item) => {
    URL.revokeObjectURL(item.previewUrl);
    if (item.thumbnail?.previewUrl) URL.revokeObjectURL(item.thumbnail.previewUrl);
    setMedia((current) => current.filter((attachment) => attachment.id !== item.id));
    await Promise.all([item.uploaded?.url, item.uploaded?.thumbnailUrl].filter(Boolean).map(deleteUploadedFile));
  };

  const canMonetize = Boolean(payments?.gatewayConfigured && payments?.publicUrlConfigured && payments?.webhookUrlConfigured && payments?.payoutAccount?.ready);

  // --- NovaAI post assistant ---------------------------------------------
  const applyNovaHashtags = (tags) => {
    const existing = hashtagInput.split(/[\s,]+/).map((tag) => tag.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean);
    const merged = [...new Set([...existing, ...tags.map((tag) => String(tag).replace(/^#+/, '').toLowerCase())])]
      .filter((tag) => /^[a-z0-9_]{1,40}$/.test(tag))
      .slice(0, 10);
    setHashtagInput(merged.join(', '));
  };

  const applyNovaTopic = (value) => {
    const needle = String(value || '').trim().toLowerCase();
    if (!needle) return;
    const match = INTEREST_OPTIONS.find(([key, label]) => (
      needle === key || needle === label.toLowerCase() ||
      needle.includes(label.toLowerCase()) || label.toLowerCase().includes(needle)
    ));
    if (match) setTopic(match[0]);
  };

  const applyNovaInterests = (text) => {
    const haystack = String(text || '').toLowerCase();
    const matches = INTEREST_OPTIONS
      .filter(([key, label]) => haystack.includes(label.toLowerCase()) || haystack.includes(key))
      .map(([key]) => key);
    if (!matches.length) return;
    setTargetInterests((current) => [...new Set([...current, ...matches])].slice(0, 12));
  };

  const runNova = async (mode) => {
    setNovaError('');
    setNovaNotice('');
    if (mode === 'draft' && !novaIdea.trim() && !caption.trim()) {
      setNovaError('Describe your idea first, for example: "share my first product launch".');
      return;
    }
    if (mode !== 'draft' && !caption.trim()) {
      setNovaError('Write a caption first so NovaAI has something to work with.');
      return;
    }
    setNovaBusy(mode);
    try {
      const result = await apiRequest('/nova/post-assist', {
        method: 'POST',
        body: {
          mode,
          idea: novaIdea,
          tone: novaTone,
          length: novaLength,
          currentText: caption,
          topic: topic ? INTEREST_OPTIONS.find(([key]) => key === topic)?.[1] || topic : '',
        },
      });
      const draft = result.draft || {};
      if (draft.text) {
        setCaption(draft.text.slice(0, MAX_CAPTION_LENGTH));
        applyNovaInterests(`${draft.text} ${(draft.hashtags || []).join(' ')}`);
      }
      if (Array.isArray(draft.hashtags) && draft.hashtags.length) applyNovaHashtags(draft.hashtags);
      if (draft.topic) applyNovaTopic(draft.topic);
      setNovaNotice(mode === 'hashtags'
        ? 'NovaAI suggested hashtags for this post.'
        : mode === 'improve'
          ? 'NovaAI rewrote your caption. Edit anything you want before publishing.'
          : 'NovaAI drafted your post. Review it, then publish when ready.');
    } catch (requestError) {
      setNovaError(requestError.message);
    } finally {
      setNovaBusy('');
    }
  };

  const addTopic = (t) => {
    const clean = String(t || '').trim();
    if (!clean || topics.includes(clean)) return;
    setTopics((current) => [...current, clean]);
    setCustomTopicInput('');
  };

  const removeTopic = (t) => {
    setTopics((current) => current.filter((item) => item !== t));
  };

  const addKeyword = (k) => {
    const clean = String(k || '').trim().toLowerCase();
    if (!clean || keywords.includes(clean)) return;
    setKeywords((current) => [...current, clean]);
    setCustomKeywordInput('');
  };

  const removeKeyword = (k) => {
    setKeywords((current) => current.filter((item) => item !== k));
  };

  const appendHashtag = (tag) => {
    const clean = tag.replace(/^#+/, '').trim().toLowerCase();
    if (!clean) return;
    const existing = hashtagInput.split(/[\s,]+/).map((t) => t.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean);
    if (!existing.includes(clean)) {
      setHashtagInput([...existing, clean].join(', '));
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!caption.trim() && media.length === 0) {
      setError('Write a caption or add media before publishing.');
      return;
    }
    if (destination === 'community' && !communityId) {
      setError('Choose a community before publishing there.');
      return;
    }
    if (visibility === 'premium' && !canMonetize) {
      setError('Finish Flutterwave payout setup and payment configuration in Settings before monetizing posts.');
      return;
    }

    setIsPublishing(true);
    setError('');
    try {
      // Reuse successful uploads if publishing needs to be retried after a network error.
      const uploadedAttachments = [...media];
      for (let index = 0; index < uploadedAttachments.length; index += 1) {
        let attachment = { ...uploadedAttachments[index] };
        let uploaded = attachment.uploaded;
        if (!uploaded?.url) {
          const mediaUpload = await uploadMedia(attachment.file);
          uploaded = { type: mediaUpload.type, url: mediaUpload.url };
          attachment = { ...attachment, uploaded };
          uploadedAttachments[index] = attachment;
          setMedia([...uploadedAttachments]);
        }
        let thumbnailUrl = uploaded.thumbnailUrl || null;
        if (attachment.thumbnail?.file && !attachment.thumbnail.uploadedUrl) {
          const thumbnailUpload = await uploadMedia(attachment.thumbnail.file);
          attachment = { ...attachment, thumbnail: { ...attachment.thumbnail, uploadedUrl: thumbnailUpload.url } };
          thumbnailUrl = thumbnailUpload.url;
        } else if (attachment.thumbnail?.uploadedUrl) {
          thumbnailUrl = attachment.thumbnail.uploadedUrl;
        }
        uploadedAttachments[index] = {
          ...attachment,
          uploaded: { ...uploaded, ...(thumbnailUrl ? { thumbnailUrl } : {}) },
        };
        setMedia([...uploadedAttachments]);
      }

      const result = await apiRequest('/posts', {
        method: 'POST',
        body: {
          text: caption.trim(),
          category: topic || null,
          topics,
          keywords,
          audienceSignals: audiences,
          hashtags,
          targetInterests,
          communityId: destination === 'community' ? Number(communityId) : null,
          media: uploadedAttachments.map((attachment) => attachment.uploaded),
          visibility,
          ...(visibility === 'premium' ? { priceAmount: PREMIUM_POST_PRICE_NGN } : {}),
        },
      });

      media.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        if (item.thumbnail?.previewUrl) URL.revokeObjectURL(item.thumbnail.previewUrl);
      });
      setMedia([]);
      setCaption('');
      onPublished?.(result.post);
      navigate('/home');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const previewPicture = profile?.picture;
  const canPublish = Boolean(caption.trim() || media.length) && !isPublishing;

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link to="/home" aria-label="Back to Home" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
            <i className="fa-solid fa-arrow-left" />
          </Link>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Advanced content composer</h1>
            <p className="text-xs text-slate-500">Create and preview a QuickChat post</p>
          </div>
        </div>
        <button form="advanced-composer-form" type="submit" disabled={!canPublish} className="rounded-full bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      </header>

      <form id="advanced-composer-form" onSubmit={publish} className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:p-6">
        <section className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
                  <i className="fa-solid fa-wand-magic-sparkles text-sm" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">NovaAI Post Assistant</h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Pick a prompt template or write an idea — Nova drafts the post, hashtags, and topic for you.</p>
                </div>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${novaStatus?.available ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {novaStatus?.available ? '✨ Nova LLM' : '✨ Nova Engine'}
              </span>
            </div>

            {/* Quick Inspiration Templates */}
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick post starters:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  { label: '🚀 Milestone', idea: 'Celebrating a huge milestone today: just launched our newest update and hit an incredible goal with the community!', tone: 'bold' },
                  { label: '💡 3 Lessons', idea: 'Here are 3 critical lessons I learned the hard way recently that completely transformed how I work.', tone: 'inspirational' },
                  { label: '❓ Discussion', idea: 'Quick question for the community: what is the single biggest challenge you are facing right now with your projects?', tone: 'friendly' },
                  { label: '🛠️ Behind the Scenes', idea: 'A candid behind-the-scenes look at what I have been building this week and why we made this choice.', tone: 'playful' },
                  { label: '🌟 Motivation', idea: 'A timely reminder for anyone working towards their dreams today: consistency beats intensity every time.', tone: 'inspirational' },
                ].map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => {
                      setNovaIdea(tpl.idea);
                      setNovaTone(tpl.tone);
                    }}
                    className="rounded-lg border border-indigo-100 bg-white/80 px-2 py-1 text-[11px] font-medium text-indigo-900 transition hover:bg-indigo-50 hover:border-indigo-200"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <label htmlFor="nova-idea" className="sr-only">Your post idea</label>
            <textarea
              id="nova-idea"
              value={novaIdea}
              onChange={(event) => setNovaIdea(event.target.value.slice(0, 600))}
              rows={2}
              placeholder="Your idea… e.g. “I shipped my first design system today and learned three things”"
              className="mt-3 w-full resize-y rounded-xl border border-indigo-100 bg-white/90 p-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[['friendly', 'Friendly'], ['bold', 'Bold'], ['professional', 'Professional'], ['playful', 'Playful'], ['inspirational', 'Inspiring']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={novaTone === value}
                  onClick={() => setNovaTone(value)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${novaTone === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
              <span className="mx-1 hidden w-px bg-slate-200 sm:block" />
              {[['short', 'Short'], ['standard', 'Standard'], ['long', 'Long']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={novaLength === value}
                  onClick={() => setNovaLength(value)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${novaLength === value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runNova('draft')}
                disabled={Boolean(novaBusy) || isPublishing}
                className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {novaBusy === 'draft' ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-wand-magic-sparkles" />}
                Draft with Nova
              </button>
              <button
                type="button"
                onClick={() => runNova('improve')}
                disabled={Boolean(novaBusy) || isPublishing || !caption.trim()}
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {novaBusy === 'improve' ? 'Improving…' : 'Improve caption'}
              </button>
              <button
                type="button"
                onClick={() => runNova('hashtags')}
                disabled={Boolean(novaBusy) || isPublishing || !caption.trim()}
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {novaBusy === 'hashtags' ? 'Finding…' : 'Suggest hashtags'}
              </button>
            </div>

            {novaStatus && !novaStatus.available && (
              <p className="mt-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100/60 px-2.5 py-2 text-[11px] leading-4 text-indigo-900">
                <i className="fa-solid fa-sparkles mr-1.5 text-indigo-600" />
                Nova Smart Engine is active and ready to draft, polish, and hashtag your posts.
              </p>
            )}
            {novaError && <p className="mt-2.5 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700" role="alert">{novaError}</p>}
            {novaNotice && <p className="mt-2.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-4 text-emerald-800" role="status">{novaNotice}</p>}
            <p className="mt-2 text-[10px] leading-4 text-slate-400">NovaAI writes a draft only — nothing is published until you press Publish.</p>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={profile?.fullName} picture={previewPicture} size={42} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{profile?.fullName || 'Your account'}</p>
                <p className="truncate text-xs text-slate-500">{profile?.handle || 'Public post'}</p>
              </div>
            </div>
            <label htmlFor="advanced-caption" className="mb-2 block text-sm font-bold text-slate-900">Caption</label>
            <textarea
              id="advanced-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value.slice(0, MAX_CAPTION_LENGTH))}
              maxLength={MAX_CAPTION_LENGTH}
              rows={8}
              placeholder="Share what's on your mind. Add hashtags or mentions in your caption."
              className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-2 flex justify-end text-xs text-slate-500">{caption.length.toLocaleString()} / {MAX_CAPTION_LENGTH.toLocaleString()}</div>
          </div>

          {/* Content Optimization & Classification System */}
          <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <i className="fa-solid fa-wand-magic-sparkles text-xs" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Content Optimization & Classification</h2>
                  <p className="text-[11px] text-slate-500">Connected to QuickChat recommendation and discovery engine</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => runContentAnalysis(caption)}
                disabled={isAnalyzing || !caption.trim()}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                <i className={`fa-solid ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-bolt'} text-[11px]`} />
                {isAnalyzing ? 'Analyzing…' : 'Analyze Post'}
              </button>
            </div>

            {/* Readability & Structure Analysis */}
            {optimization && (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Optimization & Readability</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    {optimization.score}/100 · {optimization.readability}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${optimization.score}%` }}
                  />
                </div>
                {optimization.tips?.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {optimization.tips.map((tip, idx) => (
                      <p key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                        <i className="fa-solid fa-lightbulb mt-0.5 text-amber-500 text-[10px]" />
                        <span>{tip.message}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* A. Suggested & Approved Topics */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Approved Topics for Recommendation Engine</label>
                <span className="text-[10px] text-slate-500">{topics.length} added</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 min-h-[30px] p-2 rounded-xl border border-slate-200 bg-white">
                {topics.length === 0 && <span className="text-xs text-slate-400">No topics added yet. Choose from suggestions below or type a custom one.</span>}
                {topics.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                    {t}
                    <button type="button" onClick={() => removeTopic(t)} className="hover:text-red-600 ml-1">
                      <i className="fa-solid fa-xmark text-[10px]" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Topic suggestions */}
              {suggestedTopics.length > 0 && (
                <div className="mt-2">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Suggested Topics:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {suggestedTopics.filter((t) => !topics.includes(t)).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTopic(t)}
                        className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        <i className="fa-solid fa-plus mr-1 text-[9px]" />
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Custom Topic */}
              <div className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  value={customTopicInput}
                  onChange={(e) => setCustomTopicInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(customTopicInput); } }}
                  placeholder="Add custom topic (e.g. Cloud Computing)"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => addTopic(customTopicInput)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
                >
                  Add
                </button>
              </div>
            </div>

            {/* D. Extracted Keywords */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Extracted Keywords</label>
                <span className="text-[10px] text-slate-500">Helps search & candidate retrieval</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-white min-h-[30px]">
                {keywords.length === 0 && <span className="text-xs text-slate-400">Keywords will be extracted automatically from your caption.</span>}
                {keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {kw}
                    <button type="button" onClick={() => removeKeyword(kw)} className="hover:text-red-600 ml-0.5">
                      <i className="fa-solid fa-xmark text-[9px]" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  value={customKeywordInput}
                  onChange={(e) => setCustomKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(customKeywordInput); } }}
                  placeholder="Add custom keyword"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => addKeyword(customKeywordInput)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
                >
                  Add
                </button>
              </div>
            </div>

            {/* E. Audience Recommendations */}
            {audiences.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-800">Audience Recommendations</label>
                <p className="text-[11px] text-slate-500">Suggested audience segments that will benefit from this post</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {audiences.map((aud, idx) => (
                    <span key={idx} className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
                      <i className="fa-solid fa-users mr-1 text-[10px] text-purple-600" />
                      {aud}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* F. Community Recommendations */}
            {suggestedCommunities.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-800">Recommended QuickChat Communities</label>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestedCommunities.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-white">
                      <div className="min-w-0 pr-2">
                        <span className="block truncate text-xs font-bold text-slate-900">{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.category || 'Community'} · {c.members} members</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDestination('community');
                          setCommunityId(String(c.id));
                        }}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${
                          destination === 'community' && String(communityId) === String(c.id)
                            ? 'bg-blue-700 text-white'
                            : 'border border-blue-300 text-blue-700 hover:bg-blue-50'
                        }`}
                      >
                        {destination === 'community' && String(communityId) === String(c.id) ? 'Selected' : 'Share Here'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. Hashtag Recommendations */}
            {suggestedHashtags.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-800">Suggested Hashtags</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {suggestedHashtags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => appendHashtag(tag)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      <i className="fa-solid fa-hashtag mr-0.5 text-[9px]" />
                      {tag.replace(/^#+/, '')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Primary Category & Manual Hashtags</h2>
            <label htmlFor="post-topic" className="mt-3 block text-xs font-bold text-slate-600">Category</label>
            <select id="post-topic" value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600">
              <option value="">Choose a primary category</option>
              {INTEREST_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <label htmlFor="post-hashtags" className="mt-3 block text-xs font-bold text-slate-600">Hashtags</label>
            <input id="post-hashtags" value={hashtagInput} onChange={(event) => setHashtagInput(event.target.value)} placeholder="creators, quickchat, webdev" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-600" />
            <p className="mt-1 text-[11px] text-slate-500">Add up to ten tags separated by spaces or commas. {hashtags.map((tag) => `#${tag}`).join(' ')}</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Audience interests</h2>
            <p className="mt-1 text-xs text-slate-500">Choose the interests you want this post to reach. The feed algorithm uses these when recommending your post.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(([key, label]) => {
                const selected = targetInterests.includes(key);
                const atLimit = !selected && targetInterests.length >= 12;
                return <button key={key} type="button" aria-pressed={selected} disabled={atLimit || isPublishing} onClick={() => setTargetInterests((current) => selected ? current.filter((interest) => interest !== key) : [...current, key])} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-40`}>{selected && <i className="fa-solid fa-check mr-1.5" />}{label}</button>;
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{targetInterests.length} of 12 selected</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Where should this post appear?</h2>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={isPublishing} onClick={() => setDestination('home')} className={`rounded-full px-4 py-2 text-xs font-bold ${destination === 'home' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Home feed</button>
              <button type="button" disabled={isPublishing} onClick={() => setDestination('community')} className={`rounded-full px-4 py-2 text-xs font-bold ${destination === 'community' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Community feed</button>
            </div>
            {destination === 'community' && (communities.length > 0
              ? <label className="mt-3 block text-xs font-bold text-slate-600">Choose a joined community
                <select value={communityId} onChange={(event) => setCommunityId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-600">
                  <option value="">Select a community</option>
                  {communities.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}
                </select>
              </label>
              : <p className="mt-3 text-xs text-slate-500">Join a community before posting there. <Link to="/communities" className="font-bold text-blue-700">Find communities</Link></p>)}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Post access</h2>
            <p className="mt-1 text-xs text-slate-500">Choose who can read the full post. Paid access is available to real accounts after Flutterwave payout setup.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ['public', 'Everyone', 'Free and public'],
                ['fans', 'Fans only', 'Active 30-day fan pass'],
                ['premium', 'Monetize this post', '₦500 one-time unlock'],
              ].map(([value, label, detail]) => <button key={value} type="button" disabled={isPublishing || (value !== 'public' && profile?.isAutomated) || (value === 'premium' && !canMonetize)} onClick={() => setVisibility(value)} className={`rounded-xl border p-3 text-left ${visibility === value ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-50`}><span className="block text-xs font-bold text-slate-900">{label}</span><span className="mt-1 block text-[10px] text-slate-500">{detail}</span></button>)}
            </div>
            {visibility === 'premium' && <p className="mt-3 text-xs leading-5 text-slate-600">Readers pay ₦500 to unlock this post. QuickChat keeps ₦50 (10%), leaving ₦450 before Flutterwave processing fees.</p>}
            {!canMonetize && !profile?.isAutomated && <p className="mt-3 text-xs text-slate-500">To monetize posts, finish Flutterwave payout setup and payment configuration in <Link to="/settings" className="font-bold text-blue-700">Settings</Link>.</p>}
            {visibility === 'fans' && <p className="mt-3 text-xs text-slate-600">Fans buy a 30-day pass for ₦{profile?.creatorMembershipPrice || '3,000'}. <Link to="/settings" className="font-bold text-blue-700">Manage paid fans</Link></p>}
            {profile?.isAutomated && <p className="mt-3 text-xs text-slate-500">Automated accounts can publish public posts only.</p>}
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center gap-2"><i className="fa-solid fa-magnifying-glass-chart text-blue-700" /><h2 className="text-sm font-bold text-slate-900">Search insights</h2></div>
            {insightError && <p className="mt-2 text-xs text-amber-700">Insights are temporarily unavailable.</p>}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-3"><p className="text-[11px] text-slate-500">Accounts with chosen interests</p><p className="mt-1 text-xl font-extrabold text-blue-700">{insights?.estimatedAudience?.toLocaleString() ?? '—'}</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-[11px] text-slate-500">Existing posts on this topic</p><p className="mt-1 text-xl font-extrabold text-blue-700">{insights?.topicPostCount?.toLocaleString() ?? '—'}</p></div>
            </div>
            {hashtags.length > 0 && <div className="mt-3 space-y-1">{hashtags.map((tag) => {
              const insight = insights?.hashtags?.find((item) => item.tag === tag);
              return <p key={tag} className="flex justify-between text-xs text-slate-600"><span>#{tag}</span><span>{insight ? `${insight.postCount} matching posts` : 'Searching…'}</span></p>;
            })}</div>}
            <p className="mt-3 text-[10px] leading-4 text-slate-500">Audience is an estimate from account interests. Post counts show current public matches, not guaranteed views.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Your analytics</h2><span className="text-[11px] text-slate-500">Last 30 days</span></div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[[analytics?.recentPerformance?.posts, 'Posts'], [analytics?.recentPerformance?.likes, 'Likes'], [analytics?.recentPerformance?.replies, 'Replies'], [analytics?.recentPerformance?.reposts, 'Reposts']].map(([value, label]) => <div key={label} className="rounded-lg bg-slate-50 p-2"><p className="text-base font-extrabold text-slate-900">{Number(value || 0).toLocaleString()}</p><p className="text-[10px] text-slate-500">{label}</p></div>)}
            </div>
            {analytics?.topics?.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{analytics.topics.map((item) => <div key={item.topic} className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{item.topic}</span><span className="whitespace-nowrap text-slate-500">{item.posts} posts · {item.likes + item.replies + item.reposts} interactions</span></div>)}</div>}
            {analytics && analytics.topics?.length === 0 && <p className="mt-3 text-xs text-slate-500">Publish a post to see topic performance here.</p>}
            <p className="mt-2 text-[10px] text-slate-500">These are recorded interactions, not impression or reach counts.</p>
          </section>

          <div
            className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm transition-colors hover:border-blue-500 hover:bg-blue-50/40"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
          >
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700"><i className="fa-solid fa-cloud-arrow-up" /></div>
            <h2 className="text-sm font-bold text-slate-900">Add photos or videos</h2>
            <p className="mt-1 text-xs text-slate-500">Up to four files. Images up to 15 MB and videos up to 500 MB.</p>
            <button type="button" disabled={isPublishing} onClick={() => fileInputRef.current?.click()} className="mt-3 rounded-full border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Choose files</button>
            <input ref={fileInputRef} type="file" disabled={isPublishing} accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} className="hidden" />
          </div>

          {media.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Attachments</h2><span className="text-xs text-slate-500">{media.length} / {MAX_ATTACHMENTS}</span></div>
            <div className="grid grid-cols-2 gap-3">
              {media.map((item) => <div key={item.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {item.type === 'image'
                  ? <img src={item.previewUrl} alt={item.file.name} className="aspect-square w-full object-cover" />
                  : <video src={item.previewUrl} poster={item.thumbnail?.previewUrl || item.uploaded?.thumbnailUrl || undefined} controls className="aspect-square w-full object-cover" />}
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="truncate text-[11px] text-slate-600">{item.file.name}</span>
                  <button type="button" disabled={isPublishing} onClick={() => removeMedia(item)} aria-label={`Remove ${item.file.name}`} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><i className="fa-solid fa-xmark" /></button>
                </div>
                {item.type === 'video' && <label className="block cursor-pointer border-t border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-blue-700 hover:bg-blue-50">{item.thumbnail ? 'Change thumbnail' : 'Add thumbnail'}<input type="file" disabled={isPublishing} accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => { setVideoThumbnail(item, event.target.files?.[0]); event.target.value = ''; }} className="hidden" /></label>}
              </div>)}
            </div>
          </section>}

          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Post preview</h2><p className="mt-0.5 text-xs text-slate-500">This is how your post will appear in the feed.</p></div>
            <div className="p-4">
              <div className="mb-3 flex items-center gap-3">
                <Avatar name={profile?.fullName} picture={previewPicture} size={38} />
                <div><p className="text-sm font-bold text-slate-900">{profile?.fullName || 'Your account'}</p><p className="text-xs text-slate-500">{profile?.handle || '@you'} · now</p></div>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{caption || <span className="text-slate-400">Your caption preview will appear here.</span>}</p>
              {(topic || topics.length > 0 || hashtags.length > 0 || targetInterests.length > 0 || destination === 'community') && <div className="mt-2 flex flex-wrap gap-1.5">
                {topic && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{INTEREST_OPTIONS.find(([key]) => key === topic)?.[1] || topic}</span>}
                {topics.map((t) => <span key={t} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800"><i className="fa-solid fa-tag mr-1 text-[8px]" />{t}</span>)}
                {destination === 'community' && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700"><i className="fa-solid fa-users mr-1" />{communities.find((community) => String(community.id) === String(communityId))?.name || 'Community feed'}</span>}
                {hashtags.map((tag) => <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">#{tag}</span>)}
              </div>}
              {keywords.length > 0 && <p className="mt-1.5 text-[10px] text-slate-500">Keywords: {keywords.join(', ')}</p>}
              {audiences.length > 0 && <p className="mt-1 text-[10px] text-purple-700">Recommended Audience: {audiences.join(', ')}</p>}
              {targetInterests.length > 0 && <p className="mt-1 text-[10px] text-slate-500">Target Interests: {targetInterests.map((interest) => INTEREST_OPTIONS.find(([key]) => key === interest)?.[1] || interest).join(', ')}</p>}
              {media.length > 0 && <div className="mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
                {media.map((item) => item.type === 'image'
                  ? <img key={item.id} src={item.previewUrl} alt="Post preview" className="aspect-square w-full object-cover" />
                  : <video key={item.id} src={item.previewUrl} poster={item.thumbnail?.previewUrl || item.uploaded?.thumbnailUrl || undefined} controls className="aspect-square w-full object-cover" />)}
              </div>}
              <div className="mt-4 flex items-center gap-5 border-t border-slate-100 pt-3 text-xs text-slate-400"><span><i className="fa-regular fa-comment mr-1.5" />Reply</span><span><i className="fa-regular fa-heart mr-1.5" />Like</span><span><i className="fa-solid fa-retweet mr-1.5" />Repost</span></div>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}

async function deleteUploadedFile(url) {
  try {
    const filename = new URL(url).pathname.split('/').pop();
    await apiRequest(`/media/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  } catch (_deleteError) {
    // Cleanup is best-effort; it should not block continuing to edit a post.
  }
}
