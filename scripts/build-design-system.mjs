import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const assetsDir = path.join(root, 'promo-video', 'assets');
const designDir = path.join(root, 'design');

const logoBase64 = fs.readFileSync(path.join(assetsDir, 'quickchat-logo.png')).toString('base64');
const logoDataUri = `data:image/png;base64,${logoBase64}`;

const brandBookHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>QuickChat — Brand Book</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --primary:      #2464F4;
    --secondary:    #D4FF00;
    --tertiary:     #65DFF5;
    --bg:           #071326;
    --surface:      #0C1D3A;
    --surface-elev: #122648;
    --border:       rgba(101, 223, 245, 0.22);
    --border-light: rgba(255, 255, 255, 0.12);
    --text:         #F5F8FF;
    --muted:        #A9B8D2;
    --accent-coral: #FF795F;
    --display-font: 'Syne', sans-serif;
    --editorial-font: 'Fraunces', serif;
    --body-font:    'DM Sans', sans-serif;
    --mono-font:    'Space Mono', monospace;
  }

  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .page {
    width: 210mm; height: 297mm;
    background: radial-gradient(circle at 85% 12%, #14376c 0%, #071326 65%);
    color: var(--text);
    font-family: var(--body-font);
    padding: 16mm 16mm 12mm;
    display: flex; flex-direction: column; gap: 6.5mm;
    position: relative; overflow: hidden;
  }

  .page::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.18;
    background-image: linear-gradient(rgba(217, 231, 255, 0.08) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(217, 231, 255, 0.08) 1px, transparent 1px);
    background-size: 12mm 12mm;
  }

  /* HEAD */
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10mm; position: relative; z-index: 2; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; box-shadow: 0 0 20px rgba(36, 100, 244, 0.4); }
  .brand h1 { margin: 0; font-family: var(--display-font); font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: var(--text); }
  .brand h1 em { font-family: var(--editorial-font); font-style: italic; color: var(--secondary); font-weight: 600; margin-left: 2px; }
  .brand .sub { margin: 2px 0 0; font-size: 9.5px; color: var(--tertiary); font-family: var(--mono-font); letter-spacing: 1.8px; text-transform: uppercase; }
  .brand-meta { text-align: right; font-family: var(--mono-font); font-size: 8.5px; color: var(--muted); letter-spacing: 1.2px; text-transform: uppercase; line-height: 1.5; }
  .brand-meta .tag { color: var(--secondary); font-weight: 700; }

  .section-label { font-family: var(--mono-font); font-size: 9.5px; letter-spacing: 1.8px; color: var(--tertiary); text-transform: uppercase; margin-bottom: 3.5mm; display: flex; align-items: center; gap: 8px; }
  .section-label::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  /* COLORS */
  .colors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
  .swatch { border: 1px solid var(--border-light); border-radius: 9px; overflow: hidden; background: var(--surface); box-shadow: 0 8px 18px rgba(0,0,0,0.3); }
  .swatch .fill { height: 21mm; position: relative; }
  .swatch .fill-badge { position: absolute; right: 8px; bottom: 8px; padding: 3px 6px; border-radius: 5px; font-family: var(--mono-font); font-size: 7.5px; letter-spacing: 0.8px; background: rgba(0,0,0,0.45); color: #fff; }
  .swatch .meta { padding: 7px 9px; background: var(--surface); border-top: 1px solid rgba(255,255,255,0.06); }
  .swatch .tier { font-size: 11px; font-weight: 700; display: block; font-family: var(--display-font); }
  .swatch .hex { font-family: var(--mono-font); font-size: 9.5px; color: var(--muted); display: block; margin-top: 2px; }
  .swatch .use { font-size: 9px; color: var(--muted); line-height: 1.35; margin-top: 3px; display: block; }

  /* TWOCOL: TYPOGRAPHY + PRINCIPLES */
  .twocol { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 6mm; }
  .card { border: 1px solid var(--border-light); border-radius: 9px; padding: 5mm 6mm; background: var(--surface); box-shadow: 0 8px 18px rgba(0,0,0,0.25); }

  .type-display { font-family: var(--display-font); font-size: 24px; font-weight: 800; letter-spacing: -0.04em; color: var(--text); line-height: 1.08; margin: 0; }
  .type-display em { font-family: var(--editorial-font); font-style: italic; color: var(--secondary); font-weight: 600; }
  .type-body { font-size: 10px; color: var(--muted); line-height: 1.45; margin: 2.5mm 0 0; }
  .type-mono { font-family: var(--mono-font); font-size: 8.5px; color: var(--tertiary); letter-spacing: 1px; text-transform: uppercase; margin-top: 2.5mm; display: block; }

  .principles ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2.5mm; }
  .principles li { font-size: 9.5px; color: #cbd7ec; line-height: 1.4; position: relative; padding-left: 14px; }
  .principles li::before { content: "✦"; position: absolute; left: 0; top: 0; color: var(--secondary); font-size: 9px; }
  .principles li strong { color: #fff; font-weight: 600; }

  /* PRODUCTS / ECOSYSTEM */
  .products { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3.5mm; }
  .product { border: 1px solid var(--border-light); border-radius: 8px; padding: 3.5mm 2.5mm; background: var(--surface); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; }
  .product .dot { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 10px; }
  .product .name { font-size: 9.5px; font-weight: 700; font-family: var(--display-font); color: #fff; margin-top: 2px; }
  .product .hex { font-family: var(--mono-font); font-size: 7.5px; color: var(--tertiary); }
  .product .role { font-size: 8px; color: var(--muted); line-height: 1.25; }

  /* WORDMARKS */
  .wordmarks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
  .wm { border: 1px solid var(--border-light); border-radius: 9px; padding: 4.5mm 5mm; background: var(--surface); display: flex; flex-direction: column; gap: 4px; min-height: 25mm; justify-content: center; }
  .wm .lockup { display: flex; align-items: center; gap: 9px; }
  .wm .lockup img { width: 26px; height: 26px; border-radius: 7px; }
  .wm .name { font-weight: 800; font-size: 16px; letter-spacing: 2.5px; color: var(--text); text-transform: uppercase; font-family: var(--display-font); }
  .wm .name .lo { font-weight: 400; color: var(--muted); font-family: var(--display-font); }
  .wm .tag { font-size: 8.5px; color: var(--muted); line-height: 1.35; margin: 2px 0 0; }
  .wm .mono { font-family: var(--mono-font); font-size: 7.5px; color: var(--tertiary); letter-spacing: 1px; text-transform: uppercase; margin-top: auto; display: block; }

  /* FOOT */
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 3.5mm; border-top: 1px solid var(--border-light); font-family: var(--mono-font); font-size: 8px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; }
  .foot b { color: var(--secondary); font-weight: normal; }
</style>
</head>
<body>
<div class="page">

  <!-- HEAD -->
  <div class="head">
    <div class="brand">
      <img src="${logoDataUri}" alt="QuickChat Mark">
      <div>
        <h1>QuickChat <em>Brand Book</em></h1>
        <p class="sub">PEOPLE · INTERESTS · CONVERSATION</p>
      </div>
    </div>
    <div class="brand-meta">
      QUICKCHAT DESIGN SYSTEM · V1.0<br/>
      <span class="tag">FIND YOUR PEOPLE · KEEP THE CONVERSATION GOING</span>
    </div>
  </div>

  <!-- COLOR HIERARCHY -->
  <div>
    <div class="section-label">Color Hierarchy</div>
    <div class="colors">
      <div class="swatch">
        <div class="fill" style="background:var(--primary);"><span class="fill-badge">PRIMARY</span></div>
        <div class="meta">
          <span class="tier" style="color:#5c90ff;">Electric Blue</span>
          <span class="hex">#2464F4</span>
          <span class="use">Brand anchor, primary CTAs, active focus states, verified badges</span>
        </div>
      </div>
      <div class="swatch">
        <div class="fill" style="background:var(--secondary);"><span class="fill-badge" style="color:#000;">ACCENT HIGH</span></div>
        <div class="meta">
          <span class="tier" style="color:var(--secondary);">Neon Lime</span>
          <span class="hex">#D4FF00</span>
          <span class="use">Editorial punchlines, high-priority notification dots, pricing highlights</span>
        </div>
      </div>
      <div class="swatch">
        <div class="fill" style="background:var(--tertiary);"><span class="fill-badge" style="color:#000;">ACCENT DATA</span></div>
        <div class="meta">
          <span class="tier" style="color:var(--tertiary);">Vivid Cyan</span>
          <span class="hex">#65DFF5</span>
          <span class="use">Monospace kickers, orbital graph rings, data chips, online indicators</span>
        </div>
      </div>
    </div>
  </div>

  <!-- TYPOGRAPHY + PRINCIPLES -->
  <div class="twocol">
    <div>
      <div class="section-label">Typography System</div>
      <div class="card">
        <p class="type-display">Find your people.<br/><em>Keep talking.</em></p>
        <p class="type-body"><strong>Syne (800)</strong> geometric display tracking -0.04em paired with <strong>Fraunces</strong> editorial italic for emotive emphasis. <strong>DM Sans</strong> for clear mobile-first body copy.</p>
        <span class="type-mono">SPACE MONO · KICKERS · 01 / 08 · DATA TAGS</span>
      </div>
    </div>
    <div>
      <div class="section-label">Core Design Principles</div>
      <div class="card principles">
        <ul>
          <li><strong>Connection Over Consumption</strong> — Content leads directly to creators and conversations, avoiding passive doomscrolling.</li>
          <li><strong>One Continuous Social Home</strong> — Zero walls between discovering ideas, meeting voices, and jumping into private DMs.</li>
          <li><strong>Direct Creator Empowerment</strong> — Native paid posts from ₦500 and 30-day passes from ₦3,000 with a transparent 10% fee.</li>
          <li><strong>Autonomous Community Circles</strong> — Dedicated hubs where shared passions become thriving ongoing forums.</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- PRODUCT ECOSYSTEM -->
  <div>
    <div class="section-label">Product Family & Ecosystem</div>
    <div class="products">
      <div class="product">
        <div class="dot" style="background:rgba(36, 100, 244, 0.2); color:#6ba1ff; border:1px solid #2464f4;">▤</div>
        <div class="name">Feed (Home)</div>
        <div class="hex">#2464F4</div>
        <div class="role">Personal circle & followed voices</div>
      </div>
      <div class="product">
        <div class="dot" style="background:rgba(101, 223, 245, 0.18); color:#65dff5; border:1px solid #65dff5;">◉</div>
        <div class="name">Explore</div>
        <div class="hex">#65DFF5</div>
        <div class="role">19 Interest topics & trending ideas</div>
      </div>
      <div class="product">
        <div class="dot" style="background:rgba(50, 212, 161, 0.2); color:#32d4a1; border:1px solid #32d4a1;">✉</div>
        <div class="name">Messages</div>
        <div class="hex">#32D4A1</div>
        <div class="role">Real-time chats & typing cues</div>
      </div>
      <div class="product">
        <div class="dot" style="background:rgba(212, 255, 0, 0.18); color:#d4ff00; border:1px solid #d4ff00;">✳</div>
        <div class="name">Circles</div>
        <div class="hex">#D4FF00</div>
        <div class="role">Topic hubs & niche communities</div>
      </div>
      <div class="product">
        <div class="dot" style="background:rgba(255, 121, 95, 0.2); color:#ff795f; border:1px solid #ff795f;">▶</div>
        <div class="name">Videos</div>
        <div class="hex">#FF795F</div>
        <div class="role">Vertical video reels & engagement</div>
      </div>
      <div class="product">
        <div class="dot" style="background:rgba(195, 133, 255, 0.2); color:#c385ff; border:1px solid #c385ff;">✦</div>
        <div class="name">Monetize</div>
        <div class="hex">#C385FF</div>
        <div class="role">Premium pay-per-post & fan passes</div>
      </div>
    </div>
  </div>

  <!-- WORDMARKS -->
  <div>
    <div class="section-label">Brand Wordmark Patterns</div>
    <div class="wordmarks">
      <div class="wm">
        <div class="lockup">
          <img src="${logoDataUri}" alt="">
          <span class="name">QUICKCHAT</span>
        </div>
        <p class="tag">Standard brand mark paired with bold geometric caps.</p>
        <span class="mono">Mark + Wordmark Lockup</span>
      </div>
      <div class="wm">
        <div class="lockup">
          <span class="name">QUICK<span class="lo">CHAT</span></span>
        </div>
        <p class="tag">Dual-weight geometric treatment for clean umbrella application.</p>
        <span class="mono">Split-Weight Lockup</span>
      </div>
      <div class="wm">
        <div class="lockup">
          <span class="name" style="color:var(--text);">QUICK<span style="color:var(--secondary);">CHAT</span></span>
        </div>
        <p class="tag">High-visibility accent lockup celebrating the conversational core.</p>
        <span class="mono">Accent Wordmark Lockup</span>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="foot">
    <span>QuickChat Design System <b>·</b> Autonomous Brand Specification</span>
    <span>design/brand-book-a4.pdf · 2026</span>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(designDir, 'brand-book-a4.html'), brandBookHtml, 'utf8');
console.log('Wrote design/brand-book-a4.html');

// Try rendering PDF with Microsoft Edge if present
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (fs.existsSync(edgePath)) {
  try {
    const htmlPath = path.resolve(designDir, 'brand-book-a4.html');
    const pdfPath = path.resolve(designDir, 'brand-book-a4.pdf');
    const cmd = `"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\\\/g, '/')}"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('Successfully rendered design/brand-book-a4.pdf');
  } catch (err) {
    console.warn('PDF generation notice:', err.message);
  }
}
