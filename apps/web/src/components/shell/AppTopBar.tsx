'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

const TITLES: { prefix: string; title: string }[] = [
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/admin/integrations', title: 'Integrations' },
  { prefix: '/admin/notifications', title: 'Notification defaults' },
  { prefix: '/admin/categories', title: 'Categories' },
  { prefix: '/admin/roles', title: 'Roles & permissions' },
  { prefix: '/admin/users', title: 'All members' },
  { prefix: '/admin/pending', title: 'Pending approval' },
  { prefix: '/admin/departments', title: 'Departments' },
  { prefix: '/admin/broadcasts', title: 'Broadcast management' },
  { prefix: '/admin/rota-import', title: 'Sheets import' },
  { prefix: '/admin/rota', title: 'Rota management' },
  { prefix: '/admin/discount', title: 'Discount rules' },
  { prefix: '/admin/scan-logs', title: 'Activity log' },
  { prefix: '/admin/settings', title: 'Organisation settings' },
  { prefix: '/admin', title: 'Admin overview' },
  { prefix: '/broadcasts', title: 'Broadcasts' },
  { prefix: '/calendar', title: 'Calendar' },
  { prefix: '/rota', title: 'Rota' },
  { prefix: '/discount', title: 'Discount Card' },
  { prefix: '/pending-approvals', title: 'Approvals' },
  { prefix: '/settings', title: 'Settings' },
  { prefix: '/manager', title: 'Manager' },
];

function titleForPath(pathname: string) {
  const hit = TITLES.find((t) => pathname === t.prefix || pathname.startsWith(`${t.prefix}/`));
  return hit?.title ?? 'Campsite';
}

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
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const title = useMemo(() => titleForPath(pathname), [pathname]);
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
      <h1 className="min-w-0 flex-1 font-authSerif text-xl tracking-tight text-[#121212]">{title}</h1>
      <div className="hidden max-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-0 sm:flex sm:h-9">
        <span className="text-sm text-[#9b9b9b]" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search broadcasts…"
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
