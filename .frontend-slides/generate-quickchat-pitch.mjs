import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "promo-video");
const skillRoot = path.join(root, "promo-video", "frontend-slides-skill");
const viewportBase = fs.readFileSync(path.join(skillRoot, "viewport-base.css"), "utf8");

// Load assets as base64
const logo = fs.readFileSync(path.join(outputDir, "assets", "quickchat-logo.png")).toString("base64");
const home = fs.readFileSync(path.join(outputDir, "assets", "quickchat-home-demo.png")).toString("base64");
const explore = fs.readFileSync(path.join(outputDir, "assets", "quickchat-explore-demo.png")).toString("base64");
const communities = fs.readFileSync(path.join(outputDir, "assets", "quickchat-communities-demo.png")).toString("base64");
const messages = fs.readFileSync(path.join(outputDir, "assets", "quickchat-messages-demo.png")).toString("base64");

const logoUrl = `data:image/png;base64,${logo}`;
const homeUrl = `data:image/png;base64,${home}`;
const exploreUrl = `data:image/png;base64,${explore}`;
const communitiesUrl = `data:image/png;base64,${communities}`;
const messagesUrl = `data:image/png;base64,${messages}`;

const slides = `
    <!-- SLIDE 01: COVER -->
    <section class="slide slide-cover active visible" aria-label="QuickChat pitch cover">
      <div class="cover-grid"></div>
      <div class="cover-orbit orbit-one"></div>
      <div class="cover-orbit orbit-two"></div>
      
      <header class="brand-lockup reveal">
        <img src="${logoUrl}" alt="QuickChat logo">
        <span class="wm-split">QUICK<span class="wm-light">CHAT</span></span>
        <small>PEOPLE · INTERESTS · CONVERSATION</small>
      </header>

      <div class="cover-copy">
        <div class="eyebrow reveal"><span class="badge-dot"></span>THE ALL-IN-ONE SOCIAL SUITE</div>
        <h1 class="reveal" data-editable="cover-title">Find your people.<em>Keep the conversation going.</em></h1>
        <p class="cover-sub reveal" data-editable="cover-subtitle">A social home unifying curated interest feeds, verified creators, real-time messaging, and creator monetization in one fluid space.</p>
        <div class="cover-tags reveal">
          <span class="tag-pill">TECHNOLOGY</span>
          <span class="tag-pill">DESIGN</span>
          <span class="tag-pill">COMMUNITIES</span>
          <span class="tag-pill">REAL-TIME CHAT</span>
          <span class="tag-pill">CREATOR STUDIO</span>
        </div>
        <div class="cover-cta reveal">
          <span class="cta-pulse"></span>
          <span>QUICKCHAT · FIND YOUR PEOPLE</span>
          <span class="cta-arrow">↗</span>
        </div>
      </div>

      <div class="cover-visual">
        <div class="screen-frame reveal">
          <div class="frame-bar">
            <span class="dots"><i></i><i></i><i></i></span>
            <span class="url-bar">quickchat.app/home</span>
            <span class="auth-tag">AUTHENTIC UI</span>
          </div>
          <div class="frame-content">
            <img src="${homeUrl}" alt="QuickChat Home feed showing fictional demo posts">
          </div>
        </div>
        
        <div class="floating-post reveal">
          <div class="post-pill-head">
            <span class="sample-label">ENGAGEMENT METRICS</span>
            <span class="live-dot"></span>
          </div>
          <strong>12.8K <small>likes</small></strong>
          <div class="post-metrics-bar">
            <span>♥ 12.8K</span>
            <span>💬 846</span>
            <span>↗ 312</span>
          </div>
        </div>

        <div class="floating-profile reveal">
          <div class="portrait portrait-one"><b>MC</b></div>
          <div class="profile-info">
            <div class="name-row">
              <strong>Maya Chen</strong>
              <span class="verified-badge" title="Verified Creator">✓</span>
            </div>
            <small>24.6K followers · Technology</small>
          </div>
          <i class="follow-dot">+</i>
        </div>
      </div>

      <span class="slide-index">01 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 02: THE FRICTION / PROBLEM -->
    <section class="slide slide-problem" aria-label="The problem QuickChat addresses">
      <div class="section-kicker reveal">
        <b>01</b>
        <span>THE FRICTION</span>
        <i></i>
        <small>GOOD CONTENT. TOO MANY DISCONNECTED STOPS.</small>
      </div>

      <div class="problem-copy">
        <h2 class="display reveal" data-editable="problem-title">Your feed is full.<em>Your people are elsewhere.</em></h2>
        <p class="body-copy reveal" data-editable="problem-copy">Finding fresh ideas, keeping up with creators, and having real conversations shouldn’t require switching between three disconnected apps.</p>
      </div>

      <div class="island-row">
        <article class="island island-a reveal">
          <span class="island-number">01 / SILO</span>
          <div class="island-icon icon-feed">▤</div>
          <h3>CONTENT SILO</h3>
          <p>Endless algorithm feeds optimized for passive consumption, not connection.</p>
          <div class="island-badge warn">PASSIVE SCROLLING</div>
        </article>

        <div class="broken-link link-a reveal">
          <span>BROKEN LINK</span>
          <div class="dashes"><i></i><i></i><i></i></div>
        </div>

        <article class="island island-b reveal">
          <span class="island-number">02 / SILO</span>
          <div class="island-icon icon-people">◉</div>
          <h3>CREATOR WALL</h3>
          <p>Creators scattered across separate subscription paywalls and external links.</p>
          <div class="island-badge warn">FRAGMENTED AUDIENCE</div>
        </article>

        <div class="broken-link link-b reveal">
          <span>BROKEN LINK</span>
          <div class="dashes"><i></i><i></i><i></i></div>
        </div>

        <article class="island island-c reveal">
          <span class="island-number">03 / SILO</span>
          <div class="island-icon icon-chat">•••</div>
          <h3>CHAT ISLAND</h3>
          <p>Conversations banished to isolated chat apps, losing the original context.</p>
          <div class="island-badge warn">LOST CONTEXT</div>
        </article>
      </div>

      <div class="problem-punch reveal">
        <span>Connection shouldn’t feel like hard work.</span>
        <strong>It should happen in one seamless home.</strong>
      </div>

      <span class="slide-index">02 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 03: THE ARCHITECTURE / SOLUTION -->
    <section class="slide slide-answer" aria-label="QuickChat solution">
      <div class="answer-left">
        <div class="section-kicker reveal">
          <b>02</b>
          <span>THE ARCHITECTURE</span>
          <i></i>
          <small>MEET QUICKCHAT · ONE SOCIAL HOME</small>
        </div>
        <h2 class="display reveal" data-editable="solution-title">Bring it all<em>closer.</em></h2>
        <p class="body-copy reveal" data-editable="solution-copy">QuickChat brings topics, creators, conversations, and communities together in one frictionless social ecosystem designed for genuine interaction.</p>
        
        <div class="solution-list">
          <div class="solution-item reveal">
            <b>01</b>
            <span>
              <strong>DISCOVER</strong>
              <small>Explore 19 interest channels and follow emerging creators.</small>
            </span>
          </div>
          <div class="solution-item reveal">
            <b>02</b>
            <span>
              <strong>CONNECT</strong>
              <small>Seamlessly transition from a feed post into an ongoing private chat.</small>
            </span>
          </div>
          <div class="solution-item reveal">
            <b>03</b>
            <span>
              <strong>MONETIZE & GATHER</strong>
              <small>Empower creators with pay-per-post and build vibrant community circles.</small>
            </span>
          </div>
        </div>
      </div>

      <div class="answer-map">
        <div class="map-ring ring-a"></div>
        <div class="map-ring ring-b"></div>
        <div class="map-ring ring-c"></div>
        <div class="map-line line-a"></div>
        <div class="map-line line-b"></div>
        <div class="map-line line-c"></div>
        
        <div class="map-node node-a">
          <i class="node-icon">▤</i>
          <span>19 TOPICS</span>
        </div>
        <div class="map-node node-b">
          <i class="node-icon">◉</i>
          <span>CREATORS</span>
        </div>
        <div class="map-node node-c">
          <i class="node-icon">✉</i>
          <span>DIRECT CHAT</span>
        </div>
        <div class="map-node node-d">
          <i class="node-icon">✳</i>
          <span>CIRCLES</span>
        </div>

        <div class="map-core">
          <img src="${logoUrl}" alt="QuickChat logo">
          <strong>QuickChat</strong>
          <small>THE UNIFIED HOME</small>
        </div>
        
        <div class="answer-note">
          A better conversation<br>
          <em>starts with connection.</em>
        </div>
      </div>

      <span class="slide-index">03 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 04: DISCOVERY / HOME & EXPLORE -->
    <section class="slide slide-discover" aria-label="Home and Explore features">
      <div class="section-kicker reveal">
        <b>03</b>
        <span>DISCOVERY ENGINE</span>
        <i></i>
        <small>HOME FEED → GLOBAL EXPLORE</small>
      </div>

      <div class="discover-header-row">
        <h2 class="display discover-title reveal" data-editable="discover-title">Start with your interests.<em>Find what’s next.</em></h2>
        <div class="topic-chip-row reveal">
          <span class="chip active">#Technology</span>
          <span class="chip">#Design</span>
          <span class="chip">#Business</span>
          <span class="chip">#Gaming</span>
          <span class="chip">#Photography</span>
          <span class="chip">#Science</span>
        </div>
      </div>

      <div class="screens-row">
        <figure class="product-screen home-screen reveal">
          <div class="screen-top">
            <span class="screen-title">HOME FEED</span>
            <span class="screen-url">quickchat.app/home</span>
            <small class="screen-badge">YOUR CIRCLE</small>
          </div>
          <div class="screen-img">
            <img src="${homeUrl}" alt="Authentic QuickChat Home screen">
            <span class="auth-label">AUTHENTIC QUICKCHAT UI</span>
          </div>
          <figcaption>
            <b>Stay close to your favorite voices.</b>
            <span>Toggle smoothly between 'All' and 'Following' with zero algorithm clutter.</span>
          </figcaption>
        </figure>

        <div class="screen-bridge reveal">
          <span class="bridge-arrow">→</span>
          <small>KEEP EXPLORING</small>
        </div>

        <figure class="product-screen explore-screen reveal">
          <div class="screen-top">
            <span class="screen-title">EXPLORE ENGINE</span>
            <span class="screen-url">quickchat.app/explore</span>
            <small class="screen-badge">19 CHANNELS</small>
          </div>
          <div class="screen-img">
            <img src="${exploreUrl}" alt="Authentic QuickChat Explore screen">
            <span class="auth-label">AUTHENTIC QUICKCHAT UI</span>
          </div>
          <figcaption>
            <b>Discover new topics and emerging thinkers.</b>
            <span>Browse curated interest categories, trending discussions, and fresh creator profiles.</span>
          </figcaption>
        </figure>
      </div>

      <span class="slide-index">04 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 05: CONVERSATION & MESSAGING -->
    <section class="slide slide-conversation" aria-label="Social interaction and messaging features">
      <div class="section-kicker reveal">
        <b>04</b>
        <span>MEANINGFUL DIALOGUE</span>
        <i></i>
        <small>REACT · REPLY · DIRECT MESSAGE</small>
      </div>

      <div class="conversation-grid">
        <div class="conversation-copy">
          <h2 class="display reveal" data-editable="conversation-title">Don’t just scroll past.<em>Say something.</em></h2>
          <p class="body-copy reveal" data-editable="conversation-copy">Every post is a conversation starter. React, comment publicly, or carry any discussion straight into real-time direct messages with live typing presence.</p>
          
          <div class="action-row reveal">
            <span class="act-btn">♥ LIKE</span>
            <span class="act-btn">↩ REPLY</span>
            <span class="act-btn">↗ SHARE</span>
            <span class="act-btn highlight">💬 START CHAT</span>
          </div>

          <div class="live-cue reveal">
            <i></i>
            <span>REAL-TIME PRESENCE & TYPING TELEMETRY</span>
            <b>● ● ●</b>
          </div>
        </div>

        <div class="conversation-art">
          <!-- Real Messages UI Screenshot -->
          <div class="screen-frame-mini reveal">
            <div class="frame-bar">
              <span class="dots"><i></i><i></i><i></i></span>
              <span class="url-bar">quickchat.app/messages</span>
              <span class="auth-tag">REAL UI</span>
            </div>
            <div class="frame-img-wrap">
              <img src="${messagesUrl}" alt="Authentic QuickChat Messages interface">
            </div>
          </div>

          <!-- Interactive Live Chat Bubble Overlay -->
          <div class="message-window reveal">
            <div class="message-head">
              <div class="portrait portrait-three"><b>JL</b></div>
              <div>
                <strong>Jordan Lee</strong>
                <small><i></i> Active now · Design Community</small>
              </div>
              <b class="more">•••</b>
            </div>
            <div class="chat-body">
              <div class="bubble incoming">Saw your post about the new UI architecture. Loved that concept!</div>
              <div class="bubble outgoing">Thank you! Planning to open it up for community feedback tomorrow.</div>
              <div class="bubble incoming">Count me in. Let's build a dedicated thread for it in the Design circle.</div>
              <div class="typing">
                <i></i><i></i><i></i>
                <span>Jordan is typing</span>
              </div>
            </div>
            <div class="chat-input">
              <span>Write a thoughtful reply…</span>
              <b>↑</b>
            </div>
            <small class="illustrative-label">INTEGRATED CHAT SUITE</small>
          </div>
        </div>
      </div>

      <span class="slide-index">05 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 06: VIDEO & COMMUNITIES -->
    <section class="slide slide-community" aria-label="Videos and communities">
      <div class="section-kicker reveal">
        <b>05</b>
        <span>SHARED SPACES</span>
        <i></i>
        <small>WATCH · JOIN · BUILD</small>
      </div>

      <h2 class="display community-title reveal" data-editable="community-title">Find your circle.<em>Keep it growing.</em></h2>

      <div class="community-layout">
        <figure class="community-screen reveal">
          <div class="screen-top">
            <span class="screen-title">COMMUNITIES HUB</span>
            <span class="screen-url">quickchat.app/communities</span>
            <small class="screen-badge">GROUPS</small>
          </div>
          <div class="screen-img">
            <img src="${communitiesUrl}" alt="Authentic QuickChat Communities screen">
            <span class="auth-label">AUTHENTIC QUICKCHAT UI</span>
          </div>
          <figcaption>
            <div class="fig-left">
              <b>Autonomous Interest Communities</b>
              <span>Create, join, and moderate topic circles where enthusiasts gather to share knowledge.</span>
            </div>
            <span class="members-pill">14.2K Active Members</span>
          </figcaption>
        </figure>

        <div class="video-card reveal">
          <div class="video-picture">
            <div class="sun"></div>
            <div class="horizon"></div>
            <button aria-label="Illustrative video play icon">▶</button>
            <span class="video-tag">VERTICAL VIDEO FEED</span>
          </div>
          <div class="video-info">
            <strong>See a fresh point of view.</strong>
            <span>Share and stream short-form vertical video posts tailored to your interest channels.</span>
            <div class="video-actions">
              <b>♥ 1.4K</b>
              <b>💬 218</b>
              <b>↗ Share</b>
              <small>NATIVE PLAYER</small>
            </div>
          </div>
        </div>

        <div class="community-sticker reveal">
          <span>COMMON PASSIONS</span>
          <strong>Make room<br>for your people.</strong>
          <i>✳</i>
        </div>
      </div>

      <span class="slide-index">06 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 07: CREATOR MONETIZATION -->
    <section class="slide slide-creators" aria-label="Creator monetization options">
      <div class="section-kicker reveal">
        <b>06</b>
        <span>CREATOR ECONOMY</span>
        <i></i>
        <small>SHARE · OFFER · EARN</small>
      </div>

      <div class="creator-head">
        <h2 class="display reveal" data-editable="creator-title">Make more room<em>for your work.</em></h2>
        <p class="body-copy reveal" data-editable="creator-copy">Give your audience direct, frictionless ways to support exclusive content, fan clubs, and paid communities with native checkout.</p>
      </div>

      <div class="creator-options">
        <article class="creator-option public-option reveal">
          <span class="option-kicker">01 / AUDIENCE</span>
          <div class="option-mark">✦</div>
          <h3>Build your reach.</h3>
          <p>Publish public posts, rich media, and vertical video reels to grow an engaged, loyal following.</p>
          <div class="option-foot">FREE TO DISCOVER · ZERO BARRIERS</div>
        </article>

        <article class="creator-option premium-option reveal">
          <span class="option-kicker">02 / UNLOCKABLE</span>
          <div class="price">₦500<small>FROM · ONE-TIME UNLOCK</small></div>
          <h3>Offer premium posts.</h3>
          <p>Charge a one-time fee for deep-dive tutorials, exclusive insights, and high-value creative assets.</p>
          <div class="option-foot">MICRO-PAYMENTS · INSTANT ACCESS</div>
        </article>

        <article class="creator-option fan-option reveal">
          <span class="option-kicker">03 / MEMBERSHIP</span>
          <div class="price">₦3,000<small>FROM · 30-DAY PASS</small></div>
          <h3>Offer recurring passes.</h3>
          <p>Provide 30-day fan passes or private community passes for VIP chats, bonus drops, and direct mentorship.</p>
          <div class="option-foot">RECURRING REVENUE · VIP CIRCLE</div>
        </article>
      </div>

      <div class="fee-note reveal">
        <div class="fee-badge">10%</div>
        <div class="fee-text">
          <strong>Transparent Platform Fee</strong>
          <span>QuickChat keeps only 10% before provider processing charges. Creators keep 90% of what they earn.</span>
        </div>
        <small>Seamless checkout powered by Flutterwave with automated creator payout account support.</small>
      </div>

      <span class="slide-index">07 <i>/</i> 08</span>
    </section>

    <!-- SLIDE 08: CLOSING CALL TO ACTION -->
    <section class="slide slide-close" aria-label="QuickChat call to action">
      <div class="close-grid"></div>
      <div class="close-orbit"></div>
      
      <div class="close-mark reveal">
        <img src="${logoUrl}" alt="QuickChat logo">
      </div>
      
      <p class="eyebrow reveal"><span class="badge-dot"></span>QUICKCHAT IDENTITY</p>
      <h2 class="close-title reveal" data-editable="close-title">Your people.<em>Your conversation.</em></h2>
      <p class="close-copy reveal" data-editable="close-copy">One unified social home to discover, share, connect, and thrive around what matters most to you.</p>
      
      <div class="close-wm-suite reveal">
        <div class="suite-item">
          <img src="${logoUrl}" alt="">
          <span>QUICKCHAT</span>
          <small>Mark + Wordmark</small>
        </div>
        <div class="suite-item">
          <span class="wm-split">QUICK<span class="wm-light">CHAT</span></span>
          <small>Split-Weight</small>
        </div>
        <div class="suite-item">
          <span class="wm-accent">QUICK<span class="accent-lime">CHAT</span></span>
          <small>Accent Lockup</small>
        </div>
      </div>

      <div class="close-button reveal" id="deckCtaBtn">
        <span>FIND YOUR PEOPLE</span>
        <span class="cta-arrow">↗</span>
      </div>

      <div class="close-tags reveal">
        <span>EXPLORE</span>
        <i>·</i>
        <span>CONNECT</span>
        <i>·</i>
        <span>CONVERSE</span>
        <i>·</i>
        <span>MONETIZE</span>
      </div>

      <span class="slide-index">08 <i>/</i> 08</span>
    </section>
`;

const voiceover = [
  "Welcome to QuickChat. A modern social home built to bring your interests, creators, and conversations under one roof.",
  "Today's social landscape is fragmented into three disconnected silos: mindless algorithmic feeds, creator paywalls, and isolated chat apps. Finding people and continuing a discussion takes too much friction.",
  "QuickChat changes that. By putting your shared passions at the center, topics, creators, direct messaging, and communities orbit seamlessly around you.",
  "Start with your interests on Home, then dive into Explore to discover what's trending across 19 curated channels from Technology to Design, Gaming, and Photography.",
  "Don't just scroll past. Every post on QuickChat can turn into a conversation. React publicly, or carry the discussion directly into private real-time messaging with live typing telemetry.",
  "Watch vertical video reels and build autonomous community circles where common passions become enduring conversations.",
  "For creators, QuickChat provides native monetization: one-time premium posts from five hundred naira, and thirty-day fan passes from three thousand naira. QuickChat retains a modest ten percent fee.",
  "QuickChat. Your people. Your conversation. One social home to discover, connect, and keep talking."
];

const durations = [8, 10, 9, 11, 11, 11, 11, 8];
const times = [];
let seconds = 0;
for (let i = 0; i < durations.length; i++) {
  const start = seconds;
  seconds += durations[i];
  const fmt = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  times.push({ start: fmt(start), end: fmt(seconds), line: voiceover[i] });
}

const style = `
/* ==========================================================================
   QUICKCHAT DESIGN SYSTEM SPECIFICATION STYLESHEET
   Extracted & Refined per RoboNuggets Design System Standard
   ========================================================================== */

:root {
  --stage-bg:        #071326;
  --slide-bg:        #08142a;
  --navy:            #071326;
  --navy-2:          #0c1d38;
  --navy-3:          #112548;
  --electric:        #2464f4;
  --electric-glow:   rgba(36, 100, 244, 0.45);
  --blue:            #3b7cff;
  --cyan:            #65dff5;
  --cyan-glow:       rgba(101, 223, 245, 0.35);
  --lime:            #d4ff00;
  --lime-glow:       rgba(212, 255, 0, 0.4);
  --coral:           #ff795f;
  --coral-glow:      rgba(255, 121, 95, 0.35);
  --cream:           #f5f1e8;
  --white:           #f5f8ff;
  --muted:           #a9b8d2;
  --line:            rgba(217, 231, 255, 0.16);
  --border-glass:    rgba(101, 223, 245, 0.22);
  --border-subtle:   rgba(255, 255, 255, 0.09);
  --ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);
  --duration-normal: 0.72s;
  --display-font:    'Syne', sans-serif;
  --serif-font:      'Fraunces', serif;
  --body-font:       'DM Sans', sans-serif;
  --mono-font:       'Space Mono', monospace;
}

/* === GLOBAL TYPOGRAPHY, TEXTURE, AND MOTION === */
body {
  color: var(--white);
  font-family: var(--body-font);
  background: var(--stage-bg);
  -webkit-font-smoothing: antialiased;
}

.slide {
  padding: 64px 86px;
  color: var(--white);
  background: var(--navy);
  transition: opacity 0.65s ease, visibility 0.65s;
}

.slide.active { z-index: 2; }

/* Subtle background telemetry grid & ambient radial glow */
.slide::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.28;
  background-image: 
    linear-gradient(rgba(217, 231, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(217, 231, 255, 0.06) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(120deg, #000 0%, transparent 80%);
}

.slide::after {
  content: "";
  position: absolute;
  right: -240px;
  top: -360px;
  width: 950px;
  height: 950px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(36, 100, 244, 0.22) 0%, transparent 70%);
  pointer-events: none;
}

/* Reveal choreography */
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity var(--duration-normal) var(--ease-out-expo),
              transform var(--duration-normal) var(--ease-out-expo);
}

.slide.visible .reveal { opacity: 1; transform: translateY(0); }
.slide.visible .reveal:nth-child(1) { transition-delay: 0.06s; }
.slide.visible .reveal:nth-child(2) { transition-delay: 0.14s; }
.slide.visible .reveal:nth-child(3) { transition-delay: 0.22s; }
.slide.visible .reveal:nth-child(4) { transition-delay: 0.30s; }
.slide.visible .reveal:nth-child(5) { transition-delay: 0.38s; }

/* BRAND LOCKUP */
.brand-lockup {
  position: absolute;
  z-index: 4;
  top: 56px;
  left: 86px;
  display: flex;
  align-items: center;
  gap: 16px;
  font: 800 22px var(--display-font);
  letter-spacing: 0.05em;
}

.brand-lockup img {
  width: 50px;
  height: 50px;
  border-radius: 13px;
  object-fit: cover;
  box-shadow: 0 0 20px var(--electric-glow);
}

.wm-split { font-family: var(--display-font); font-weight: 800; letter-spacing: 2px; }
.wm-light { font-weight: 400; color: var(--muted); }
.wm-accent { font-family: var(--display-font); font-weight: 800; }
.accent-lime { color: var(--lime); }

.brand-lockup small {
  margin-left: 20px;
  color: var(--cyan);
  font: 11px var(--mono-font);
  letter-spacing: 0.14em;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(101, 223, 245, 0.08);
  border: 1px solid rgba(101, 223, 245, 0.2);
}

.eyebrow {
  color: var(--cyan);
  font: 700 13px var(--mono-font);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 10px var(--lime-glow);
  display: inline-block;
}

.display {
  margin: 0;
  color: var(--white);
  font: 800 74px/0.98 var(--display-font);
  letter-spacing: -0.045em;
}

.display em {
  display: block;
  margin-top: 10px;
  color: var(--electric);
  font: 600 66px/0.98 var(--serif-font);
  letter-spacing: -0.035em;
}

.body-copy {
  max-width: 710px;
  color: #b7c6de;
  font-size: 21px;
  line-height: 1.5;
}

.section-kicker {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #d5e0f3;
  font: 700 13px var(--mono-font);
  letter-spacing: 0.12em;
}

.section-kicker b {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border-glass);
  border-radius: 50%;
  color: var(--cyan);
  font-size: 12px;
  background: rgba(101, 223, 245, 0.06);
}

.section-kicker i {
  width: 80px;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent);
}

.section-kicker small {
  color: #899dbf;
  font-size: 11px;
  letter-spacing: 0.14em;
}

.slide-index {
  position: absolute;
  left: 88px;
  bottom: 44px;
  color: #8798b5;
  font: 11px var(--mono-font);
  letter-spacing: 0.16em;
}

.slide-index i {
  color: var(--cyan);
  font-style: normal;
  margin: 0 6px;
}

/* SCREEN FRAMES (AUTHENTIC QUICKCHAT UI) */
.screen-frame, .product-screen, .community-screen, .screen-frame-mini {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-glass);
  border-radius: 18px;
  background: #09172d;
  box-shadow: 0 28px 60px rgba(1, 9, 22, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.frame-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #0d1e38;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-family: var(--mono-font);
  font-size: 10px;
}

.dots { display: flex; gap: 6px; }
.dots i { width: 9px; height: 9px; border-radius: 50%; background: #263854; }
.url-bar { color: #8fa5c7; letter-spacing: 0.8px; }
.auth-tag { padding: 2px 7px; border-radius: 10px; background: rgba(36, 100, 244, 0.2); border: 1px solid rgba(36, 100, 244, 0.4); color: #7db0ff; font-size: 8.5px; }

.frame-content img, .screen-img img, .community-screen img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.auth-label {
  position: absolute;
  left: 16px;
  bottom: 14px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 14px;
  background: rgba(7, 19, 38, 0.9);
  backdrop-filter: blur(8px);
  color: white;
  font: 9.5px var(--mono-font);
  letter-spacing: 0.08em;
  z-index: 2;
}

/* === SLIDE 01: COVER === */
.slide-cover {
  background: radial-gradient(ellipse at 76% 48%, #14356a 0%, #0c1d3a 44%, #071326 78%);
}

.cover-grid {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(158, 183, 233, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(158, 183, 233, 0.05) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: linear-gradient(110deg, #000 0%, transparent 80%);
}

.cover-orbit {
  position: absolute;
  border: 1px solid rgba(101, 223, 245, 0.16);
  border-radius: 50%;
  pointer-events: none;
}

.orbit-one { width: 1060px; height: 1060px; right: -160px; top: -50px; animation: slow-orbit 44s linear infinite; }
.orbit-two { width: 800px; height: 800px; right: -25px; top: 80px; border-style: dashed; animation: slow-orbit 36s linear infinite reverse; }

.cover-copy {
  position: absolute;
  left: 92px;
  top: 236px;
  width: 820px;
  z-index: 3;
}

.cover-copy .eyebrow { margin-bottom: 22px; }

.cover-copy h1 {
  margin: 0;
  color: white;
  font: 800 86px/0.98 var(--display-font);
  letter-spacing: -0.05em;
}

.cover-copy h1 em {
  display: block;
  margin-top: 14px;
  color: var(--lime);
  font: 600 62px/0.98 var(--serif-font);
  letter-spacing: -0.035em;
}

.cover-sub {
  max-width: 710px;
  margin: 28px 0 0;
  color: #bcc9de;
  font-size: 21px;
  line-height: 1.52;
}

.cover-tags {
  display: flex;
  gap: 10px;
  margin-top: 30px;
  flex-wrap: wrap;
}

.tag-pill {
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  color: #dbe6f8;
  font: 10px var(--mono-font);
  letter-spacing: 0.1em;
}

.cover-cta {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 36px;
  padding: 12px 22px;
  border-radius: 28px;
  background: rgba(13, 29, 56, 0.85);
  border: 1px solid var(--border-glass);
  color: #eff5ff;
  font: 700 11px var(--mono-font);
  letter-spacing: 0.12em;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.cta-pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 16px var(--lime-glow);
}

.cover-visual {
  position: absolute;
  right: 90px;
  top: 185px;
  width: 860px;
  height: 720px;
  z-index: 2;
}

.cover-visual .screen-frame {
  position: absolute;
  right: 0;
  top: 60px;
  width: 780px;
  height: 450px;
  transform: rotate(1.4deg);
  animation: screen-enter 1s var(--ease-out-expo) both;
}

.floating-post, .floating-profile {
  position: absolute;
  z-index: 4;
  background: #f8faff;
  color: #13213b;
  box-shadow: 0 20px 42px rgba(0, 0, 0, 0.5);
  animation: float-gentle 4.8s ease-in-out infinite;
}

.floating-post {
  left: 20px;
  top: 480px;
  width: 250px;
  padding: 18px 20px;
  border-radius: 18px;
  transform: rotate(-3.5deg);
}

.post-pill-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.sample-label { color: #596c8d; font: 700 8.5px var(--mono-font); letter-spacing: 0.1em; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #32d4a1; }

.floating-post strong {
  display: block;
  font: 800 32px var(--display-font);
  color: #1c53ca;
  letter-spacing: -0.03em;
}
.floating-post strong small { font: 500 14px var(--body-font); color: #4b5e7d; }

.post-metrics-bar {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5ecf6;
  font: 700 10px var(--mono-font);
  color: #556988;
}

.floating-profile {
  right: 18px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 360px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  animation-delay: 0.8s;
}

.portrait {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  border: 3px solid white;
  border-radius: 50%;
  color: #0e254c;
  font: 700 14px var(--display-font);
  box-shadow: 0 0 0 1px #193e88;
}

.portrait-one { width: 56px; height: 56px; background: linear-gradient(140deg, #8ccee2, #e3b094 55%, #5378bd); }
.portrait-two { width: 52px; height: 52px; background: linear-gradient(140deg, #edbb7d, #a15843 56%, #4ba69b); }
.portrait-three { width: 48px; height: 48px; background: linear-gradient(140deg, #c7b9eb, #c17c66 55%, #436fc5); }

.profile-info strong { font: 700 16px var(--display-font); color: #10213b; }
.name-row { display: flex; align-items: center; gap: 6px; }
.verified-badge { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: #2464f4; color: white; font-size: 10px; font-weight: 700; }
.profile-info small { display: block; margin-top: 2px; color: #536785; font-size: 11px; }

.follow-dot {
  display: grid;
  place-items: center;
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--electric);
  color: white;
  font-style: normal;
  font-size: 20px;
  box-shadow: 0 4px 12px var(--electric-glow);
}

/* === SLIDE 02: THE FRICTION === */
.slide-problem {
  background: radial-gradient(ellipse at 76% 80%, #1c316a 0%, #0c1c39 42%, #071326 78%);
}

.problem-copy {
  position: relative;
  z-index: 1;
  margin: 44px auto 36px;
  text-align: center;
}

.problem-copy .display { font-size: 72px; }
.problem-copy .display em { color: var(--coral); font-size: 64px; }
.problem-copy .body-copy { margin: 18px auto 0; max-width: 880px; }

.island-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  margin-top: 28px;
}

.island {
  position: relative;
  width: 400px;
  height: 260px;
  padding: 28px 30px;
  border: 1px solid var(--border-glass);
  border-radius: 22px;
  background: linear-gradient(145deg, #132a4e, #0c1b35);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.45);
}

.island-a { transform: translateY(0); }
.island-b { transform: translateY(16px) rotate(1deg); }
.island-c { transform: translateY(-6px) rotate(-0.8deg); }

.island-number {
  position: absolute;
  right: 24px;
  top: 22px;
  color: #728db5;
  font: 11px var(--mono-font);
  letter-spacing: 0.1em;
}

.island-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 16px;
  font-size: 24px;
}
.icon-feed { background: #1d4eae; color: #dce8ff; }
.icon-people { background: #884c70; color: #ffdbe9; }
.icon-chat { background: #276b7e; color: #dcfffa; }

.island h3 {
  margin: 22px 0 8px;
  font: 800 18px var(--display-font);
  letter-spacing: 0.04em;
  color: #fff;
}

.island p {
  margin: 0;
  color: #b1c1dc;
  font-size: 15px;
  line-height: 1.45;
}

.island-badge {
  display: inline-block;
  margin-top: 18px;
  padding: 5px 10px;
  border-radius: 12px;
  font: 700 9px var(--mono-font);
  letter-spacing: 0.12em;
}
.island-badge.warn {
  background: rgba(255, 121, 95, 0.14);
  border: 1px solid rgba(255, 121, 95, 0.35);
  color: #ff9b84;
}

.broken-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 72px;
}
.broken-link span { font: 8px var(--mono-font); color: var(--coral); letter-spacing: 0.8px; }
.dashes { display: flex; gap: 6px; }
.dashes i { width: 10px; height: 2px; background: var(--coral); transform: rotate(-25deg); }

.problem-punch {
  margin-top: 48px;
  text-align: center;
  font: 21px var(--serif-font);
  color: #d1dcef;
}
.problem-punch strong {
  margin-left: 12px;
  color: var(--lime);
  font-family: var(--display-font);
  font-weight: 800;
  font-size: 24px;
}

/* === SLIDE 03: THE ARCHITECTURE / SOLUTION === */
.slide-answer {
  display: grid;
  grid-template-columns: 780px 1fr;
  gap: 30px;
  align-items: center;
  background: linear-gradient(112deg, #071326 0%, #0d1d3a 50%, #08152d 100%);
}

.answer-left { position: relative; z-index: 2; padding-top: 8px; }
.answer-left .section-kicker { margin-bottom: 48px; }
.answer-left .display { font-size: 82px; }
.answer-left .display em { font-size: 78px; color: var(--lime); }
.answer-left .body-copy { margin: 24px 0 32px; max-width: 670px; }

.solution-list { display: grid; gap: 14px; max-width: 640px; }
.solution-item {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: rgba(13, 28, 53, 0.7);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
}
.solution-item > b {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(101, 223, 245, 0.12);
  border: 1px solid var(--border-glass);
  color: var(--cyan);
  font: 700 12px var(--mono-font);
}
.solution-item strong { display: block; font: 700 14px var(--display-font); letter-spacing: 0.08em; color: #fff; }
.solution-item small { display: block; margin-top: 4px; color: #a4b7d4; font-size: 13.5px; }

.answer-map { position: relative; width: 920px; height: 760px; margin-left: 10px; }
.map-ring {
  position: absolute;
  left: 50%;
  top: 48%;
  border: 1px solid rgba(101, 223, 245, 0.2);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.ring-a { width: 620px; height: 620px; }
.ring-b { width: 460px; height: 460px; border-style: dashed; animation: slow-orbit 36s linear infinite; }
.ring-c { width: 310px; height: 310px; }

.map-line {
  position: absolute;
  left: 50%;
  top: 48%;
  height: 1px;
  width: 520px;
  background: linear-gradient(90deg, transparent, rgba(101, 223, 245, 0.6), transparent);
  transform-origin: left center;
}
.line-a { transform: rotate(20deg); }
.line-b { transform: rotate(140deg); }
.line-c { transform: rotate(260deg); }

.map-core {
  position: absolute;
  left: 50%;
  top: 48%;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  width: 220px;
  height: 220px;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  background: radial-gradient(circle, #1a428a, #0c1c38);
  box-shadow: 0 0 70px var(--electric-glow);
  transform: translate(-50%, -50%);
}
.map-core img { width: 74px; height: 74px; border-radius: 18px; object-fit: cover; }
.map-core strong { font: 800 21px var(--display-font); color: #fff; }
.map-core small { color: var(--cyan); font: 9px var(--mono-font); letter-spacing: 0.16em; }

.map-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 110px;
  height: 110px;
  border: 1px solid var(--border-glass);
  border-radius: 50%;
  background: #0d1e3a;
  box-shadow: 0 0 35px rgba(18, 92, 225, 0.25);
  color: #e7f2ff;
  font: 700 9.5px var(--mono-font);
  letter-spacing: 0.1em;
  animation: float-gentle 5s ease-in-out infinite;
}
.node-icon { font-style: normal; font-size: 18px; color: var(--cyan); }

.node-a { left: 50%; top: 25px; transform: translateX(-50%); }
.node-b { right: 35px; top: 46%; animation-delay: 0.7s; }
.node-c { left: 85px; top: 44%; animation-delay: 1.2s; }
.node-d { left: 50%; bottom: 18px; transform: translateX(-50%); animation-delay: 1.8s; }

.answer-note {
  position: absolute;
  right: 15px;
  bottom: 60px;
  color: #d5e4ff;
  font: 18px var(--serif-font);
  text-align: right;
}
.answer-note em { color: var(--lime); }

/* === SLIDE 04: DISCOVERY === */
.slide-discover { background: #08152d; }
.discover-header-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 24px 0 24px;
}
.discover-title { margin: 0; font-size: 56px; }
.discover-title em { display: inline; margin-left: 14px; font-size: 52px; color: var(--lime); }

.topic-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  padding: 6px 12px;
  border-radius: 16px;
  font: 10px var(--mono-font);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: #b5c7e3;
}
.chip.active { border-color: var(--tertiary); color: var(--tertiary); background: rgba(101, 223, 245, 0.1); }

.screens-row {
  display: grid;
  grid-template-columns: 1fr 80px 1fr;
  gap: 24px;
  align-items: center;
}
.product-screen { border-radius: 18px; background: #0c1c38; }
.screen-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #0e203f;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font: 700 11px var(--mono-font);
  color: #d6e3f8;
}
.screen-url { color: #879cb8; font-weight: 400; font-size: 9.5px; }
.screen-badge { padding: 2px 7px; border-radius: 10px; background: rgba(36, 100, 244, 0.25); color: #7db0ff; font-size: 8px; }

.screen-img { position: relative; height: 410px; overflow: hidden; background: #08152a; }
.product-screen figcaption {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  background: #0a1831;
  font-size: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.product-screen figcaption b { font-weight: 700; color: #fff; }
.product-screen figcaption span { color: #96a9c7; text-align: right; max-width: 480px; }

.screen-bridge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--cyan);
}
.bridge-arrow {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid var(--border-glass);
  border-radius: 50%;
  font-size: 26px;
  background: rgba(101, 223, 245, 0.08);
}
.screen-bridge small {
  writing-mode: vertical-rl;
  font: 9.5px var(--mono-font);
  letter-spacing: 0.16em;
  color: #92abcf;
}

.home-screen { transform: translateY(4px) rotate(-0.5deg); }
.explore-screen { transform: translateY(-4px) rotate(0.5deg); }

/* === SLIDE 05: CONVERSATION & MESSAGES === */
.slide-conversation {
  background: radial-gradient(ellipse at 80% 50%, #173874 0%, #0b1d3b 42%, #071326 80%);
}
.conversation-grid {
  display: grid;
  grid-template-columns: 680px 1fr;
  gap: 50px;
  align-items: center;
  margin-top: 60px;
}
.conversation-copy .display { font-size: 70px; }
.conversation-copy .display em { font-size: 68px; color: var(--coral); }
.conversation-copy .body-copy { margin: 24px 0 28px; }

.action-row { display: flex; gap: 10px; flex-wrap: wrap; }
.act-btn {
  padding: 10px 15px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  color: #e6eeff;
  font: 700 10px var(--mono-font);
  background: rgba(255, 255, 255, 0.04);
}
.act-btn.highlight {
  background: var(--electric);
  border-color: var(--electric);
  box-shadow: 0 4px 14px var(--electric-glow);
}

.live-cue {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 36px;
  color: #b7c8e2;
  font: 10px var(--mono-font);
  letter-spacing: 0.1em;
}
.live-cue i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #32d4a1;
  box-shadow: 0 0 16px rgba(50, 212, 161, 0.7);
}
.live-cue b { margin-left: 8px; color: var(--cyan); letter-spacing: 0.2em; animation: blink 1.4s steps(2, start) infinite; }

.conversation-art { position: relative; height: 680px; }
.screen-frame-mini {
  position: absolute;
  left: 0;
  top: 10px;
  width: 580px;
  height: 380px;
  transform: rotate(-1.5deg);
}
.frame-img-wrap { height: 340px; overflow: hidden; }

.message-window {
  position: absolute;
  right: 0;
  bottom: 20px;
  z-index: 3;
  width: 500px;
  height: 450px;
  padding: 20px;
  border: 1px solid rgba(101, 223, 245, 0.3);
  border-radius: 24px;
  background: #ffffff;
  color: #172742;
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.6);
}

.message-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 4px 14px;
  border-bottom: 1px solid #e3e9f3;
}
.message-head strong { font: 700 15px var(--display-font); color: #11233d; }
.message-head small { display: block; margin-top: 3px; color: #178764; font-size: 11px; }
.message-head small i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #32c991; }
.more { margin-left: auto; color: #7688a4; letter-spacing: 0.14em; }

.chat-body { padding: 18px 4px; }
.bubble {
  max-width: 350px;
  padding: 13px 16px;
  border-radius: 17px;
  font-size: 13.5px;
  line-height: 1.4;
  margin-bottom: 12px;
}
.incoming { background: #eef2f9; color: #283a54; }
.outgoing { margin-left: auto; background: var(--electric); color: #fff; }

.typing {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 140px;
  padding: 10px 14px;
  border-radius: 16px;
  background: #eef2f9;
}
.typing i { width: 5px; height: 5px; border-radius: 50%; background: #6e7f9a; animation: typing 1s ease-in-out infinite; }
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
.typing span { margin-left: 4px; color: #7586a0; font-size: 10px; font-family: var(--mono-font); }

.chat-input {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 38px;
  padding: 12px 16px;
  border: 1px solid #dce3ee;
  border-radius: 14px;
  color: #92a0b4;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chat-input b {
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  border-radius: 8px;
  background: var(--electric);
  color: white;
}
.illustrative-label {
  position: absolute;
  left: 20px;
  bottom: 14px;
  color: #7d8ea6;
  font: 8.5px var(--mono-font);
  letter-spacing: 0.12em;
}

/* === SLIDE 06: VIDEO & COMMUNITIES === */
.slide-community {
  background: linear-gradient(125deg, #071326, #10264a 60%, #08152d);
}
.community-title { margin: 26px 0 24px; font-size: 60px; }
.community-title em { display: inline; margin-left: 15px; color: var(--lime); font-size: 56px; }

.community-layout {
  position: relative;
  display: grid;
  grid-template-columns: 960px 520px;
  gap: 40px;
  align-items: center;
  margin-top: 12px;
}
.community-screen { height: 530px; transform: rotate(-0.6deg); }
.community-screen figcaption {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-radius: 14px;
  background: rgba(6, 19, 38, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
}
.fig-left b { display: block; font: 700 15px var(--display-font); }
.fig-left span { color: #b7c7df; font-size: 12px; }
.members-pill {
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(101, 223, 245, 0.15);
  border: 1px solid var(--border-glass);
  color: var(--cyan);
  font: 700 10px var(--mono-font);
}

.video-card {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  background: #f8faff;
  color: #152743;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.5);
  transform: rotate(0.8deg);
}
.video-picture {
  position: relative;
  height: 330px;
  overflow: hidden;
  background: linear-gradient(140deg, #175fd4, #325b97 52%, #f08e62);
}
.video-picture:before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(5, 20, 44, 0.7)); }
.sun { position: absolute; right: 78px; top: 50px; width: 90px; height: 90px; border-radius: 50%; background: #f7db93; box-shadow: 0 0 55px rgba(247, 219, 147, 0.6); }
.horizon { position: absolute; left: -5%; right: -5%; bottom: -25px; height: 180px; background: linear-gradient(120deg, #173665, #20324f); clip-path: polygon(0 88%, 23% 27%, 44% 70%, 67% 0, 100% 78%, 100% 100%, 0 100%); }
.video-picture button { position: absolute; z-index: 1; left: 50%; top: 50%; width: 76px; height: 76px; border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 50%; background: rgba(6, 21, 44, 0.85); color: white; font-size: 24px; transform: translate(-50%, -50%); cursor: pointer; }
.video-tag { position: absolute; left: 18px; bottom: 16px; padding: 7px 11px; border-radius: 14px; background: rgba(6, 19, 38, 0.9); color: #fff; font: 9px var(--mono-font); letter-spacing: 0.1em; }

.video-info { padding: 18px 22px; }
.video-info strong { display: block; font: 700 17px var(--display-font); color: #12243e; }
.video-info span { display: block; margin-top: 5px; color: #5b6e8a; font-size: 13px; }
.video-actions { display: flex; gap: 16px; margin-top: 14px; font: 700 11px var(--mono-font); color: #ce4861; align-items: center; }
.video-actions b:nth-child(2) { color: #526785; }
.video-actions small { margin-left: auto; color: #9a6516; font-size: 8.5px; }

.community-sticker {
  position: absolute;
  right: 65px;
  bottom: 8px;
  width: 250px;
  padding: 16px 20px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 18px;
  background: var(--lime);
  color: #172640;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
  transform: rotate(-4.5deg);
}
.community-sticker span { font: 700 9px var(--mono-font); letter-spacing: 0.14em; }
.community-sticker strong { display: block; margin-top: 6px; font: 800 21px var(--display-font); line-height: 1.15; }
.community-sticker i { position: absolute; right: 16px; top: 14px; color: var(--electric); font-size: 24px; font-style: normal; }

/* === SLIDE 07: CREATOR MONETIZATION === */
.slide-creators {
  background: radial-gradient(ellipse at 50% 110%, #153c7a 0%, #091831 50%, #071326 88%);
}
.creator-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 32px 0 34px;
}
.creator-head .display { font-size: 64px; }
.creator-head .display em { display: inline; margin-left: 12px; font-size: 58px; color: var(--coral); }
.creator-head .body-copy { max-width: 520px; margin: 0 0 6px 30px; font-size: 18px; }

.creator-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.creator-option {
  position: relative;
  min-height: 350px;
  padding: 30px 32px;
  border: 1px solid var(--border-glass);
  border-radius: 22px;
  background: linear-gradient(150deg, #132a4e, #0c1b35);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
}
.option-kicker { color: var(--tertiary); font: 700 10.5px var(--mono-font); letter-spacing: 0.14em; }
.option-mark { margin-top: 36px; color: var(--lime); font-size: 38px; }
.creator-option h3 { margin: 16px 0 10px; font: 800 24px var(--display-font); color: #fff; }
.creator-option p { max-width: 400px; color: #b1c2dd; font-size: 15.5px; line-height: 1.5; }
.option-foot {
  position: absolute;
  left: 32px;
  right: 32px;
  bottom: 24px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #9ab3d6;
  font: 9.5px var(--mono-font);
  letter-spacing: 0.1em;
}

.premium-option { background: linear-gradient(155deg, #163d86, #0c1b36); border-color: rgba(101, 223, 245, 0.4); }
.fan-option { border-color: rgba(212, 255, 0, 0.5); background: linear-gradient(155deg, #223c62, #101d34); }

.price {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 32px;
  color: var(--lime);
  font: 800 40px var(--display-font);
  letter-spacing: -0.02em;
}
.price small { color: #adc3e4; font: 9.5px var(--mono-font); letter-spacing: 0.1em; }

.fee-note {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 24px;
  padding: 16px 22px;
  border: 1px solid var(--border-glass);
  border-radius: 16px;
  background: rgba(12, 27, 53, 0.85);
}
.fee-badge {
  color: var(--cyan);
  font: 800 24px var(--display-font);
  padding: 4px 12px;
  border-radius: 10px;
  background: rgba(101, 223, 245, 0.12);
  border: 1px solid var(--border-glass);
}
.fee-text strong { display: block; font: 700 14px var(--display-font); color: #fff; }
.fee-text span { color: #cad8ee; font-size: 13px; }
.fee-note small {
  margin-left: auto;
  max-width: 480px;
  color: #8fa4c5;
  font-size: 11px;
  line-height: 1.45;
  text-align: right;
}

/* === SLIDE 08: CLOSING CALL TO ACTION === */
.slide-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  background: radial-gradient(ellipse at 50% 44%, #174288 0%, #0b1a35 42%, #071326 78%);
}
.close-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image: 
    linear-gradient(rgba(158, 183, 233, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(158, 183, 233, 0.08) 1px, transparent 1px);
  background-size: 52px 52px;
  mask-image: radial-gradient(ellipse at center, #000 0%, transparent 72%);
}
.close-orbit {
  position: absolute;
  width: 780px;
  height: 780px;
  border: 1px solid rgba(101, 223, 245, 0.2);
  border-radius: 50%;
  animation: slow-orbit 52s linear infinite;
}

.close-mark {
  display: grid;
  place-items: center;
  width: 108px;
  height: 108px;
  margin-bottom: 22px;
  border: 1px solid rgba(219, 233, 255, 0.5);
  border-radius: 28px;
  background: #102648;
  box-shadow: 0 0 55px rgba(45, 110, 252, 0.4);
}
.close-mark img { width: 88px; height: 88px; border-radius: 20px; object-fit: cover; }

.slide-close .eyebrow { position: relative; z-index: 1; margin-bottom: 16px; }
.close-title {
  position: relative;
  z-index: 1;
  margin: 0;
  color: white;
  font: 800 84px/0.98 var(--display-font);
  letter-spacing: -0.05em;
}
.close-title em {
  display: block;
  margin-top: 10px;
  color: var(--lime);
  font: 600 70px var(--serif-font);
  letter-spacing: -0.035em;
}
.close-copy {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 22px 0 28px;
  color: #c5d3e8;
  font-size: 21px;
  line-height: 1.5;
}

.close-wm-suite {
  display: flex;
  gap: 20px;
  margin-bottom: 28px;
  position: relative;
  z-index: 1;
}
.suite-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  background: rgba(13, 28, 54, 0.7);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
}
.suite-item img { width: 28px; height: 28px; border-radius: 7px; }
.suite-item span { font: 800 15px var(--display-font); letter-spacing: 2px; }
.suite-item small { font: 9px var(--mono-font); color: var(--tertiary); }

.close-button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 18px;
  padding: 18px 36px;
  border-radius: 32px;
  background: var(--electric);
  color: white;
  font: 700 13px var(--mono-font);
  letter-spacing: 0.12em;
  box-shadow: 0 10px 36px var(--electric-glow);
  cursor: pointer;
  transition: all 0.25s;
}
.close-button:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 14px 44px rgba(36, 100, 244, 0.7);
  background: #3673ff;
}
.cta-arrow { font-size: 20px; }

.close-tags {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 16px;
  margin-top: 32px;
  color: #92a7c4;
  font: 10.5px var(--mono-font);
  letter-spacing: 0.16em;
}
.close-tags i { color: var(--cyan); font-style: normal; }

/* === PRESENTATION CONTROLS (OUTSIDE FIXED STAGE) === */
.deck-controls {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border: 1px solid rgba(203, 218, 245, 0.2);
  border-radius: 30px;
  background: rgba(7, 19, 38, 0.9);
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.6);
  color: white;
}

.deck-controls button, .edit-toggle, .edit-actions button, .notes-open, .fullscreen-toggle {
  border: 0;
  color: #eff5ff;
  background: transparent;
  font: 11px var(--mono-font);
  cursor: pointer;
  transition: all 0.2s;
}

.deck-controls button {
  padding: 7px 12px;
  border-radius: 20px;
}
.deck-controls button:hover, .deck-controls button:focus-visible {
  background: rgba(255, 255, 255, 0.16);
  outline: 1px solid var(--cyan);
}

.deck-progress {
  width: 220px;
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}
.deck-progress i {
  display: block;
  width: 12.5%;
  height: 100%;
  background: var(--lime);
  box-shadow: 0 0 10px var(--lime-glow);
  transition: width 0.35s ease;
}

.page-count {
  min-width: 60px;
  color: #9bb0d1;
  font-size: 11px;
  font-family: var(--mono-font);
  text-align: center;
}

/* Edit Mode Toolbar */
.edit-hotzone {
  position: fixed;
  top: 0;
  left: 0;
  width: 80px;
  height: 80px;
  z-index: 10000;
  cursor: pointer;
}
.edit-toggle {
  position: fixed;
  top: 18px;
  left: 18px;
  z-index: 10001;
  padding: 10px 15px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 22px;
  background: rgba(7, 19, 38, 0.9);
  backdrop-filter: blur(10px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.edit-toggle.show, .edit-toggle.active {
  opacity: 1;
  pointer-events: auto;
}
.edit-actions {
  position: fixed;
  top: 18px;
  left: 145px;
  z-index: 10001;
  display: flex;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.editing .edit-actions { opacity: 1; pointer-events: auto; }
.edit-actions button {
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  background: rgba(7, 19, 38, 0.9);
}

.editing [data-editable] {
  outline: 1px dashed rgba(212, 255, 0, 0.7);
  outline-offset: 4px;
  cursor: text;
}

/* Speaker Notes Dialog */
.notes-open {
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 20px;
}
.notes-dialog {
  width: min(740px, 92vw);
  padding: 0;
  border: 1px solid #527bb9;
  border-radius: 22px;
  background: #0b1b35;
  color: #f4f7ff;
  box-shadow: 0 35px 90px rgba(0, 0, 0, 0.75);
}
.notes-dialog::backdrop {
  background: rgba(2, 8, 19, 0.8);
  backdrop-filter: blur(6px);
}
.notes-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 26px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  font: 700 12px var(--mono-font);
}
.notes-head button { border: 0; background: transparent; color: white; font-size: 24px; cursor: pointer; }
.notes-body { padding: 26px; font: 19px/1.65 var(--serif-font); color: #d8e3f5; }
.notes-meta { padding: 0 26px 22px; color: #8497b6; font: 10.5px var(--mono-font); }

/* Toast */
.toast {
  position: fixed;
  left: 50%;
  top: 25px;
  z-index: 10003;
  padding: 12px 20px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 24px;
  background: #10213d;
  color: #e9f4ff;
  font: 11px var(--mono-font);
  opacity: 0;
  transform: translate(-50%, -10px);
  transition: 0.25s;
  pointer-events: none;
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }

/* KEYFRAMES */
@keyframes float-gentle { 0%, 100% { translate: 0 0; } 50% { translate: 0 -11px; } }
@keyframes slow-orbit { to { transform: rotate(360deg); } }
@keyframes screen-enter { from { opacity: 0; translate: 45px 25px; } to { opacity: 1; translate: 0 0; } }
@keyframes typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.55; } 30% { transform: translateY(-4px); opacity: 1; } }
@keyframes blink { to { visibility: hidden; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
  .reveal, .slide.visible .reveal { opacity: 1; transform: none; transition: none; }
  .slide { transition: none; }
}
`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="A QuickChat pitch presentation: a social home for people, interests and conversations.">
  <title>QuickChat — Find your people · Platform Pitch</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
${viewportBase}
${style}
  </style>
</head>
<body>
  <div class="deck-viewport">
    <main class="deck-stage" id="deckStage" aria-live="polite">
${slides}
    </main>
  </div>

  <div class="deck-controls" aria-label="Presentation controls">
    <button type="button" id="prevSlide" aria-label="Previous slide">← PREV</button>
    <div class="deck-progress" aria-label="Presentation progress"><i id="progressFill"></i></div>
    <span class="page-count" id="pageCount">01 / 08</span>
    <button type="button" id="nextSlide" aria-label="Next slide">NEXT →</button>
    <button type="button" class="notes-open" id="notesOpen" title="View voiceover notes (N)">NOTES [N]</button>
    <button type="button" class="fullscreen-toggle" id="fullscreenToggle" title="Toggle Fullscreen (F)">⛶ [F]</button>
  </div>

  <div class="edit-hotzone" aria-hidden="true"></div>
  <button class="edit-toggle" id="editToggle" type="button" title="Edit text (E)">✎ EDIT TEXT [E]</button>
  <div class="edit-actions" id="editActions">
    <button type="button" id="saveEdits">SAVE EDITS</button>
    <button type="button" id="downloadDeck">DOWNLOAD HTML</button>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <dialog class="notes-dialog" id="notesDialog">
    <div class="notes-head">
      <span id="notesHeading">VOICEOVER / 01</span>
      <button type="button" id="notesClose" aria-label="Close voiceover notes">×</button>
    </div>
    <div class="notes-body" id="notesBody"></div>
    <div class="notes-meta">Navigation: ← / →, Space, Wheel, Swipe · Fullscreen: F · Notes: N · Edit Text: E</div>
  </dialog>

  <script>
    /* === QUICKCHAT PRESENTATION CONTROLLER === */
    class SlidePresentation {
      constructor() {
        this.slides = Array.from(document.querySelectorAll(".slide"));
        this.currentSlide = 0;
        this.stage = document.getElementById("deckStage");
        this.lastWheel = 0;
        this.touchStart = null;
        this.notes = ${JSON.stringify(voiceover)};
        this.setupStageScale();
        this.setupNavigation();
        this.setupNotes();
        this.setupFullscreen();
        this.loadEdits();
        this.showSlide(0);
      }

      setupStageScale() {
        const scale = () => {
          const factor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
          const x = (window.innerWidth - 1920 * factor) / 2;
          const y = (window.innerHeight - 1080 * factor) / 2;
          this.stage.style.transform = "translate(" + x + "px, " + y + "px) scale(" + factor + ")";
        };
        scale();
        window.addEventListener("resize", scale);
      }

      setupNavigation() {
        document.addEventListener("keydown", (event) => {
          const typing = event.target.matches("input,textarea,select,[contenteditable='true']");
          if (typing) return;
          if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && event.target.tagName !== "BUTTON")) {
            event.preventDefault();
            this.next();
          } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
            event.preventDefault();
            this.previous();
          } else if ((event.key === "e" || event.key === "E") && !event.ctrlKey && !event.metaKey) {
            editor.toggle();
          } else if ((event.key === "n" || event.key === "N") && !event.ctrlKey && !event.metaKey) {
            const dialog = document.getElementById("notesDialog");
            if (dialog.open) dialog.close();
            else dialog.showModal();
          } else if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey) {
            this.toggleFullscreen();
          } else if (event.key === "Escape" && editor.isActive) {
            editor.toggle(false);
          }
        });

        document.getElementById("prevSlide").addEventListener("click", () => this.previous());
        document.getElementById("nextSlide").addEventListener("click", () => this.next());

        document.addEventListener("wheel", (event) => {
          if (document.getElementById("notesDialog").open || editor.isActive) return;
          if (Math.abs(event.deltaY) < 24 || Date.now() - this.lastWheel < 650) return;
          this.lastWheel = Date.now();
          event.deltaY > 0 ? this.next() : this.previous();
        }, { passive: true });

        this.stage.addEventListener("touchstart", (event) => {
          this.touchStart = event.changedTouches[0].clientX;
        }, { passive: true });

        this.stage.addEventListener("touchend", (event) => {
          if (this.touchStart === null) return;
          const distance = event.changedTouches[0].clientX - this.touchStart;
          if (Math.abs(distance) > 55) distance < 0 ? this.next() : this.previous();
          this.touchStart = null;
        }, { passive: true });

        const ctaBtn = document.getElementById("deckCtaBtn");
        if (ctaBtn) {
          ctaBtn.addEventListener("click", () => {
            announce("QuickChat: Find your people. Keep the conversation going.");
            setTimeout(() => this.showSlide(0), 1200);
          });
        }
      }

      setupNotes() {
        const dialog = document.getElementById("notesDialog");
        document.getElementById("notesOpen").addEventListener("click", () => dialog.showModal());
        document.getElementById("notesClose").addEventListener("click", () => dialog.close());
        dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
      }

      setupFullscreen() {
        const btn = document.getElementById("fullscreenToggle");
        btn.addEventListener("click", () => this.toggleFullscreen());
      }

      toggleFullscreen() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }

      showSlide(index) {
        this.currentSlide = Math.max(0, Math.min(index, this.slides.length - 1));
        this.slides.forEach((slide, i) => {
          slide.classList.toggle("active", i === this.currentSlide);
          requestAnimationFrame(() => slide.classList.toggle("visible", i === this.currentSlide));
          slide.setAttribute("aria-hidden", i === this.currentSlide ? "false" : "true");
        });
        document.getElementById("pageCount").textContent = String(this.currentSlide + 1).padStart(2, "0") + " / " + String(this.slides.length).padStart(2, "0");
        document.getElementById("progressFill").style.width = (((this.currentSlide + 1) / this.slides.length) * 100) + "%";
        document.getElementById("notesHeading").textContent = "VOICEOVER / " + String(this.currentSlide + 1).padStart(2, "0");
        document.getElementById("notesBody").textContent = this.notes[this.currentSlide];
      }

      next() { this.showSlide(this.currentSlide + 1); }
      previous() { this.showSlide(this.currentSlide - 1); }

      loadEdits() {
        try {
          const saved = JSON.parse(localStorage.getItem("quickchat-pitch-edits-v1") || "{}");
          document.querySelectorAll("[data-editable]").forEach((node) => {
            const key = node.getAttribute("data-editable");
            if (typeof saved[key] === "string") node.innerHTML = saved[key];
          });
        } catch (_error) {
          localStorage.removeItem("quickchat-pitch-edits-v1");
        }
      }
    }

    /* === INLINE TEXT EDITOR, LOCAL STORAGE SAVE & EXPORT === */
    const toast = document.getElementById("toast");
    let toastTimer;
    function announce(message) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
    }

    const editor = {
      isActive: false,
      toggle(force) {
        this.isActive = typeof force === "boolean" ? force : !this.isActive;
        document.body.classList.toggle("editing", this.isActive);
        document.getElementById("editToggle").classList.toggle("active", this.isActive);
        document.querySelectorAll("[data-editable]").forEach((node) => {
          node.contentEditable = this.isActive ? "true" : "false";
        });
        if (this.isActive) announce("Edit mode active · click highlighted text to edit");
        else {
          this.save();
          announce("Changes saved to local storage");
        }
      },
      save() {
        const data = {};
        document.querySelectorAll("[data-editable]").forEach((node) => {
          data[node.getAttribute("data-editable")] = node.innerHTML;
        });
        localStorage.setItem("quickchat-pitch-edits-v1", JSON.stringify(data));
      },
      download() {
        this.save();
        const clone = document.documentElement.cloneNode(true);
        clone.body.classList.remove("editing");
        clone.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
        const editButton = clone.querySelector("#editToggle");
        if (editButton) editButton.classList.remove("active", "show");
        const blob = new Blob(["<!doctype html>\\n" + clone.outerHTML], { type: "text/html;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "QuickChat-Platform-Pitch-Edited.html";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        announce("Edited presentation downloaded");
      }
    };

    const presentation = new SlidePresentation();
    document.getElementById("editToggle").addEventListener("click", () => editor.toggle());
    document.querySelector(".edit-hotzone").addEventListener("click", () => editor.toggle());
    document.getElementById("saveEdits").addEventListener("click", () => {
      editor.save();
      editor.toggle(false);
      announce("Edits saved successfully");
    });
    document.getElementById("downloadDeck").addEventListener("click", () => editor.download());

    document.addEventListener("input", (event) => {
      if (editor.isActive && event.target.matches("[data-editable]")) editor.save();
    });

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        editor.save();
        announce("Edits saved in this browser");
      }
    });

    let hideEditorTimer;
    const hotzone = document.querySelector(".edit-hotzone");
    const editToggle = document.getElementById("editToggle");
    const hideEditorLater = () => {
      hideEditorTimer = setTimeout(() => {
        if (!editor.isActive) editToggle.classList.remove("show");
      }, 400);
    };

    hotzone.addEventListener("mouseenter", () => {
      clearTimeout(hideEditorTimer);
      editToggle.classList.add("show");
    });
    hotzone.addEventListener("mouseleave", hideEditorLater);
    editToggle.addEventListener("mouseenter", () => clearTimeout(hideEditorLater));
    editToggle.addEventListener("mouseleave", hideEditorLater);
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(outputDir, "quickchat-platform-pitch.html"), html, "utf8");

const fmt = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
let cumulative = 0;
const rows = times.map((entry, i) => {
  const duration = durations[i];
  const row = `| ${entry.start}–${entry.end} | ${i + 1} | ${entry.line} |`;
  cumulative += duration;
  return row;
});

const transcript = `# QuickChat Platform Pitch Voiceover Script

Approximate speaking time: ${fmt(cumulative)} (79 seconds). The deck is speaker-led with integrated presenter notes.

| Time | Slide | Narration |
| --- | --- | --- |
${rows.join("\n")}

## Accuracy & Platform Alignment Notes

- **Real Screenshots**: Slides 01, 04, 05, and 06 use authentic high-resolution QuickChat platform captures (Home Feed, Explore Engine, Messages Suite, and Communities Hub).
- **Design Tokens**: Standardized to QuickChat's Electric Blue (\`#2464F4\`), Neon Lime (\`#D4FF00\`), Vivid Cyan (\`#65DFF5\`), and Midnight Navy (\`#071326\`) per the Design System specification.
- **Creator Economy**: Accurate to platform parameters: Pay-per-post from ₦500, 30-day Fan Passes from ₦3,000, and flat 10% platform fee before provider processing.
- **Presenter Keyboard Shortcuts**:
  - \`←\` / \`→\` / \`Space\`: Slide navigation
  - \`F\`: Toggle Fullscreen
  - \`N\`: Toggle Speaker Notes / Voiceover Drawer
  - \`E\`: Toggle Live Text Editing
  - \`Ctrl+S\` / \`Cmd+S\`: Save in-browser edits
`;

fs.writeFileSync(path.join(outputDir, "quickchat-pitch-voiceover.md"), transcript, "utf8");

console.log(`Successfully generated elevated quickchat-platform-pitch.html and voiceover documentation.`);
