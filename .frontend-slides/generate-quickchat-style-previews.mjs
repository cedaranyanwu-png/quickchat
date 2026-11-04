import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillRoot = path.join(root, "promo-video", "frontend-slides-skill");
const previewRoot = path.join(root, ".frontend-slides", "slide-previews");
fs.mkdirSync(previewRoot, { recursive: true });

const viewportBase = fs.readFileSync(path.join(skillRoot, "viewport-base.css"), "utf8");
const logo = fs.readFileSync(path.join(root, "promo-video", "assets", "quickchat-logo.png")).toString("base64");
const home = fs.readFileSync(path.join(root, "promo-video", "assets", "quickchat-home-demo.png")).toString("base64");
const logoUrl = `data:image/png;base64,${logo}`;
const homeUrl = `data:image/png;base64,${home}`;

function documentFor({ title, fonts, css, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · QuickChat</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${fonts}" rel="stylesheet">
  <style>
${viewportBase}
/* Preview-specific design system. */
${css}
  </style>
</head>
<body>
  <div class="deck-viewport"><main class="deck-stage" id="deckStage">
    <section class="slide title-slide active visible">${body}</section>
  </main></div>
  <script>
    const stage = document.getElementById("deckStage");
    function scaleStage() {
      const factor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      const x = (window.innerWidth - 1920 * factor) / 2;
      const y = (window.innerHeight - 1080 * factor) / 2;
      stage.style.transform = "translate(" + x + "px, " + y + "px) scale(" + factor + ")";
    }
    scaleStage();
    window.addEventListener("resize", scaleStage);
  </script>
</body>
</html>`;
}

const sharedReveal = `
.reveal { opacity: 0; transform: translateY(34px); transition: opacity .75s cubic-bezier(.16,1,.3,1), transform .75s cubic-bezier(.16,1,.3,1); }
.slide.visible .reveal { opacity: 1; transform: translateY(0); }
.slide.visible .reveal:nth-child(1) { transition-delay: .08s; }
.slide.visible .reveal:nth-child(2) { transition-delay: .18s; }
.slide.visible .reveal:nth-child(3) { transition-delay: .3s; }
.slide.visible .reveal:nth-child(4) { transition-delay: .42s; }
@media (prefers-reduced-motion: reduce) { .reveal, .slide.visible .reveal { opacity: 1; transform: none; transition: none; } * { animation: none !important; } }
`;

const voltage = documentFor({
  title: "Less scrolling. More connection.",
  fonts: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@500;600;700;800&display=swap",
  css: `
:root { --stage-bg: #111226; --slide-bg: #111226; --blue: #0868ff; --ink: #111226; --lime: #d4ff00; --white: #f7f8ff; }
* { box-sizing: border-box; }
body { font-family: "Space Mono", monospace; }
.title-slide { background: var(--ink); color: var(--white); }
.split { display: grid; grid-template-columns: 1fr 1fr; height: 1080px; }
.copy { position: relative; padding: 80px 82px 72px 104px; background: var(--blue); overflow: hidden; }
.copy:after { content: ""; position: absolute; width: 670px; height: 670px; border: 1px solid #ffffff2c; border-radius: 50%; right: -390px; top: 165px; box-shadow: 0 0 0 60px #ffffff0a,0 0 0 122px #ffffff07; }
.brand { display:flex; align-items:center; gap:16px; font:700 19px "Syne",sans-serif; letter-spacing:.08em; }
.brand img { width:58px; height:58px; border-radius:14px; object-fit:cover; }
.brand small { margin-left:auto; font:12px "Space Mono",monospace; letter-spacing:.08em; opacity:.78; }
.eyebrow { margin-top:150px; color:var(--lime); font-size:16px; letter-spacing:.17em; }
h1 { max-width:790px; margin:28px 0 26px; font:800 112px/.94 "Syne",sans-serif; letter-spacing:-.065em; }
h1 em { color:var(--lime); font-style:normal; }
.lede { max-width:650px; font:23px/1.55 "Space Mono",monospace; color:#e4edff; }
.pill-row { display:flex; gap:14px; margin-top:52px; }
.pill { padding:14px 18px; border:1px solid #ffffff75; border-radius:40px; font-size:12px; letter-spacing:.08em; }
.visual { position:relative; padding:125px 85px 70px 75px; overflow:hidden; background:radial-gradient(circle at 70% 30%,#22294b 0,#15172d 48%,#111226 100%); }
.visual:before,.visual:after { content:""; position:absolute; border:1px solid #d4ff0033; border-radius:50%; width:520px;height:520px; right:-250px; top:85px; animation:orbit 24s linear infinite; }
.visual:after { width:660px;height:660px; right:-320px; top:18px; animation-direction:reverse; }
.visual-kicker { position:relative; z-index:1; color:var(--lime); font-size:13px; letter-spacing:.16em; margin:0 0 18px 20px; }
.screen { position:relative; z-index:1; overflow:hidden; width:790px; height:445px; border:8px solid #f7f8ff; border-radius:22px; box-shadow:18px 22px 0 #07102e; transform:rotate(-2deg); animation:screen-in 1.1s cubic-bezier(.16,1,.3,1) both; }
.screen img { width:100%; height:100%; object-fit:cover; object-position:center top; }
.screen-tag { position:absolute; left:19px; bottom:16px; padding:9px 13px; background:#08152de8; border:1px solid #fff7; border-radius:20px; color:white; font:11px "Space Mono",monospace; letter-spacing:.06em; }
.metric { position:absolute; z-index:2; padding:18px 22px; border-radius:18px; background:#d4ff00; color:#111226; font:700 18px "Syne",sans-serif; box-shadow:8px 9px 0 #0b102b; animation:bob 4s ease-in-out infinite; }
.metric.likes { top:628px; left:100px; }
.profile { position:absolute; z-index:2; right:83px; bottom:109px; display:flex; align-items:center; gap:16px; width:380px; padding:17px 20px; border:1px solid #d8e5ff70; border-radius:18px; background:#181a35; color:white; transform:rotate(2deg); animation:bob 4.7s ease-in-out infinite reverse; }
.portrait { width:56px;height:56px; flex:none; border-radius:50%; display:grid;place-items:center; background:radial-gradient(circle at 36% 30%,#f7d0a3 0 23%,#9b5e48 24% 42%,#4fa7ba 43% 100%); color:#102348; font:700 16px "Syne",sans-serif; border:3px solid white; }
.profile b { display:block; font:700 16px "Syne",sans-serif; }
.profile span { display:block; margin-top:4px; color:#c2cbe0; font-size:11px; }
.demo { color:var(--lime) !important; font-size:9px !important; letter-spacing:.12em; }
@keyframes bob { 0%,100%{translate:0 0} 50%{translate:0 -13px} }
@keyframes orbit { to { transform:rotate(360deg) } }
@keyframes screen-in { from { opacity:0; translate:60px 24px; } to { opacity:1; translate:0 0; } }
${sharedReveal}`,
  body: `<div class="split">
  <div class="copy">
    <header class="brand reveal"><img src="${logoUrl}" alt="QuickChat logo"><span>QUICKCHAT</span><small>YOUR SOCIAL HOME</small></header>
    <div class="eyebrow reveal">YOUR PEOPLE. YOUR INTERESTS.</div>
    <h1 class="reveal">Less scrolling.<br><em>More connection.</em></h1>
    <p class="lede reveal">A social home for the people, ideas and conversations you want to keep close.</p>
    <div class="pill-row reveal"><span class="pill">HOME</span><span class="pill">EXPLORE</span><span class="pill">COMMUNITIES</span></div>
  </div>
  <div class="visual">
    <p class="visual-kicker reveal">FIND WHAT FEELS LIKE YOU</p>
    <div class="screen"><img src="data:image/png;base64,${home}" alt="QuickChat Home screen with fictional demo posts"><span class="screen-tag">REAL QUICKCHAT UI · DEMO CONTENT</span></div>
    <div class="metric likes">♥ 12.8K LIKES <small>· DEMO</small></div>
    <div class="profile"><div class="portrait">MC</div><div><b>Maya Chen</b><span>24.6K followers · SAMPLE PROFILE</span><span class="demo">DEMO METRICS</span></div></div>
  </div>
</div>`
});

const people = documentFor({
  title: "Your people. Your place.",
  fonts: "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Archivo+Narrow:wght@500;600;700&family=Caveat+Brush&family=DM+Mono:wght@400;500&display=swap",
  css: `
:root { --stage-bg:#f5f2ea; --slide-bg:#f5f2ea; --paper:#f5f2ea; --blue:#2c2cdc; --orange:#f2a03a; --red:#e83a2a; --ink:#17172c; }
* { box-sizing:border-box; }
body { color:var(--ink); font-family:"Archivo Narrow",sans-serif; }
.title-slide { padding:62px 74px; background:var(--paper); }
.title-slide:before { content:""; position:absolute; inset:0; pointer-events:none; opacity:.13; background-image:radial-gradient(#7d6a4c 0.7px,transparent .7px); background-size:7px 7px; }
.mast { position:relative; display:flex; align-items:center; justify-content:space-between; border-top:6px solid var(--blue); border-bottom:2px solid var(--ink); padding:18px 0 15px; }
.brand { display:flex;align-items:center;gap:14px;font:700 18px "DM Mono",monospace;letter-spacing:.1em; }
.brand img { width:54px;height:54px;object-fit:cover;border-radius:9px; }
.mast-note { font:13px "DM Mono",monospace; letter-spacing:.12em; }
.grid { position:relative; display:grid; grid-template-columns:1.03fr .97fr; gap:44px; height:820px; padding-top:62px; }
.copy { padding-top:18px; }
.tag { display:inline-block; padding:8px 13px; background:var(--orange); color:var(--ink); font:700 13px "DM Mono",monospace; transform:rotate(-2deg); }
h1 { margin:32px 0 20px; color:var(--blue); font:400 110px/.91 "Alfa Slab One",serif; letter-spacing:.005em; text-shadow:8px 8px 0 var(--red),16px 16px 0 #b7281c; }
.paint { display:block; margin:22px 0 4px 10px; color:#cb4f22; font:60px/1 "Caveat Brush",cursive; transform:rotate(-5deg); }
.lede { max-width:650px; margin-top:32px; font:700 25px/1.35 "Archivo Narrow",sans-serif; }
.callout { display:inline-flex; align-items:center; gap:12px; margin-top:34px; padding:16px 22px; border:3px solid var(--ink); background:var(--blue); color:white; font:700 16px "DM Mono",monospace; box-shadow:7px 7px 0 var(--orange); }
.visual { position:relative; align-self:center; padding:14px; border:6px solid var(--ink); background:var(--orange); transform:rotate(1.4deg); box-shadow:12px 12px 0 var(--red); animation:poster-in .9s cubic-bezier(.16,1,.3,1) both; }
.visual img { display:block; width:100%; height:445px; object-fit:cover; object-position:center top; border:3px solid var(--ink); }
.caption { position:absolute; left:30px; bottom:27px; padding:10px 14px; border:3px solid var(--ink); background:var(--paper); font:700 13px "DM Mono",monospace; }
.sticker { position:absolute; right:-22px; top:-27px; z-index:2; padding:17px 18px; border:4px solid var(--ink); background:var(--blue); color:white; font:16px "Caveat Brush",cursive; transform:rotate(8deg); }
.sample { display:flex; justify-content:space-between; margin-top:28px; padding:17px 18px; border:3px solid var(--ink); background:#fffdf6; font:15px "DM Mono",monospace; }
.sample strong { color:var(--blue); font-size:20px; }
.sample small { display:block; margin-top:7px; color:#8f3c2d; }
@keyframes poster-in { from { opacity:0; transform:translateY(35px) rotate(0); } to { opacity:1; transform:translateY(0) rotate(1.4deg); } }
${sharedReveal}`,
  body: `<header class="mast reveal"><div class="brand"><img src="${logoUrl}" alt="QuickChat logo"> QUICKCHAT / SOCIAL, TOGETHER</div><div class="mast-note">FIND · SHARE · TALK</div></header>
<div class="grid">
  <div class="copy"><span class="tag reveal">A SOCIAL HOME FOR WHAT YOU LOVE</span><h1 class="reveal">YOUR PEOPLE.<br>YOUR PLACE.</h1><span class="paint reveal">Your QuickChat.</span><p class="lede reveal">Bring interests, creators and communities into one conversation.</p><div class="callout reveal">MEET QUICKCHAT <span>↗</span></div></div>
  <div class="visual"><span class="sticker">Make room<br>for your people!</span><img src="data:image/png;base64,${home}" alt="QuickChat Home screen showing fictional demo posts"><span class="caption">QUICKCHAT UI / DEMO CONTENT</span><div class="sample"><div><strong>12.8K likes</strong><small>DEMO METRIC</small></div><div><strong>24.6K</strong><small>SAMPLE FOLLOWERS</small></div></div></div>
</div>`
});

const atlas = documentFor({
  title: "Make room for better conversations.",
  fonts: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap",
  css: `
:root { --stage-bg:#f2efe7; --slide-bg:#f2efe7; --paper:#f2efe7; --ink:#162641; --blue:#235ee7; --coral:#fa765d; --citron:#d7ed76; }
* { box-sizing:border-box; }
body { color:var(--ink); font-family:"DM Sans",sans-serif; }
.title-slide { position:relative; padding:68px 86px; background:var(--paper); }
.topline { display:flex; align-items:center; gap:18px; font:700 15px "DM Sans",sans-serif; letter-spacing:.12em; }
.topline img { width:58px;height:58px;border-radius:14px;object-fit:cover; }
.topline .rule { flex:1;height:1px;background:#1626413d;margin-left:22px; }
.topline small { font-size:12px;color:#64738a; }
.content { position:relative; display:grid; grid-template-columns:790px 1fr; gap:60px; align-items:center; height:830px; }
.copy { position:relative;z-index:2;padding-bottom:25px; }
.eyebrow { color:var(--blue); font-size:15px; font-weight:700; letter-spacing:.18em; }
h1 { margin:24px 0 28px; font:700 96px/.97 "Bricolage Grotesque",sans-serif; letter-spacing:-.06em; }
h1 em { display:block; color:var(--blue); font:italic 600 94px/.95 "Fraunces",serif; letter-spacing:-.055em; }
.lede { max-width:620px; font-size:23px; line-height:1.45; color:#4b5d76; }
.topic-row { display:flex;gap:11px;margin-top:34px; }
.topic { padding:11px 15px; border:1px solid #1626412d; border-radius:30px; background:#fffaf0; font-size:13px; font-weight:600; }
.topic:nth-child(2) { background:var(--citron); }
.topic:nth-child(3) { background:#f5d4ca; }
.map { position:absolute; right:450px;top:170px;width:430px;height:430px;border:1px solid #235ee730;border-radius:50%; }
.map:before,.map:after { content:"";position:absolute;border:1px solid #235ee726;border-radius:50%;inset:42px; }
.map:after { inset:94px; }
.node { position:absolute; width:18px;height:18px;border:4px solid var(--paper);border-radius:50%;background:var(--coral);box-shadow:0 0 0 1px var(--coral);animation:pulse 3s ease-in-out infinite; }
.node.one { top:43px;left:208px; }.node.two { top:208px;right:22px;background:var(--blue);box-shadow:0 0 0 1px var(--blue);animation-delay:.5s; }.node.three { bottom:30px;left:105px;background:#92aa42;box-shadow:0 0 0 1px #92aa42;animation-delay:1s; }
.screen-wrap { position:relative;z-index:1;margin-left:40px;padding:11px;background:#fffaf2;border:1px solid #d8d2c7;border-radius:26px;box-shadow:0 30px 55px #16264122;transform:rotate(1.3deg);animation:rise-in .85s cubic-bezier(.16,1,.3,1) both; }
.screen-wrap img { display:block;width:760px;height:428px;object-fit:cover;object-position:center top;border-radius:17px; }
.screen-label { position:absolute;left:26px;bottom:25px;padding:9px 12px;border-radius:22px;background:#162641e8;color:white;font-size:11px;letter-spacing:.06em; }
.float-note { position:absolute;right:0;bottom:105px;width:312px;padding:20px 22px;border-radius:20px;background:var(--blue);color:#fff;box-shadow:0 18px 34px #16264135;transform:rotate(-3deg);animation:float 4s ease-in-out infinite; }
.float-note strong { display:block;font:700 25px "Bricolage Grotesque",sans-serif; }.float-note span { display:block;margin-top:8px;font-size:11px;color:#dce6ff;letter-spacing:.12em; }
.demo-tag { display:inline-block;padding:7px 10px;margin-top:14px;border-radius:4px;background:var(--citron);color:var(--ink);font-size:9px;font-weight:700;letter-spacing:.12em; }
@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.22)} }
@keyframes float { 0%,100%{translate:0 0} 50%{translate:0 -12px} }
@keyframes rise-in { from{opacity:0;translate:0 38px} to{opacity:1;translate:0 0} }
${sharedReveal}`,
  body: `<header class="topline reveal"><img src="${logoUrl}" alt="QuickChat logo"><span>QUICKCHAT</span><i class="rule"></i><small>A SOCIAL SPACE FOR SHARED INTERESTS</small></header>
<div class="content"><div class="copy"><div class="eyebrow reveal">FIND YOUR KIND OF PEOPLE</div><h1 class="reveal">Make room for <em>better conversations.</em></h1><p class="lede reveal">Follow what moves you. Find the people who get it. Keep the conversation going.</p><div class="topic-row reveal"><span class="topic">HOME + EXPLORE</span><span class="topic">COMMUNITIES</span><span class="topic">MESSAGES</span></div></div>
  <div class="map"><i class="node one"></i><i class="node two"></i><i class="node three"></i></div>
  <div class="screen-wrap"><img src="data:image/png;base64,${home}" alt="QuickChat Home screen with fictional demo posts"><span class="screen-label">REAL QUICKCHAT UI · DEMO CONTENT</span></div>
  <div class="float-note"><strong>12.8K likes</strong><span>ILLUSTRATIVE SAMPLE METRIC</span><b class="demo-tag">DEMO CONTENT</b></div>
</div>`
});

for (const [filename, html] of [["style-a.html", voltage], ["style-b.html", people], ["style-c.html", atlas]]) {
  fs.writeFileSync(path.join(previewRoot, filename), html, "utf8");
}
console.log(`Wrote three self-contained 1920x1080 previews to ${previewRoot}`);
