import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';

const money = (amount, currency) => `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Wallet() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    apiRequest('/wallet/summary')
      .then((data) => { if (mounted) setSummary(data); })
      .catch((err) => { if (mounted) setError(err.message || 'Could not load your earnings.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 lg:pb-8">
      <header className="sticky top-0 z-10 mb-5 border-b border-slate-200 bg-white/95 py-4 backdrop-blur">
        <h1 className="text-xl font-extrabold text-slate-900">Earnings & transactions</h1>
        <p className="mt-1 text-sm text-slate-500">Verified creator sales, separate from your points balance.</p>
      </header>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading earnings…</p> : (
        <>
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            {summary?.settlementNote || 'This view only reports verified creator sales. It does not show withdrawable funds.'}
          </div>
          <section aria-label="Earnings summary" className="mb-6 grid gap-3 sm:grid-cols-3">
            {(summary?.earnings || []).length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 sm:col-span-3">
                No verified creator-sale earnings yet.
              </div>
            ) : summary.earnings.map((item) => (
              <article key={item.currency} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Creator share · {item.currency}</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{money(item.creatorShare, item.currency)}</p>
                <p className="mt-3 text-xs text-slate-500">Gross {money(item.gross, item.currency)}</p>
                <p className="text-xs text-slate-500">Platform fee {money(item.platformFee, item.currency)}</p>
              </article>
            ))}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-900">Recent verified transactions</h2>
            </div>
            {(summary?.transactions || []).length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Transactions will appear here after provider-verified creator sales.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.transactions.map((transaction) => (
                  <li key={transaction.reference} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{transaction.type.replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-xs text-slate-500">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : 'Date unavailable'} · {transaction.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-700">+{money(transaction.creatorShare, transaction.currency)}</p>
                      <p className="text-xs text-slate-500">Gross {money(transaction.grossAmount, transaction.currency)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
