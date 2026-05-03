'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon } from 'lucide-react';

import { ShellCommandMenu } from '@/components/shell/ShellCommandMenu';
import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { isDoNotDisturbWindowActive } from '@/lib/doNotDisturb';
import { setDndScheduleMirror } from '@/lib/dndScheduleGate';
import { emitGlobalActionFeedback } from '@/lib/ui/globalActionFeedback';
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
  uiMode = 'classic',
  onToggleUiMode,
  onOpenMobileNav,
  dndEnabled = false,
  dndStart = null,
  dndEnd = null,
  hasTenantProfile = true,
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
  onOpenMobileNav?: () => void;
  dndEnabled?: boolean;
  dndStart?: string | null;
  dndEnd?: string | null;
  hasTenantProfile?: boolean;
}) {
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const [dndOn, setDndOn] = useState(dndEnabled);
  const [dndQuietStart, setDndQuietStart] = useState(dndStart);
  const [dndQuietEnd, setDndQuietEnd] = useState(dndEnd);
  const [dndBusy, setDndBusy] = useState(false);
  const [minuteTick, setMinuteTick] = useState(0);

  useEffect(() => {
    setDndOn(dndEnabled);
    setDndQuietStart(dndStart);
    setDndQuietEnd(dndEnd);
  }, [dndEnabled, dndStart, dndEnd]);

  useEffect(() => {
    setDndScheduleMirror({
      enabled: dndOn,
      start: dndQuietStart,
      end: dndQuietEnd,
    });
  }, [dndOn, dndQuietStart, dndQuietEnd]);

  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const quietHoursActiveNow = useMemo(
    () => isDoNotDisturbWindowActive(dndOn, dndQuietStart, dndQuietEnd, new Date()),
    [dndOn, dndQuietStart, dndQuietEnd, minuteTick]
  );

  const toggleDnd = useCallback(async () => {
    if (!hasTenantProfile || dndBusy) return;
    setDndBusy(true);
    try {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const next = !dndOn;
      let start = dndQuietStart;
      let end = dndQuietEnd;
      if (next) {
        if (!start?.trim() || !end?.trim()) {
          start = '22:00';
          end = '07:00';
        }
      } else {
        start = null;
        end = null;
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          dnd_enabled: next,
          dnd_start: next ? start : null,
          dnd_end: next ? end : null,
        })
        .eq('id', u.user.id);
      if (error) {
        emitGlobalActionFeedback({ tone: 'err', message: error.message });
        return;
      }
      setDndOn(next);
      setDndQuietStart(next ? start : null);
      setDndQuietEnd(next ? end : null);
      setDndScheduleMirror({
        enabled: next,
        start: next ? start : null,
        end: next ? end : null,
      });
      await invalidateClientCaches({ scopes: ['profile-self'], shellUserIds: [u.user.id] }).catch(() => null);
      emitGlobalActionFeedback({
        tone: 'ok',
        message: next ? 'Do Not Disturb quiet hours enabled.' : 'Do Not Disturb turned off.',
      });
      router.refresh();
    } finally {
      setDndBusy(false);
    }
  }, [hasTenantProfile, dndBusy, dndOn, dndQuietStart, dndQuietEnd, router]);

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
        // Keep header on the same tone as page body for a seamless, single-canvas feel.
        background: 'var(--org-brand-bg)',
        color: 'var(--org-brand-text)',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center">
        {onOpenMobileNav ? (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-campsite-elevated text-xl leading-none text-[var(--org-brand-muted)] md:hidden"
            aria-label="Open navigation"
            onClick={onOpenMobileNav}
            style={{ borderColor: 'var(--org-brand-border)' }}
          >
            ☰
          </button>
        ) : null}
      </div>
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
          role="switch"
          aria-checked={uiMode === 'interactive'}
          onClick={onToggleUiMode}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] transition-colors hover:bg-campsite-surface"
          style={{
            borderColor: 'var(--org-brand-border)',
            color: 'var(--org-brand-muted)',
          }}
          title={`Switch to ${uiMode === 'interactive' ? 'Classic' : 'Interactive'} mode`}
          aria-label={`Switch to ${uiMode === 'interactive' ? 'Classic' : 'Interactive'} mode`}
        >
          <span style={{ color: uiMode === 'interactive' ? 'var(--org-brand-primary)' : 'var(--org-brand-muted)' }}>
            Interactive
          </span>
          <span
            aria-hidden
            className="relative box-border shrink-0 rounded-full border transition-[background-color,border-color] duration-200"
            style={{
              width: 40,
              height: 22,
              background:
                uiMode === 'interactive'
                  ? 'var(--org-brand-primary)'
                  : 'color-mix(in oklab, var(--org-brand-border) 78%, var(--org-brand-muted) 22%)',
              borderColor: 'color-mix(in oklab, var(--org-brand-text) 28%, var(--org-brand-border))',
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 box-border size-[18px] -translate-y-1/2 rounded-full transition-[left] duration-200 ease-out"
              style={{
                left: uiMode === 'interactive' ? 20 : 2,
                background: 'var(--org-brand-bg)',
                border: '1px solid color-mix(in oklab, var(--org-brand-text) 20%, transparent)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
              }}
            />
          </span>
        </button>
        {hasTenantProfile ? (
          <button
            type="button"
            aria-pressed={dndOn}
            disabled={dndBusy}
            onClick={() => void toggleDnd()}
            className={[
              'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-campsite-elevated text-base transition-colors disabled:opacity-60',
              quietHoursActiveNow
                ? 'ring-2 ring-[#059669] ring-offset-2 ring-offset-[var(--org-brand-bg)]'
                : '',
            ].join(' ')}
            style={{
              borderColor:
                dndOn && !quietHoursActiveNow ? 'var(--org-brand-primary)' : 'var(--org-brand-border)',
              color: 'var(--org-brand-muted)',
            }}
            title={
              !dndOn
                ? 'Do Not Disturb: off — enable quiet hours (set times in Settings → Notifications)'
                : quietHoursActiveNow
                  ? `Quiet hours active now (${dndQuietStart ?? '?'}–${dndQuietEnd ?? '?'}) — UI sounds muted`
                  : `Quiet hours on (${dndQuietStart ?? '?'}–${dndQuietEnd ?? '?'}) — outside quiet window; click to disable`
            }
            aria-label={
              dndOn
                ? quietHoursActiveNow
                  ? `Do Not Disturb on, quiet hours active now. Turn off.`
                  : `Do Not Disturb on, outside quiet hours. Turn off.`
                : 'Do Not Disturb off. Turn on quiet hours.'
            }
          >
            <Moon
              className="h-[1.05rem] w-[1.05rem]"
              strokeWidth={dndOn ? 2.25 : 1.75}
              style={{
                color: dndOn ? 'var(--org-brand-primary)' : 'var(--org-brand-muted)',
              }}
              aria-hidden
            />
          </button>
        ) : null}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            className={[
              'relative flex h-9 w-9 items-center justify-center rounded-lg border bg-campsite-elevated text-base transition-colors',
              quietHoursActiveNow ? 'opacity-75' : '',
            ].join(' ')}
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
            <div className="absolute right-0 top-11 z-[70] w-[320px] overflow-hidden rounded-xl border border-campsite-border bg-campsite-elevated shadow-[0_6px_22px_rgba(0,0,0,0.12)]">
              {quietHoursActiveNow ? (
                <div className="border-b border-campsite-border bg-campsite-bg px-4 py-2.5 text-[12px] leading-snug text-[#5c5c5c]">
                  <span className="font-semibold text-campsite-text">Quiet hours</span>
                  <span className="block">
                    UI sounds are muted. Reminder times: Settings → Notifications.
                  </span>
                </div>
              ) : null}
              <div className="border-b border-campsite-border px-4 py-3 text-[13px] font-semibold text-campsite-text">
                Notifications
              </div>
              {notifications.length > 0 ? (
                <div className="max-h-[360px] overflow-y-auto py-1">
                  {notifications.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      prefetch={false}
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
                <p className="px-4 py-6 text-sm text-campsite-text-secondary">No new notifications.</p>
              )}
            </div>
          ) : null}
        </div>
        <Link
          href="/settings"
          prefetch={false}
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
