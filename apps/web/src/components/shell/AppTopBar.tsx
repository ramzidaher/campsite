'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export type TopBarNotificationItem = {
  id: string;
  label: string;
  href: string;
  count: number;
};

export function AppTopBar({
  userInitials,
  avatarImageSrc = null,
  onAvatarImageError,
  notificationCount = 0,
  notifications = [],
}: {
  userInitials: string;
  avatarImageSrc?: string | null;
  onAvatarImageError?: () => void;
  /** Sum of items surfaced in the notifications menu (badge on bell). */
  notificationCount?: number;
  notifications?: TopBarNotificationItem[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const onSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && q.trim().length >= 2) {
        router.push(`/broadcasts`);
      }
    },
    [q, router]
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

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
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white text-base text-[#6b6b6b] transition-colors hover:border-[#c5c5c5] hover:bg-[#f5f4f1]"
            title="Notifications"
            aria-label={
              notificationCount > 0
                ? `Notifications (${notificationCount} pending or unread)`
                : 'Notifications'
            }
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
          >
            🔔
            {notificationCount > 0 ? (
              <span
                className="absolute -right-1 -top-1 flex min-h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none tracking-tight text-white ring-[2.5px] ring-white shadow-[0_2px_8px_rgba(225,29,72,0.55)] motion-safe:animate-pulse"
                aria-hidden
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            ) : null}
          </button>
          {notifOpen ? (
            <div className="absolute right-0 top-11 z-[70] w-[320px] overflow-hidden rounded-xl border border-[#d8d8d8] bg-white shadow-[0_6px_22px_rgba(0,0,0,0.12)]">
              <div className="border-b border-[#ececec] px-4 py-3 text-[13px] font-semibold text-[#121212]">
                Notifications
              </div>
              {notifications.length > 0 ? (
                <div className="max-h-[360px] overflow-y-auto py-1">
                  {notifications.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-[#121212] transition-colors hover:bg-[#f7f6f2]"
                    >
                      <span>{item.label}</span>
                      <span className="rounded-full bg-[#121212] px-2 py-0.5 text-[11px] font-semibold text-white">
                        {item.count > 99 ? '99+' : item.count}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-6 text-sm text-[#6b6b6b]">No new notifications.</p>
              )}
            </div>
          ) : null}
        </div>
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
