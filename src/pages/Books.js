import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import PostCard from '../components/PostCard';

export default function Books({ openModal, openVideo }) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const load = () => apiRequest('/books').then((result) => setPosts(result.bookmarks || result.posts || [])).catch((requestError) => setError(requestError.message));
  useEffect(() => { load(); }, []);
  const updatePost = (post) => { setPosts((current) => post.bookmarked ? current.map((item) => item.id === post.id ? post : item) : current.filter((item) => item.id !== post.id)); };

  return <div className="max-w-4xl mx-auto pb-20 lg:pb-0"><div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3"><h2 className="text-lg font-extrabold text-slate-900">Bookmarks</h2></div>{error && <p className="p-4 text-sm text-red-600">{error}</p>}{posts.map((post) => <PostCard key={post.id} post={post} openModal={openModal} openVideo={openVideo} onChange={updatePost} />)}{!error && posts.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Your saved posts will appear here.</p>}</div>;
}
