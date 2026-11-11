import React from 'react';
import { Link } from 'react-router-dom';

const benefits = [
  ['fa-user-astronaut','Creator identity','Turn your existing QuickChat account into a creator account without losing your profile, followers or posts.'],
  ['fa-pen-to-square','Content publishing','Use Content Studio to publish updates, images and videos to your audience.'],
  ['fa-chart-line','Audience insights','See follower, publishing and referral metrics from your Creator Studio.'],
  ['fa-people-group','Creator community','Invite your audience and collaborate with other creators as QuickChat grows.'],
];

export default function CreatorProgram() {
  const hasSession = Boolean(localStorage.getItem('token'));
  const joinPath = hasSession ? '/creator-studio' : '/register';
  return <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 lg:pb-10">
    <section className="overflow-hidden rounded-3xl bg-slate-950 p-7 text-white sm:p-10">
      <p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-300">QuickChat creator programme</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-black leading-tight sm:text-5xl">Your voice. Your audience. Your next chapter.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">QuickChat is inviting Nigerian storytellers, educators, entertainers, artists and community builders to create with us. Start with the account you already have.</p>
      <Link to={joinPath} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white no-underline hover:bg-blue-500">{hasSession ? "Join the Creator Programme" : "Create an account to join"} <i className="fa-solid fa-arrow-right"/></Link>
      <p className="mt-3 text-[11px] text-slate-400">No new account required. Creator mode is available from your existing profile.</p>
    </section>
    <section className="mt-7 grid gap-3 sm:grid-cols-2">{benefits.map(([icon,title,body])=><article key={title} className="rounded-2xl border border-slate-200 bg-white p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><i className={'fa-solid '+icon}/></span><h2 className="mt-4 font-extrabold text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p></article>)}</section>
    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-extrabold text-slate-950">Who should apply?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Creators at every stage are welcome. Bring original content, respect community standards, disclose paid promotions and avoid fake engagement or misleading reward claims. Creator access does not guarantee earnings, reach or verification.</p><div className="mt-5 flex flex-wrap gap-3"><Link to={joinPath} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white no-underline">{hasSession ? "Set up Creator account" : "Create an account"}</Link><Link to="/first-100" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 no-underline">Explore First 100</Link></div></section>
  </main>;
}
