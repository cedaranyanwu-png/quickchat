import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './About.css';

const slides = [
  {
    eyebrow: 'A social space for everyone',
    title: 'Your world. Your people. Your moment.',
    body: 'Share the things you care about, discover fresh perspectives and find people who make every conversation worth having.',
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=85',
    alt: 'Friends sharing a moment together outdoors',
  },
  {
    eyebrow: 'Made for creators',
    title: 'Turn what you love into something people can follow.',
    body: 'Publish original work, shape your public identity and build a community around your ideas.',
    image: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1800&q=85',
    alt: 'Creative team collaborating around a table',
  },
  {
    eyebrow: 'Community starts here',
    title: 'Find your people. Make something happen.',
    body: 'Join conversations, create spaces and bring people together around shared interests and goals.',
    image: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1800&q=85',
    alt: 'A group of people enjoying a shared community event',
  },
];

const capabilities = [
  { icon: 'fa-photo-film', title: 'Share your story', body: 'Post updates, photos and videos. Give people a reason to stop, connect and join the conversation.' },
  { icon: 'fa-compass', title: 'Discover beyond your circle', body: 'Explore people, ideas, public profiles, channels, pages and content shaped around your interests.' },
  { icon: 'fa-people-group', title: 'Build real communities', body: 'Create or join spaces where people can exchange knowledge, support projects and grow together.' },
  { icon: 'fa-comments', title: 'Keep conversations moving', body: 'Connect through messages, replies and live interactions in one connected social experience.' },
  { icon: 'fa-wand-magic-sparkles', title: 'Grow as a creator', body: 'Develop your creator identity, organise content and understand how people engage with your work.' },
  { icon: 'fa-store', title: 'Give your brand a home', body: 'Build a public presence for your business and connect your products, services and audience.' },
];

const principles = [
  { number: '01', title: 'People first', body: 'Technology should make it easier for people to find one another, exchange ideas and feel part of something.' },
  { number: '02', title: 'Creativity belongs everywhere', body: 'Great ideas can come from any background, community or corner of the world. Every voice deserves room to be discovered.' },
  { number: '03', title: 'Build with intention', body: 'We aim to make useful tools that help people create, connect and grow without losing sight of the human experience.' },
];

export default function About() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const showSlide = (index) => setActiveSlide((index + slides.length) % slides.length);

  return (
    <main className="qc-about">
      <header className="qc-about-header">
        <div className="qc-about-nav">
          <Link to="/" className="qc-about-brand" aria-label="QuickChat home">
            <img src="/favicon/logo.png" alt="" />
            <span>QuickChat</span>
          </Link>
          <nav aria-label="Main navigation">
            <a href="#our-story">Our story</a>
            <a href="#what-you-can-do">What you can do</a>
            <a href="#our-values">Our values</a>
          </nav>
          <div className="qc-about-actions">
            <Link to="/login" className="qc-about-login">Log in</Link>
            <Link to="/register" className="qc-about-join">Join QuickChat <i className="fa-solid fa-arrow-right" /></Link>
          </div>
        </div>
      </header>

      <section className="qc-about-hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
        {slides.map((slide, index) => (
          <div className={`qc-about-slide ${index === activeSlide ? 'is-active' : ''}`} key={slide.title} aria-hidden={index !== activeSlide}>
            <img src={slide.image} alt={slide.alt} className="qc-about-slide-image" />
            <div className="qc-about-slide-shade" />
          </div>
        ))}
        <div className="qc-about-hero-inner">
          <div className="qc-about-hero-copy" key={activeSlide}>
            <span className="qc-about-eyebrow"><span /> {slides[activeSlide].eyebrow}</span>
            <h1>{slides[activeSlide].title}</h1>
            <p>{slides[activeSlide].body}</p>
            <div className="qc-about-hero-buttons">
              <Link to="/register" className="qc-about-primary">Create your account <i className="fa-solid fa-arrow-right" /></Link>
              <a href="#our-story" className="qc-about-secondary">Get to know us <i className="fa-solid fa-arrow-down" /></a>
            </div>
          </div>
          <div className="qc-about-slider-controls" aria-label="Hero slides">
            <button type="button" className="qc-about-slide-arrow" onClick={() => showSlide(activeSlide - 1)} aria-label="Previous slide"><i className="fa-solid fa-arrow-left" /></button>
            <div className="qc-about-dots">
              {slides.map((slide, index) => <button key={slide.title} type="button" onClick={() => showSlide(index)} className={index === activeSlide ? 'active' : ''} aria-label={`Show slide ${index + 1}`} aria-pressed={index === activeSlide} />)}
            </div>
            <button type="button" className="qc-about-slide-arrow" onClick={() => showSlide(activeSlide + 1)} aria-label="Next slide"><i className="fa-solid fa-arrow-right" /></button>
            <span className="qc-about-slide-count">0{activeSlide + 1} <span>/</span> 0{slides.length}</span>
          </div>
        </div>
        <div className="qc-about-hero-note"><i className="fa-solid fa-circle-nodes" /> Connect. Create. Grow.</div>
      </section>

      <section className="qc-about-intro" id="our-story">
        <div className="qc-about-section-label">01 / THE QUICKCHAT STORY</div>
        <div className="qc-about-intro-grid">
          <h2>A more connected way to <span>be social.</span></h2>
          <div>
            <p className="qc-about-lead">QuickChat is a social platform built to bring people, creators and businesses closer to the audiences and communities that matter to them.</p>
            <p>We bring publishing, discovery, messaging and community experiences together so you can move from sharing an idea to finding your people — without having to make every part of your social life happen in a different place.</p>
            <p>Whether you are here to express yourself, learn something new, support a creator or build a community, QuickChat gives you space to take part.</p>
          </div>
        </div>
        <div className="qc-about-photo-strip">
          <img src="https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=900&q=85" alt="Friends talking around a table" loading="lazy" />
          <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85" alt="Team members collaborating" loading="lazy" />
          <img src="https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=900&q=85" alt="People connecting at a group gathering" loading="lazy" />
        </div>
      </section>

      <section className="qc-about-capabilities" id="what-you-can-do">
        <div className="qc-about-section-label">02 / ONE PLATFORM, MANY POSSIBILITIES</div>
        <div className="qc-about-heading-row">
          <div><h2>Everything starts with <span>connection.</span></h2><p>Tools that help you express yourself, find your audience and make your corner of the internet feel like yours.</p></div>
          <span className="qc-about-heading-mark"><i className="fa-solid fa-shapes" /></span>
        </div>
        <div className="qc-about-capability-grid">
          {capabilities.map((item, index) => <article className="qc-about-capability" key={item.title}>
            <span className="qc-about-capability-icon"><i className={`fa-solid ${item.icon}`} /></span>
            <span className="qc-about-capability-number">0{index + 1}</span>
            <h3>{item.title}</h3><p>{item.body}</p>
          </article>)}
        </div>
      </section>

      <section className="qc-about-creator">
        <div className="qc-about-creator-image">
          <img src="https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85" alt="Creative event with people sharing ideas" loading="lazy" />
          <div className="qc-about-image-caption"><i className="fa-solid fa-star" /><span>Make room for what you create.</span></div>
        </div>
        <div className="qc-about-creator-copy">
          <div className="qc-about-section-label">03 / FOR CREATORS & BUSINESSES</div>
          <h2>Your ideas deserve <span>an audience.</span></h2>
          <p>QuickChat is designed to support people who want to do more with their presence online. Creators can share original work, develop a public identity and organise their publishing. Businesses can establish a presence and connect with people interested in what they offer.</p>
          <p>Creator and business tools may have separate access requirements, eligibility rules or availability. Monetisation, audience growth and earnings are not guaranteed.</p>
          <div className="qc-about-link-list">
            <Link to="/creator-program"><span><i className="fa-solid fa-clapperboard" /> Creator Programme</span><i className="fa-solid fa-arrow-up-right-from-square" /></Link>
            <Link to="/register"><span><i className="fa-solid fa-building" /> Create your QuickChat presence</span><i className="fa-solid fa-arrow-up-right-from-square" /></Link>
          </div>
        </div>
      </section>

      <section className="qc-about-values" id="our-values">
        <div className="qc-about-section-label">04 / WHAT GUIDES US</div>
        <div className="qc-about-values-heading"><h2>Built around people.<br /><span>Driven by possibility.</span></h2><p>Our direction is shaped by a simple idea: social technology should help people do more together.</p></div>
        <div className="qc-about-principles">
          {principles.map((item) => <article key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.body}</p></div><i className="fa-solid fa-arrow-up-right-from-square" /></article>)}
        </div>
      </section>

      <section className="qc-about-cta">
        <img src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1800&q=85" alt="" loading="lazy" />
        <div className="qc-about-cta-shade" />
        <div className="qc-about-cta-content"><span className="qc-about-eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</span><h2>Come for the conversation.<br /><em>Stay for the community.</em></h2><p>Join QuickChat and find more ways to connect, create and grow.</p><Link to="/register" className="qc-about-primary">Get started on QuickChat <i className="fa-solid fa-arrow-right" /></Link></div>
      </section>

      <footer className="qc-about-footer">
        <div className="qc-about-footer-main">
          <div><Link to="/" className="qc-about-brand"><img src="/favicon/logo.png" alt="" /><span>QuickChat</span></Link><p>A place to connect, create and grow together.</p></div>
          <div className="qc-about-footer-links"><Link to="/about">About</Link><Link to="/creator-program">Creator Programme</Link><Link to="/login">Log in</Link><Link to="/register">Join QuickChat</Link></div>
        </div>
        <div className="qc-about-footer-bottom"><span>© {new Date().getFullYear()} QuickChat. All rights reserved.</span><span>Connect. Create. Grow.</span></div>
      </footer>
    </main>
  );
}
