import React from 'react';

const NovaIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" className={className}>
    <defs>
      <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#020617" />
      </radialGradient>
      <linearGradient id="neon-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="face-metal" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="intense-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="12" result="blur2" />
        <feMerge>
          <feMergeNode in="blur2" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect width="500" height="500" rx="100" fill="url(#bg-grad)" />
    <circle cx="250" cy="250" r="190" fill="none" stroke="url(#neon-cyan)" strokeWidth="2" strokeDasharray="8 12" opacity="0.4" />
    <circle cx="250" cy="250" r="210" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="40 180" opacity="0.6" />
    <path d="M 150,170 C 150,110 350,110 350,170 L 360,260 C 360,330 310,380 250,390 C 190,380 140,330 140,260 Z" fill="url(#face-metal)" stroke="url(#neon-cyan)" strokeWidth="4" filter="url(#glow)" />
    <path d="M 250,130 L 255,150 L 275,155 L 255,160 L 250,180 L 245,160 L 225,155 L 245,150 Z" fill="#67e8f9" filter="url(#glow)" />
    <path d="M 170,180 L 200,180 L 220,200" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.7" />
    <circle cx="170" cy="180" r="3" fill="#38bdf8" />
    <path d="M 330,180 L 300,180 L 280,200" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.7" />
    <circle cx="330" cy="180" r="3" fill="#38bdf8" />
    <path d="M 170,220 L 330,220 L 310,290 L 250,310 L 190,290 Z" fill="#090d16" stroke="#1e293b" strokeWidth="2" />
    <polygon points="190,245 235,245 225,270 195,270" fill="none" stroke="url(#neon-cyan)" strokeWidth="2.5" filter="url(#glow)" />
    <polygon points="310,245 265,245 275,270 305,270" fill="none" stroke="url(#neon-cyan)" strokeWidth="2.5" filter="url(#glow)" />
    <ellipse cx="212" cy="257" rx="8" ry="6" fill="#a5f3fc" filter="url(#intense-glow)" />
    <ellipse cx="288" cy="257" rx="8" ry="6" fill="#a5f3fc" filter="url(#intense-glow)" />
    <line x1="235" y1="255" x2="265" y2="255" stroke="#38bdf8" strokeWidth="2" strokeDasharray="2 2" />
    <line x1="230" y1="340" x2="270" y2="340" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" opacity="0.8" filter="url(#glow)" />
    <line x1="240" y1="355" x2="260" y2="355" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
  </svg>
);

export default NovaIcon;