'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
}: {
  userInitials: string;
  avatarImageSrc?: string | null;
  onAvatarImageError?: () => void;
  /** Sum of items surfaced in the notifications menu (badge on bell). */
  notificationCount?: number;
  notifications?: TopBarNotificationItem[];
  /** Enables "Members" as a top-bar search target. */
  showMemberSearch?: boolean;
  /** Used to scope live search results to the current organisation. */
  orgId?: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [broadcastHits, setBroadcastHits] = useState<
    { id: string; title: string; status: string; created_at: string }[]
  >([]);
  const [resourceHits, setResourceHits] = useState<
    { id: string; title: string; updated_at: string }[]
  >([]);
  const [memberHits, setMemberHits] = useState<
    { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]
  >([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const onSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && q.trim().length >= 2) {
        const firstMember = memberHits[0];
        const firstResource = resourceHits[0];
        const firstBroadcast = broadcastHits[0];
        if (firstMember && showMemberSearch) router.push(`/hr/records/${firstMember.id}`);
        else if (firstResource) router.push(`/resources/${firstResource.id}`);
        else if (firstBroadcast) router.push(`/broadcasts/${firstBroadcast.id}`);
        else router.push(`/broadcasts?q=${encodeURIComponent(q.trim())}`);
        setSearchOpen(false);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    },
    [q, router, memberHits, resourceHits, broadcastHits, showMemberSearch]
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!searchOpen || term.length < 2) {
      setSearchBusy(false);
      setBroadcastHits([]);
      setResourceHits([]);
      setMemberHits([]);
      return;
    }

    let cancelled = false;
    setSearchBusy(true);
    const timer = window.setTimeout(async () => {
      let bQuery = supabase
        .from('broadcasts')
        .select('id, title, status, created_at')
        .ilike('title', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (orgId) bQuery = bQuery.eq('org_id', orgId);

      let mQuery = supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('status', 'active')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .order('full_name', { ascending: true })
        .limit(5);
      if (orgId) mQuery = mQuery.eq('org_id', orgId);

      const resQuery = supabase.rpc('search_staff_resources', { q: term, limit_n: 5 });

      const [bRes, mRes, resRes] = await Promise.all([
        bQuery,
        showMemberSearch ? mQuery : Promise.resolve({ data: [] as never[] }),
        resQuery,
      ]);
      if (cancelled) return;
      setBroadcastHits((bRes.data ?? []) as { id: string; title: string; status: string; created_at: string }[]);
      setMemberHits(
        (mRes.data ?? []) as { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]
      );
      const rawRes = resRes.error
        ? []
        : ((resRes.data ?? []) as { id: string; title: string; updated_at: string }[]);
      setResourceHits(
        rawRes.map((r) => ({
          id: r.id,
          title: r.title,
          updated_at: r.updated_at,
        }))
      );
      setSearchBusy(false);
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, searchOpen, supabase, showMemberSearch, orgId]);

  const noHits =
    !searchBusy &&
    broadcastHits.length === 0 &&
    resourceHits.length === 0 &&
    (!showMemberSearch || memberHits.length === 0);

  return (
    <header className="sticky top-0 z-50 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#d8d8d8] bg-[#faf9f6] px-5 sm:px-7">
      <div className="min-w-0 flex-1" aria-hidden />
      <div className="relative hidden max-w-[320px] flex-1 sm:block" ref={searchRef}>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-0">
          <span className="text-sm text-[#9b9b9b]" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!searchOpen) setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={onSearchKey}
            placeholder={
              showMemberSearch
                ? 'Search members, resources, or broadcasts...'
                : 'Search resources or broadcasts...'
            }
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
            aria-label={
              showMemberSearch ? 'Search members, resources, or broadcasts' : 'Search resources or broadcasts'
            }
          />
        </div>
        {searchOpen && q.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-10 z-[70] overflow-hidden rounded-xl border border-[#d8d8d8] bg-white shadow-[0_6px_22px_rgba(0,0,0,0.12)]">
            <div className="border-b border-[#ececec] bg-[#2f3440] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90">
              Search Results
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {searchBusy ? (
                <p className="px-3 py-2 text-[12px] text-[#6b6b6b]">Searching...</p>
              ) : null}

              {showMemberSearch && memberHits.length > 0 ? (
                <>
                  <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
                    Members
                  </p>
                  {memberHits.map((m) => (
                    <Link
                      key={m.id}
                      href={`/hr/records/${m.id}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#f7f6f2]"
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8e4dc] text-[10px] font-semibold text-[#5b5b5b]">
                          {(m.full_name ?? '?')
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() ?? '')
                            .join('')}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-[#121212]">
                          {m.full_name || 'Unnamed member'}
                        </span>
                        <span className="block truncate text-[11.5px] text-[#6b6b6b]">{m.email || 'No email'}</span>
                      </span>
                    </Link>
                  ))}
                </>
              ) : null}

              {resourceHits.length > 0 ? (
                <>
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
                    Resources
                  </p>
                  {resourceHits.map((r) => (
                    <Link
                      key={r.id}
                      href={`/resources/${r.id}`}
                      onClick={() => setSearchOpen(false)}
                      className="block rounded-lg px-2.5 py-2 hover:bg-[#f7f6f2]"
                    >
                      <p className="truncate text-[12.5px] font-medium text-[#121212]">{r.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">
                        Updated {new Date(r.updated_at).toLocaleDateString()}
                      </p>
                    </Link>
                  ))}
                </>
              ) : null}

              {broadcastHits.length > 0 ? (
                <>
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
                    Broadcasts
                  </p>
                  {broadcastHits.map((b) => (
                    <Link
                      key={b.id}
                      href={`/broadcasts/${b.id}`}
                      onClick={() => setSearchOpen(false)}
                      className="block rounded-lg px-2.5 py-2 hover:bg-[#f7f6f2]"
                    >
                      <p className="truncate text-[12.5px] font-medium text-[#121212]">{b.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">
                        {b.status.replaceAll('_', ' ')} · {new Date(b.created_at).toLocaleDateString()}
                      </p>
                    </Link>
                  ))}
                </>
              ) : null}

              {noHits ? (
                <p className="px-3 py-2 text-[12px] text-[#6b6b6b]">
                  {showMemberSearch
                    ? 'No matching members, resources, or broadcasts.'
                    : 'No matching resources or broadcasts.'}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
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
