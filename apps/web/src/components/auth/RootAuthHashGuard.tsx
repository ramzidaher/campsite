'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function RootAuthHashGuard() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hasSessionTokens = Boolean(hash.get('access_token') && hash.get('refresh_token'));
    if (!hasSessionTokens) return;

    const current = new URL(window.location.href);
    const next = current.searchParams.get('next');
    const callback = new URL('/auth/callback', window.location.origin);
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      callback.searchParams.set('next', next);
    }
    callback.hash = current.hash;
    window.location.replace(callback.toString());
  }, [searchParams]);

  return null;
}
