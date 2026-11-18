import React from 'react';
import { Link } from 'react-router-dom';

const features = [
  { icon: 'fa-pen-to-square', title: 'Create and publish', body: 'Share posts, photos, videos and updates with an audience that can discover your work.' },
  { icon: 'fa-users', title: 'Build communities', body: 'Bring people together around shared interests, conversations and projects.' },
  { icon: 'fa-chart-line', title: 'Grow as a creator', body: 'Build your creator identity, manage publishing and understand how your audience engages.' },
  { icon: 'fa-compass', title: 'Discover people and ideas', body: 'Explore creators, public profiles, channels, pages and communities across QuickChat.' },
];

export default function About() {
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2 font-black text-slate-950 no-underline"><img src="/favicon/logo.png" alt="" className="h-9 w-9 object-contain" />QuickChat</Link>
        <nav className="flex items-center gap-3 text-sm font-bold"><Link to="/login" className="text-slate-600 no-underline">Log in</Link><Link to="/register" className="rounded-full bg-blue-700 px-4 py-2.5 text-white no-underline">Join QuickChat</Link></nav>
      </div>
    </header>
    <section className="overflow-hidden bg-slate-950 px-5 py-16 text-white sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[.22em] text-blue-300">About QuickChat</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">A place to share what you create and build the community around it.</h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300">QuickChat is a social platform where people, creators and businesses can publish content, connect with audiences, discover ideas and build communities around what matters to them.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/register" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white no-underline hover:bg-blue-500">Create your account</Link><Link to="/creator-program" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white no-underline hover:bg-white/10">Explore the Creator Programme</Link></div>
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-5 py-14">
      <div className="max-w-2xl"><h2 className="text-2xl font-black sm:text-3xl">What you can do on QuickChat</h2><p className="mt-3 text-sm leading-7 text-slate-600">QuickChat brings publishing, conversations, discovery and community tools into one social experience.</p></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{features.map((feature) => <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className={'fa-solid ' + feature.icon} /></span><h3 className="mt-4 text-lg font-extrabold">{feature.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{feature.body}</p></article>)}</div>
    </section>
    <section className="mx-auto max-w-6xl px-5 pb-16"><div className="rounded-3xl border border-blue-100 bg-blue-50 p-7 sm:p-10"><p className="text-xs font-black uppercase tracking-[.2em] text-blue-700">For creators</p><h2 className="mt-3 max-w-2xl text-2xl font-black sm:text-3xl">Build your identity. Publish your work. Grow your audience.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">Creators can develop a public profile, share original content, connect with followers and manage communities, pages and channels through creator tools. Access to monetisation or other creator features may depend on eligibility and platform settings; earnings and reach are not guaranteed.</p><Link to="/creator-program" className="mt-5 inline-flex rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white no-underline">Learn about the Creator Programme</Link></div></section>
    <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-500">QuickChat · Connect, create and grow together.</footer>
  </main>;
}
