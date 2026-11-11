import React from 'react';

export default function FoundingBadge({ foundingMember = false, className = '' }) {
  const active = foundingMember === true || Number(foundingMember) === 1;
  if (!active) return null;
  return (
    <span
      className={`ml-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-100 px-2 py-0.5 align-middle text-[9px] font-extrabold uppercase tracking-wide text-amber-800 shadow-sm ${className}`}
      role="img"
      aria-label="QuickChat founding member"
      title="QuickChat Founding Member"
    >
      <i className="fa-solid fa-award text-amber-600" aria-hidden="true" />
      Founding
    </span>
  );
}
