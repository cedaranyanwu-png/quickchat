import React from 'react';

export default function VerifiedBadge({ verified = false, className = '' }) {
  if (!verified) return null;
  return (
    <i
      className={`fa-solid fa-circle-check text-blue-700 text-xs ${className}`}
      aria-label="Verified account"
      title="Verified account"
    />
  );
}
