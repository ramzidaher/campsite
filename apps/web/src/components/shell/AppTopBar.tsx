'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

export function AppTopBar({
  userInitials,
  avatarImageSrc = null,
  onAvatarImageError,
  hasNotifDot,
}: {
  userInitials: string;
  avatarImageSrc?: string | null;
  onAvatarImageError?: () => void;
  hasNotifDot?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');

  const onSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && q.trim().length >= 2) {
        router.push(`/broadcasts`);
      }
    },
    [q, router]
  );

  return (
    <header className="sticky top-0 z-50 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#d8d8d8] bg-[#faf9f6] px-5 sm:px-7">
      <div className="min-w-0 flex-1" aria-hidden />
      <div className="hidden max-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-0 sm:flex sm:h-9">
        <span className="text-sm text-[#9b9b9b]" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search broadcasts..."
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
          aria-label="Search broadcasts"
        />
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/broadcasts"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white text-base text-[#6b6b6b] transition-colors hover:border-[#c5c5c5] hover:bg-[#f5f4f1]"
          title="Broadcasts"
        >
          🔔
          {hasNotifDot ? (
            <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full border-2 border-[#faf9f6] bg-[#E11D48]" />
          ) : null}
        </Link>
        <Link
          href="/settings"
          className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-2 border-transparent bg-[#121212] text-[13px] font-semibold text-[#faf9f6] transition-colors hover:border-[#121212]"
          title="Settings"
        >
          {avatarImageSrc ? (
            <img
              src={avatarImageSrc}
              alt=""
              className="h-full w-full object-cover"
              onError={() => onAvatarImageError?.()}
            />
          ) : (
            userInitials
          )}
        </Link>
      </div>
    </header>
  );
}
