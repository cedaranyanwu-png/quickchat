import React, { useState } from 'react';
import { resolveMediaUrl } from '../api';

// User photos come from profile data. Initials are only the fallback when an
// account has not uploaded an avatar yet.
export default function Avatar({ name = '', picture, size = 36, className = '' }) {
  const [failedPicture, setFailedPicture] = useState(null);
  const pictureUrl = resolveMediaUrl(picture);
  const initials = String(name).trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return pictureUrl && failedPicture !== pictureUrl ? (
    <img
      src={pictureUrl}
      alt={name ? `${name} profile` : 'Profile'}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailedPicture(pictureUrl)}
    />
  ) : (
    <div
      className={`bg-blue-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.35) }}
      aria-label={name || 'Profile'}
    >
      {initials || '?'}
    </div>
  );
}
