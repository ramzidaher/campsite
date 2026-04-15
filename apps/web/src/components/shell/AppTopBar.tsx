'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ShellCommandMenu } from '@/components/shell/ShellCommandMenu';
import type { ShellCommandPaletteSection } from '@/lib/shell/shellCommandPaletteSections';
import type { UiMode } from '@/lib/uiMode';

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
  showMemberSearch = false,
  orgId = null,
  orgName,
  paletteSections,
  uiMode = 'millennial',
  onToggleUiMode,
}: {
  userInitials: string;
  avatarImageSrc?: string | null;
  onAvatarImageError?: () => void;
  /** Sum of items surfaced in the notifications menu (badge on bell). */
  notificationCount?: number;
  notifications?: TopBarNotificationItem[];
  /** When true, include people (HR) in live suggestions. */
  showMemberSearch?: boolean;
  /** Used to scope live search to the current organisation. */
  orgId?: string | null;
  orgName: string;
  paletteSections: ShellCommandPaletteSection[];
  uiMode?: UiMode;
  onToggleUiMode?: () => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

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
    <header
      className="sticky top-0 z-50 flex h-[60px] shrink-0 items-center gap-3 border-b px-4 sm:gap-4 sm:px-7"
      style={{
        borderColor: 'var(--org-brand-border)',
        background: 'var(--org-brand-surface)',
        color: 'var(--org-brand-text)',
      }}
    >
      <div className="min-w-0 flex-1" aria-hidden />
      <div className="relative min-w-0 flex-1 sm:max-w-[420px]">
        <ShellCommandMenu
          sections={paletteSections}
          orgId={orgId}
          showMemberSearch={showMemberSearch}
          orgName={orgName}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleUiMode}
          className="inline-flex h-9 items-center justify-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] transition-colors hover:bg-[#f5f4f1]"
          style={{
            borderColor: 'var(--org-brand-border)',
            color: 'var(--org-brand-muted)',
          }}
          title={`Switch to ${uiMode === 'gen_z' ? 'Millennial' : 'Gen Z'} mode`}
          aria-label={`Switch to ${uiMode === 'gen_z' ? 'Millennial' : 'Gen Z'} mode`}
        >
          {uiMode === 'gen_z' ? 'Gen Z' : 'Classic'}
        </button>
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-base transition-colors"
            title="Notifications"
            aria-label={
              notificationCount > 0
                ? `Notifications (${notificationCount} pending or unread)`
                : 'Notifications'
            }
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
            style={{
              borderColor: 'var(--org-brand-border)',
              color: 'var(--org-brand-muted)',
            }}
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
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-[#f7f6f2]"
                      style={{ color: 'var(--org-brand-text)' }}
                    >
                      <span>{item.label}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: 'var(--org-brand-primary)',
                          color: 'var(--org-brand-bg)',
                        }}
                      >
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
          className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-2 border-transparent text-[13px] font-semibold transition-colors"
          style={{
            background: 'var(--org-brand-primary)',
            color: 'var(--org-brand-bg)',
            borderColor: 'var(--org-brand-primary)',
          }}
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
