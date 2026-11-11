import React from 'react';
import { useParams } from 'react-router-dom';
import CreatorSidebar from '../components/CreatorSidebar';
import CommunityFeed from './CommunityFeed';

export default function CreatorSpaceDashboard() {
  const { communityId } = useParams();
  return <div className="min-h-screen bg-slate-50">
    <CreatorSidebar />
    <main className="min-h-screen px-0 pb-10 lg:ml-64">
      <div className="mx-auto max-w-5xl px-3 pt-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">Creator workspace</p><h1 className="mt-1 text-xl font-black text-slate-950">Space dashboard</h1><p className="mt-1 text-xs text-slate-500">Manage this space and publish directly to its audience.</p></div>
          <a href={`/creator/content-library?communityId=${encodeURIComponent(communityId)}`} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white no-underline hover:bg-blue-800"><i className="fa-solid fa-calendar-plus mr-2"/>Open Content Library</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CommunityFeed creatorMode />
        </div>
      </div>
    </main>
  </div>;
}
