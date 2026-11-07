import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';

export default function SavedArticles() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/rss/saved-articles?limit=100');
      setArticles(result.articles || []);
    } catch (requestError) { setError(requestError.message || 'Saved articles could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (articleId) => {
    try {
      await apiRequest('/rss/articles/' + articleId + '/save', { method: 'DELETE' });
      setArticles((current) => current.filter((article) => article.id !== articleId));
    } catch (requestError) { setError(requestError.message || 'Could not remove this saved article.'); }
  };

  return <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 px-4 py-5 pb-24">
    <header className="mb-5 flex items-center gap-3"><Link to="/discover" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 no-underline"><i className="fa-solid fa-arrow-left" /></Link><div><h1 className="text-lg font-extrabold text-slate-900">Saved articles</h1><p className="text-[11px] text-slate-500">Publisher stories you want to revisit</p></div></header>
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {loading ? <p className="py-12 text-center text-xs text-slate-500">Loading saved articles…</p> : articles.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><i className="fa-regular fa-bookmark text-2xl text-slate-300" /><h2 className="mt-3 text-sm font-bold text-slate-800">Nothing saved yet</h2><p className="mt-1 text-xs text-slate-500">Save articles from Discover and they will appear here.</p><Link to="/discover" className="mt-4 inline-flex rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white no-underline">Explore articles</Link></div> :
      <div className="space-y-3">{articles.map((article) => <article key={article.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-3 p-3">{article.imageUrl && <img src={article.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-24 w-24 flex-shrink-0 rounded-lg object-cover" />}<div className="min-w-0 flex-1"><div className="text-[10px] font-semibold text-blue-700">{article.publisherName || article.publisher} · {article.category}</div><h2 className="mt-1 text-sm font-extrabold leading-5 text-slate-900">{article.title}</h2>{article.excerpt && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{article.excerpt}</p>}<div className="mt-3 flex flex-wrap gap-3"><a href={article.articleUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-700 no-underline">Read original <i className="fa-solid fa-arrow-up-right-from-square ml-1" /></a><button type="button" onClick={() => remove(article.id)} className="text-[11px] font-semibold text-slate-500 hover:text-red-600">Remove saved</button></div></div></div>
      </article>)}</div>}
  </main>;
}
