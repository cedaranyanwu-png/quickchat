import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assetsDir = path.join(root, 'promo-video', 'assets');
const designDir = path.join(root, 'design');

const logoBase64 = fs.readFileSync(path.join(assetsDir, 'quickchat-logo.png')).toString('base64');
const logoDataUri = `data:image/png;base64,${logoBase64}`;

const designSystemHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QuickChat — Design System Specification</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --primary:       #2464F4;
    --primary-glow:  rgba(36, 100, 244, 0.4);
    --secondary:     #D4FF00;
    --secondary-glow:rgba(212, 255, 0, 0.35);
    --tertiary:      #65DFF5;
    --tertiary-glow: rgba(101, 223, 245, 0.3);
    --coral:         #FF795F;
    --success:       #32D4A1;
    --purple:        #C385FF;
    --bg:            #071326;
    --bg-alt:        #0A172E;
    --surface:       #0D1D3A;
    --surface-card:  #112548;
    --surface-light: #F8FAFF;
    --border:        rgba(101, 223, 245, 0.2);
    --border-subtle: rgba(255, 255, 255, 0.08);
    --border-focus:  #2464F4;
    --text:          #F5F8FF;
    --text-muted:    #A9B8D2;
    --text-dark:     #12223D;
    --display-font:  'Syne', sans-serif;
    --serif-font:    'Fraunces', serif;
    --body-font:     'DM Sans', sans-serif;
    --mono-font:     'Space Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--body-font);
    line-height: 1.6;
    padding-bottom: 80px;
    background-image: 
      radial-gradient(circle at 90% 10%, rgba(36, 100, 244, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 10% 40%, rgba(101, 223, 245, 0.08) 0%, transparent 40%),
      linear-gradient(rgba(217, 231, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(217, 231, 255, 0.03) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 48px 48px, 48px 48px;
  }

  .container { max-width: 1200px; margin: 0 auto; padding: 0 32px; }

  /* HEADER */
  header.hero {
    padding: 72px 0 48px;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 56px;
    position: relative;
  }
  .brand-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; }
  .logo-lockup { display: flex; align-items: center; gap: 18px; }
  .logo-lockup img { width: 56px; height: 56px; border-radius: 14px; box-shadow: 0 0 25px var(--primary-glow); }
  .logo-lockup h1 { font-family: var(--display-font); font-size: 32px; font-weight: 800; letter-spacing: -0.03em; }
  .logo-lockup h1 span { color: var(--secondary); font-family: var(--serif-font); font-style: italic; }
  .logo-lockup p { font-family: var(--mono-font); font-size: 11px; color: var(--tertiary); letter-spacing: 2px; text-transform: uppercase; }
  
  .spec-meta { text-align: right; font-family: var(--mono-font); font-size: 11px; color: var(--text-muted); line-height: 1.7; }
  .spec-meta strong { color: var(--secondary); }

  .hero-summary { margin-top: 36px; max-width: 780px; }
  .hero-summary h2 { font-family: var(--display-font); font-size: 42px; font-weight: 800; line-height: 1.12; letter-spacing: -0.04em; margin-bottom: 16px; }
  .hero-summary h2 em { font-family: var(--serif-font); color: var(--secondary); font-style: italic; font-weight: 600; }
  .hero-summary p { font-size: 18px; color: var(--text-muted); line-height: 1.5; }

  /* SECTION STRUCTURE */
  section { margin-bottom: 72px; }
  .sec-heading { margin-bottom: 28px; }
  .kicker { font-family: var(--mono-font); font-size: 11px; letter-spacing: 2px; color: var(--tertiary); text-transform: uppercase; display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .kicker::before { content: "§"; color: var(--secondary); font-weight: bold; }
  .sec-heading h3 { font-family: var(--display-font); font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
  .sec-desc { color: var(--text-muted); font-size: 15px; margin-top: 4px; max-width: 720px; }

  /* COLOR GRID */
  .color-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
  .color-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3); transition: transform .2s, border-color .2s; }
  .color-card:hover { transform: translateY(-3px); border-color: var(--border); }
  .color-chip { height: 110px; position: relative; padding: 14px; display: flex; justify-content: flex-end; align-items: flex-start; }
  .color-chip span { background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); padding: 4px 10px; border-radius: 6px; font-family: var(--mono-font); font-size: 11px; color: #fff; letter-spacing: 1px; }
  .color-details { padding: 18px 20px; }
  .color-details h4 { font-family: var(--display-font); font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .color-details .hex { font-family: var(--mono-font); font-size: 13px; color: var(--tertiary); margin-bottom: 8px; }
  .color-details p { font-size: 13px; color: var(--text-muted); line-height: 1.45; }

  /* EXTENDED PALETTE ROW */
  .extended-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-top: 24px; }
  .ext-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; }
  .ext-dot { width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0; }
  .ext-card strong { display: block; font-size: 12px; font-weight: 700; }
  .ext-card span { font-family: var(--mono-font); font-size: 11px; color: var(--text-muted); }

  /* TYPOGRAPHY */
  .type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  @media (max-width: 860px) { .type-grid { grid-template-columns: 1fr; } }
  .type-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.25); }
  .type-badge { display: inline-block; font-family: var(--mono-font); font-size: 10px; letter-spacing: 1.5px; color: var(--secondary); text-transform: uppercase; background: rgba(212, 255, 0, 0.1); border: 1px solid rgba(212, 255, 0, 0.25); padding: 4px 10px; border-radius: 20px; margin-bottom: 18px; }
  .specimen-display { font-family: var(--display-font); font-size: 44px; font-weight: 800; line-height: 1.05; letter-spacing: -0.04em; margin-bottom: 12px; }
  .specimen-serif { font-family: var(--serif-font); font-size: 38px; font-style: italic; color: var(--secondary); margin-bottom: 16px; }
  .specimen-body { font-size: 16px; color: var(--text-muted); line-height: 1.6; margin-bottom: 18px; }
  .specimen-mono { font-family: var(--mono-font); font-size: 12px; color: var(--tertiary); letter-spacing: 1px; padding: 12px 16px; background: rgba(0,0,0,0.3); border-radius: 8px; border-left: 3px solid var(--tertiary); }

  /* PRINCIPLES */
  .principles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
  .principle-box { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 24px; position: relative; overflow: hidden; }
  .principle-box::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--primary), var(--tertiary)); }
  .p-num { font-family: var(--mono-font); font-size: 12px; color: var(--secondary); margin-bottom: 12px; font-weight: 700; }
  .principle-box h4 { font-family: var(--display-font); font-size: 18px; font-weight: 700; margin-bottom: 10px; color: #fff; }
  .principle-box p { font-size: 13.5px; color: var(--text-muted); line-height: 1.55; }

  /* COMPONENTS */
  .comp-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
  .comp-panel { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 24px; }
  .comp-panel h4 { font-family: var(--display-font); font-size: 16px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; }
  .comp-panel h4 span { font-family: var(--mono-font); font-size: 10px; color: var(--tertiary); text-transform: uppercase; }
  
  .btn-group { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .btn { display: inline-flex; align-items: center; gap: 10px; padding: 12px 22px; border-radius: 24px; font-family: var(--mono-font); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all .2s; border: 1px solid transparent; }
  .btn-primary { background: var(--primary); color: #fff; box-shadow: 0 4px 18px var(--primary-glow); }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 22px rgba(36, 100, 244, 0.6); }
  .btn-lime { background: var(--secondary); color: #071326; box-shadow: 0 4px 18px var(--secondary-glow); }
  .btn-outline { background: transparent; border-color: rgba(255, 255, 255, 0.25); color: #fff; }
  .btn-outline:hover { background: rgba(255, 255, 255, 0.08); border-color: var(--tertiary); }

  .badge-group { display: flex; flex-wrap: wrap; gap: 10px; }
  .pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 20px; font-family: var(--mono-font); font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #d5e0f3; }
  .pill.active { border-color: var(--tertiary); color: var(--tertiary); background: rgba(101, 223, 245, 0.08); }
  .pill.pulse i { width: 7px; height: 7px; border-radius: 50%; background: var(--secondary); box-shadow: 0 0 10px var(--secondary); }

  /* WORDMARKS */
  .wm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 800px) { .wm-grid { grid-template-columns: 1fr; } }
  .wm-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 24px; text-align: center; display: flex; flex-direction: column; justify-content: center; min-height: 150px; }
  .wm-card .lockup { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px; }
  .wm-card .lockup img { width: 36px; height: 36px; border-radius: 9px; }
  .wm-card .title { font-family: var(--display-font); font-size: 22px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; }
  .wm-card .sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .wm-card .tag { font-family: var(--mono-font); font-size: 9px; color: var(--tertiary); letter-spacing: 1px; text-transform: uppercase; margin-top: 14px; }

  /* FOOTER */
  footer { margin-top: 80px; padding-top: 32px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; font-family: var(--mono-font); font-size: 11px; color: var(--text-muted); flex-wrap: wrap; gap: 14px; }
  footer a { color: var(--tertiary); text-decoration: none; }
</style>
</head>
<body>

<div class="container">

  <!-- HEADER -->
  <header class="hero">
    <div class="brand-bar">
      <div class="logo-lockup">
        <img src="${logoDataUri}" alt="QuickChat Mark">
        <div>
          <h1>QuickChat <span>Design System</span></h1>
          <p>PEOPLE · INTERESTS · CONVERSATION</p>
        </div>
      </div>
      <div class="spec-meta">
        SPECIFICATION VERSION <strong>1.0.0</strong><br/>
        PALETTE: <strong>MIDNIGHT ELECTRIC / DUAL ACCENT</strong><br/>
        TARGET PLATFORM: <strong>DESKTOP & MOBILE SOCIAL SUITE</strong>
      </div>
    </div>

    <div class="hero-summary">
      <h2>A unified visual language for <em>genuine human connection.</em></h2>
      <p>QuickChat is designed around conversational clarity, interest-driven discovery, and friction-free creator support. This specification governs all design tokens, components, and narrative pitch decks.</p>
    </div>
  </header>

  <!-- 1. COLOR HIERARCHY -->
  <section id="colors">
    <div class="sec-heading">
      <span class="kicker">01 / PALETTE</span>
      <h3>Color Hierarchy</h3>
      <p class="sec-desc">A deep-space midnight canvas accented by Electric Blue focal anchors, vivid Cyan telemetry lines, and high-energy Neon Lime punch accents.</p>
    </div>

    <div class="color-grid">
      <div class="color-card">
        <div class="color-chip" style="background:#2464F4;"><span>PRIMARY</span></div>
        <div class="color-details">
          <h4>Electric Blue</h4>
          <div class="hex">#2464F4 · RGB(36, 100, 244)</div>
          <p>Primary brand anchor. Used for main action buttons, verified badges, active navigation items, and focused message threads.</p>
        </div>
      </div>

      <div class="color-card">
        <div class="color-chip" style="background:#D4FF00;"><span style="color:#000;">ACCENT HIGH</span></div>
        <div class="color-details">
          <h4>Neon Lime</h4>
          <div class="hex">#D4FF00 · RGB(212, 255, 0)</div>
          <p>High-contrast editorial accent. Highlights pricing milestones (₦500 / ₦3,000), key italic serif takeaways, and unread notification alerts.</p>
        </div>
      </div>

      <div class="color-card">
        <div class="color-chip" style="background:#65DFF5;"><span style="color:#000;">ACCENT DATA</span></div>
        <div class="color-details">
          <h4>Vivid Cyan</h4>
          <div class="hex">#65DFF5 · RGB(101, 223, 245)</div>
          <p>Data & telemetry accent. Used for orbital constellation lines, monospace kickers, active presence cues, and card border highlights.</p>
        </div>
      </div>
    </div>

    <div class="extended-row">
      <div class="ext-card">
        <div class="ext-dot" style="background:#071326; border:1px solid rgba(255,255,255,0.2);"></div>
        <div><strong>Midnight Navy</strong><span>#071326 · Stage</span></div>
      </div>
      <div class="ext-card">
        <div class="ext-dot" style="background:#0D1D3A;"></div>
        <div><strong>Deep Surface</strong><span>#0D1D3A · Cards</span></div>
      </div>
      <div class="ext-card">
        <div class="ext-dot" style="background:#FF795F;"></div>
        <div><strong>Sunset Coral</strong><span>#FF795F · Friction / Likes</span></div>
      </div>
      <div class="ext-card">
        <div class="ext-dot" style="background:#32D4A1;"></div>
        <div><strong>Emerald Live</strong><span>#32D4A1 · Online status</span></div>
      </div>
      <div class="ext-card">
        <div class="ext-dot" style="background:#C385FF;"></div>
        <div><strong>Royal Purple</strong><span>#C385FF · Creator perks</span></div>
      </div>
      <div class="ext-card">
        <div class="ext-dot" style="background:#F5F8FF;"></div>
        <div><strong>Bright Ice</strong><span>#F5F8FF · Text</span></div>
      </div>
    </div>
  </section>

  <!-- 2. TYPOGRAPHY SYSTEM -->
  <section id="typography">
    <div class="sec-heading">
      <span class="kicker">02 / TYPOGRAPHY</span>
      <h3>Typography Ladder</h3>
      <p class="sec-desc">Geometric confidence in display headlines contrasted with expressive editorial serifs and ultra-clean monospace metadata.</p>
    </div>

    <div class="type-grid">
      <div class="type-card">
        <span class="type-badge">DISPLAY & HERO HEADINGS</span>
        <div class="specimen-display">Find your people.</div>
        <div class="specimen-serif">Keep talking.</div>
        <p class="specimen-body"><strong>Syne (Weights 700, 800)</strong> provides bold, high-density geometric presence with tightened tracking (<code>-0.04em</code>). Paired with <strong>Fraunces (Weight 600, Italic)</strong> for emotive editorial emphasis.</p>
      </div>

      <div class="type-card">
        <span class="type-badge">BODY & DATA HIERARCHY</span>
        <p class="specimen-body" style="font-size: 18px; color: #fff;">QuickChat unifies topics, creators, and conversations in one home so connection happens naturally.</p>
        <p class="specimen-body"><strong>DM Sans (Weights 400, 500, 700)</strong> is selected for crystal-clear readability across all mobile and desktop viewports.</p>
        <div class="specimen-mono">SPACE MONO · 11PX / 13PX · UPPERCASE · TRACKING 0.12EM<br/>01 / POST · ₦500 PREMIUM · 10% PLATFORM FEE · @AMARA.CREATES</div>
      </div>
    </div>
  </section>

  <!-- 3. DESIGN PRINCIPLES -->
  <section id="principles">
    <div class="sec-heading">
      <span class="kicker">03 / PHILOSOPHY</span>
      <h3>Core Product Principles</h3>
      <p class="sec-desc">Four non-negotiable foundations that guide every layout, transition, and micro-interaction.</p>
    </div>

    <div class="principles-grid">
      <div class="principle-box">
        <div class="p-num">01 / PURPOSE</div>
        <h4>Connection Over Consumption</h4>
        <p>The platform never traps users in mindless endless feeds. Every post is an invitation to discover a thinker and start an authentic exchange.</p>
      </div>
      <div class="principle-box">
        <div class="p-num">02 / CONTINUITY</div>
        <h4>One Continuous Social Home</h4>
        <p>No artificial walls. You discover an insight on the feed, explore the creator's circle, and seamlessly carry the topic into a real-time message.</p>
      </div>
      <div class="principle-box">
        <div class="p-num">03 / CREATOR VALUE</div>
        <h4>Direct, Transparent Monetization</h4>
        <p>Creators own their economy through pay-per-post (from ₦500) and 30-day fan passes (from ₦3,000) with a fair, flat 10% platform fee.</p>
      </div>
      <div class="principle-box">
        <div class="p-num">04 / COMMUNITY</div>
        <h4>Interest-Led Belonging</h4>
        <p>19 curated interest channels (Design, Tech, Fitness, Photography, Gaming...) enable autonomous spaces where people find their true tribe.</p>
      </div>
    </div>
  </section>

  <!-- 4. COMPONENTS -->
  <section id="components">
    <div class="sec-heading">
      <span class="kicker">04 / COMPONENTS</span>
      <h3>UI Component Primitives</h3>
      <p class="sec-desc">Glassmorphic surfaces with crisp 1px borders, subtle gradients, and reactive hover states.</p>
    </div>

    <div class="comp-row">
      <div class="comp-panel">
        <h4>BUTTONS <span>INTERACTIONS</span></h4>
        <div class="btn-group">
          <button class="btn btn-primary">Find your people <span>↗</span></button>
          <button class="btn btn-lime">Unlock ₦500</button>
          <button class="btn btn-outline">Explore topics</button>
        </div>
      </div>

      <div class="comp-panel">
        <h4>TAGS & STATUS PILLS <span>METADATA</span></h4>
        <div class="badge-group">
          <span class="pill active">Technology</span>
          <span class="pill active">Design</span>
          <span class="pill pulse"><i></i> Maya Chen · Live</span>
          <span class="pill">♥ 12.8K likes</span>
          <span class="pill">10% Platform Fee</span>
        </div>
      </div>
    </div>
  </section>

  <!-- 5. WORDMARK PATTERNS -->
  <section id="wordmarks">
    <div class="sec-heading">
      <span class="kicker">05 / IDENTITY</span>
      <h3>Wordmark & Lockup Patterns</h3>
      <p class="sec-desc">Defined brand lockup standards ensuring versatility across light, dark, and editorial settings.</p>
    </div>

    <div class="wm-grid">
      <div class="wm-card">
        <div class="lockup">
          <img src="${logoDataUri}" alt="">
          <span class="title">QUICKCHAT</span>
        </div>
        <p class="sub">Icon mark + uppercase geometric Syne 800</p>
        <span class="tag">Primary Brand Lockup</span>
      </div>

      <div class="wm-card">
        <div class="lockup">
          <span class="title">QUICK<span style="font-weight: 400; color: var(--text-muted);">CHAT</span></span>
        </div>
        <p class="sub">Dual-weight typography for clean minimalist usage</p>
        <span class="tag">Split-Weight Lockup</span>
      </div>

      <div class="wm-card">
        <div class="lockup">
          <span class="title">QUICK<span style="color: var(--secondary);">CHAT</span></span>
        </div>
        <p class="sub">Accent-highlighted wordmark celebrating conversation</p>
        <span class="tag">High-Impact Accent Lockup</span>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer>
    <div>QuickChat Platform Design System · Reference Specification</div>
    <div>Cross-reference: <code>promo-video/quickchat-platform-pitch.html</code></div>
  </footer>

</div>

</body>
</html>`;

fs.writeFileSync(path.join(designDir, 'design-system.html'), designSystemHtml, 'utf8');
console.log('Wrote design/design-system.html');
