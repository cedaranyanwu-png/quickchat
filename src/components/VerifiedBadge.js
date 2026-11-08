import React from 'react';

export default function VerifiedBadge({ verified = false, isVerified = false, className = '' }) {
  const active = verified === true || isVerified === true || Number(verified) === 1 || Number(isVerified) === 1;
  if (!active) return null;
  return (
    <i
      className={`fa-solid fa-circle-check inline-block align-middle text-blue-600 text-xs ${className}`}
      role="img"
      aria-label="Verified account"
      title="Verified account"
    />
  );
}
