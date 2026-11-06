import React, { useEffect, useRef, useState } from 'react';

// Native ad slot for the feeds. The network script renders into whatever element it
// finds, so it runs inside a sandboxed iframe with a real document URL. That keeps the
// ad out of QuickChat's React DOM while still letting the loader call document.write.
const FORMAT = {
  desktop: { width: 728, height: 90 },
  mobile: { width: 320, height: 100 },
};

const buildDocument = ({ width, height }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="https://pl29405662.profitableratecpmnetwork.com/87/9e/f1/" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; min-height: ${height}px; }
  iframe, img, ins, div { max-width: 100%; }
</style>
</head>
<body>
<div id="ad-container" style="width:${width}px;min-height:${height}px;"></div>
<script src="https://pl29405662.profitableratecpmnetwork.com/87/9e/f1/879ef15100fef1acbdd86864e2edab33.js" async></script>
</body>
</html>`;

export default function AdFeedSlot({ className = '' }) {
  const wrapperRef = useRef(null);
  const iframeRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [format, setFormat] = useState(() => {
    if (typeof window === 'undefined') return FORMAT.mobile;
    return window.innerWidth >= 768 ? FORMAT.desktop : FORMAT.mobile;
  });
  const srcDoc = buildDocument(format);

  // Only mount the ad when it scrolls near the viewport, so the feed does not fire
  // several ad requests on one page load.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => {
      const next = window.innerWidth >= 768 ? FORMAT.desktop : FORMAT.mobile;
      setFormat((current) => (current.width === next.width ? current : next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ads can misreport their own height; fit the iframe to the rendered creative
  // (same-origin via srcDoc) and fall back to the reserved slot height.
  const fitHeight = () => {
    const frame = iframeRef.current;
    try {
      const body = frame?.contentWindow?.document?.body;
      if (body && body.scrollHeight) frame.style.height = `${Math.max(format.height, Math.min(body.scrollHeight, 480))}px`;
    } catch (_error) {
      // Cross-origin creative: keep the reserved height.
    }
  };

  return (
    <section
      ref={wrapperRef}
      aria-label="Sponsored"
      className={`border-b border-slate-100 bg-white px-4 py-3 ${className}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sponsored</span>
        <span className="text-[10px] text-slate-400">Ads keep QuickChat running</span>
      </div>
      <div className="flex w-full justify-center overflow-hidden rounded-xl bg-slate-50">
        {visible ? (
          <iframe
            ref={iframeRef}
            title="Sponsored advertisement"
            srcDoc={srcDoc}
            onLoad={fitHeight}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            referrerPolicy="no-referrer-when-downgrade"
            style={{ width: '100%', height: format.height, border: 0, display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: format.height }} className="grid place-items-center text-[10px] text-slate-300">
            Advertisement
          </div>
        )}
      </div>
    </section>
  );
}
