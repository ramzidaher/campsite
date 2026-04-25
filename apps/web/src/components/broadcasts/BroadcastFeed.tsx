'use client';

import type { FeedRow, RawBroadcast } from '@/lib/broadcasts/feedTypes';
import { channelPillAccessibleName } from '@/lib/broadcasts/channelCopy';
import { deptTagClass } from '@/lib/broadcasts/deptTagClass';
import { enrichBroadcastRows } from '@/lib/broadcasts/enrichBroadcastRows';
import { broadcastFirstImage, broadcastMarkdownPreview } from '@/lib/broadcasts/markdownPreview';
import { relTime } from '@/lib/format/relTime';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Pin } from 'lucide-react';
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  BROADCAST_LAST_VIEWED_ID_KEY,
  parseBroadcastFeedNavigation,
} from '@/lib/broadcasts/parseBroadcastFeedNavigation';
import type { ShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { SHELL_BADGE_COUNTS_QUERY_KEY } from '@/hooks/useShellBadgeCounts';

export type { FeedRow } from '@/lib/broadcasts/feedTypes';

export type BroadcastFeedHandle = {
  markAllRead: () => Promise<void>;
};

type Props = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  initialRows?: FeedRow[];
  viewerDeptIds?: Set<string>;
  deptFilter: Set<string>;
  catFilter: Set<string>;
  searchQuery: string;
  unreadOnly?: boolean;
  advancedFilter?:
    | 'all'
    | 'unread_only'
    | 'my_departments'
    | 'pinned'
    | 'mandatory'
    | 'org_wide';
  sortBy?: 'newest' | 'oldest' | 'title_asc' | 'title_desc';
  /** Shown in empty-state subline when filters yield no rows */
  emptyStateCanCompose?: boolean;
  /** When true with `emptyStateCanCompose`, copy refers to drafts for approval instead of sending. */
  emptyStateDraftForApproval?: boolean;
  onUnreadChange?: (n: number) => void;
  /** Alternate layout: classic cards vs grouped-by-day timeline. */
  feedLayout?: 'stream' | 'timeline';
};

const pageSize = 20;

/** Persisted so we skip Plan 02 REST shape after first failure (avoids a 400 on every refresh). */
const BROADCAST_FEED_LEGACY_LS = 'campsite.bf.feed_legacy_select';

function readBroadcastFeedLegacyLs(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(BROADCAST_FEED_LEGACY_LS) === '1';
  } catch {
    return false;
  }
}

function persistBroadcastFeedLegacyLs() {
  try {
    window.localStorage.setItem(BROADCAST_FEED_LEGACY_LS, '1');
  } catch {
    /* quota / private mode */
  }
}

function clearBroadcastFeedLegacyLs() {
  try {
    window.localStorage.removeItem(BROADCAST_FEED_LEGACY_LS);
  } catch {
    /* */
  }
}

function forceLegacyBroadcastFeedSelect(): boolean {
  return process.env.NEXT_PUBLIC_BROADCAST_FEED_LEGACY === '1';
}

/** In-memory hint for the session (Plan 02 columns + pin ordering unavailable). */
let broadcastFeedApiMode: 'plan02' | 'legacy' | null = null;

type FeedPage = { rows: FeedRow[]; hasMore: boolean };

function FeedNavigationStrip({
  supabase,
  anchorBroadcastId,
  searchActive,
  timelineMode = false,
}: {
  supabase: SupabaseClient;
  anchorBroadcastId: string | null;
  searchActive: boolean;
  timelineMode?: boolean;
}) {
  const router = useRouter();
  const navQuery = useQuery({
    queryKey: ['broadcast-feed-navigation', anchorBroadcastId],
    enabled: Boolean(anchorBroadcastId) && !searchActive,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('broadcast_feed_navigation', {
        p_broadcast_id: anchorBroadcastId!,
      });
      if (error) throw error;
      return parseBroadcastFeedNavigation(data);
    },
  });
  const nav = navQuery.data;
  if (searchActive || !anchorBroadcastId) return null;
  if (navQuery.isLoading) {
    return (
      <div
        className="mb-3 h-11 w-full max-w-md animate-pulse rounded-full bg-[#ebe8e3]/80 sm:ml-auto sm:max-w-none"
        aria-hidden
      />
    );
  }
  if (!nav) return null;
  return (
    <div
      className={[
        'mb-3 flex flex-wrap items-center justify-between gap-2',
        timelineMode ? '' : 'border-b border-[#e4e4e4] pb-3',
      ].join(' ')}
    >
      <p className="text-[12px] text-[#6b6b6b]">Open any card below, or step through with arrows.</p>
      <div
        className="inline-flex items-center gap-1 rounded-full border border-[#121212]/15 bg-white px-2 py-1 text-[13px] text-[#121212] shadow-sm"
        aria-label={`Broadcast ${nav.index} of ${nav.total}`}
      >
        <span className="px-1.5 text-[#6b6b6b]">
          {nav.index} of {nav.total}
        </span>
        <button
          type="button"
          disabled={!nav.prevId}
          onClick={() => nav.prevId && router.push(`/broadcasts/${nav.prevId}`)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#121212] transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Previous broadcast"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={!nav.nextId}
          onClick={() => nav.nextId && router.push(`/broadcasts/${nav.nextId}`)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#121212] transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Next broadcast"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function FeedBroadcastCard({
  b,
  bodyPreview,
  variant = 'default',
  timelineHighlight = false,
}: {
  b: FeedRow;
  bodyPreview: (md: string) => string;
  /** Timeline layout: relative time sits under the card; connector is outside. */
  variant?: 'default' | 'timeline';
  /** Newest item in horizontal timeline (left column): soft accent border. */
  timelineHighlight?: boolean;
}) {
  const unread = b.read === false;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [showQuickPreview, setShowQuickPreview] = useState(false);
  const deptName = b.departments?.name ?? 'General';
  const channelName = b.broadcast_channels?.name ?? '';
  const teamName = b.department_teams?.name ?? '';
  const collabDepartments = b.collab_departments ?? [];
  const senderName = b.profiles?.full_name?.trim() || 'Unknown sender';
  const previewImage = broadcastFirstImage(b.body);
  const previewText = bodyPreview(b.body);
  const sentLabel = b.sent_at
    ? new Date(b.sent_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Send time unavailable';

  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const startLongPressPreview = () => {
    if (variant !== 'timeline') return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setShowQuickPreview(true);
    }, 260);
  };

  const endLongPressPreview = () => {
    clearLongPressTimer();
    if (!longPressTriggeredRef.current) return;
    setShowQuickPreview(false);
    window.setTimeout(() => {
      longPressTriggeredRef.current = false;
    }, 0);
  };
  return (
    <>
      <Link
        href={`/broadcasts/${b.id}`}
        aria-label={
          unread
            ? `${b.title}. Unread broadcast. Sent ${relTime(b.sent_at)}.`
            : `${b.title}. Read. Sent ${relTime(b.sent_at)}.`
        }
        onPointerDown={startLongPressPreview}
        onPointerUp={endLongPressPreview}
        onPointerCancel={endLongPressPreview}
        onPointerLeave={endLongPressPreview}
        onClick={(e) => {
          if (!longPressTriggeredRef.current) return;
          e.preventDefault();
          e.stopPropagation();
          longPressTriggeredRef.current = false;
        }}
        className={[
          'relative block min-h-[44px] rounded-xl border px-[18px] py-4 transition-[box-shadow,border-color]',
          unread
            ? 'border-sky-200 bg-sky-50/90 hover:border-sky-300 hover:shadow-[0_1px_3px_rgba(14,165,233,0.12),0_4px_12px_rgba(0,0,0,0.04)]'
            : variant === 'timeline' && timelineHighlight
              ? 'border-violet-400 bg-[#faf8ff] hover:border-violet-500 hover:shadow-[0_1px_3px_rgba(91,33,182,0.08),0_4px_12px_rgba(0,0,0,0.04)]'
              : 'border-[#e8e8e8] bg-white hover:border-[#d4d4d4] hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]',
          unread
            ? "overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:rounded-l-xl before:bg-sky-600 before:content-['']"
            : '',
        ].join(' ')}
      >
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div
          className={[
            'min-w-0 flex-1 text-sm leading-snug text-[#121212]',
            unread ? 'font-semibold' : 'font-medium',
          ].join(' ')}
        >
          {b.title}
        </div>
        <div className="mt-0.5 flex shrink-0 items-center gap-2">
          {unread ? (
            <span className="inline-flex items-center rounded-full border border-sky-300 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
              Unread
            </span>
          ) : null}
          {variant === 'default' ? (
            <div className="text-[11.5px] text-[#9b9b9b]">{relTime(b.sent_at)}</div>
          ) : null}
        </div>
      </div>
      {previewImage ? (
        <div className="mb-2.5 overflow-hidden rounded-lg border border-[#e8e8e8] bg-[#f5f4f1]">
          <img
            src={previewImage.url}
            alt={previewImage.alt || 'Broadcast image preview'}
            className="h-28 w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        </div>
      ) : null}
      <p className="mb-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#6b6b6b]">{previewText}</p>
      <p className="mb-2.5 text-[11.5px] text-[#6b6b6b]">
        Sent by <span className="font-medium text-[#121212]">{senderName}</span>
        <span className="mx-1.5 text-[#9b9b9b]">·</span>
        <span>{sentLabel}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {b.is_pinned ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
            <Pin className="h-3 w-3 shrink-0 text-amber-800" strokeWidth={2.25} aria-hidden />
            Pinned
          </span>
        ) : null}
        {b.is_mandatory ? (
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-900">
            Mandatory
          </span>
        ) : null}
        {b.is_org_wide ? (
          <span className="inline-flex items-center rounded-full border border-[#e7e5e4] bg-[#f5f5f4] px-2.5 py-0.5 text-[11px] font-medium text-[#44403c]">
            Org-wide
          </span>
        ) : null}
        <span
          className={[
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
            deptTagClass(deptName),
          ].join(' ')}
        >
          {deptName}
        </span>
        {b.is_org_wide ? (
          <span className="inline-flex items-center rounded-full border border-[#e8e8e8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
            All channels
          </span>
        ) : channelName ? (
          <span
            className="inline-flex items-center rounded-full border border-[#e8e8e8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]"
            title={channelPillAccessibleName(channelName)}
            aria-label={channelPillAccessibleName(channelName)}
          >
            {channelName}
          </span>
        ) : null}
        {teamName ? (
          <span className="inline-flex items-center rounded-full border border-[#e9d5ff] bg-[#faf5ff] px-2.5 py-0.5 text-[11px] font-medium text-[#6b21a8]">
            {teamName}
          </span>
        ) : null}
        {collabDepartments.map((d) => (
          <span
            key={`${b.id}-collab-${d.id}`}
            className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-0.5 text-[11px] font-medium text-[#1d4ed8]"
          >
            {d.name}
          </span>
        ))}
      </div>
      </Link>
      {showQuickPreview ? (
        <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center bg-black/15 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white shadow-[0_24px_60px_rgba(18,18,18,0.22)]">
            <div className="relative h-36 w-full bg-[#f5f4f1]">
              {b.cover_image_url ? (
                <img
                  src={b.cover_image_url}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-r from-[#f5f4f1] via-[#efece7] to-[#f5f4f1]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
              <p className="absolute bottom-3 left-3 right-3 line-clamp-2 text-sm font-semibold text-white">
                {b.title}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="line-clamp-2 text-[13px] leading-relaxed text-[#6b6b6b]">{bodyPreview(b.body)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Horizontal scroll: each broadcast is its own column so same-day items stay side-by-side with clear gaps. */
function BroadcastTimelineStrip({
  rows,
  bodyPreview,
}: {
  rows: FeedRow[];
  bodyPreview: (md: string) => string;
}) {
  const n = rows.length;
  if (n === 0) return null;
  return (
    <div className="snap-x snap-mandatory overflow-x-auto scroll-pl-3 scroll-pr-3 [-webkit-overflow-scrolling:touch] sm:snap-none">
      <div className="relative w-max max-w-none">
        <div className="pointer-events-none absolute left-1 right-1 top-[11px] h-px bg-[#dcdcdc]" aria-hidden />
        <ul
          role="list"
          className="relative flex w-max max-w-none gap-6 px-1 py-1 sm:gap-8"
        >
          {rows.map((b, i) => (
            <li
              key={b.id}
              className="flex w-[min(300px,calc(100vw-2.5rem))] shrink-0 snap-center flex-col items-stretch sm:w-[300px]"
            >
              <div className="flex h-5 w-full items-center justify-center">
                <span
                  className={[
                    'z-[1] h-2.5 w-2.5 shrink-0 rounded-full',
                    i === 0
                      ? 'bg-violet-600 shadow-[0_0_0_3px_rgba(124,58,237,0.18)]'
                      : 'border-2 border-[#b0b0b0] bg-white',
                  ].join(' ')}
                  aria-hidden
                />
              </div>
              <div className="mx-auto h-4 w-px shrink-0 bg-[#dcdcdc]" aria-hidden />
              <FeedBroadcastCard
                b={b}
                bodyPreview={bodyPreview}
                variant="timeline"
                timelineHighlight={i === 0}
              />
              <p className="mt-2.5 text-center text-[12px] tabular-nums text-[#9b9b9b]">{relTime(b.sent_at)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const BroadcastFeed = forwardRef<BroadcastFeedHandle, Props>(function BroadcastFeed(
  {
    supabase,
    orgId,
    userId,
    initialRows = [],
    viewerDeptIds = new Set(),
    deptFilter,
    catFilter,
    searchQuery,
    unreadOnly = false,
    advancedFilter = 'all',
    sortBy = 'newest',
    emptyStateCanCompose = false,
    emptyStateDraftForApproval = false,
    onUnreadChange,
    feedLayout = 'stream',
  },
  ref
) {
  const queryClient = useQueryClient();
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  useEffect(() => {
    const delay = searchQuery.trim().length >= 2 ? 300 : 0;
    const t = setTimeout(() => setDebouncedSearch(searchQuery), delay);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const deptKey = useMemo(() => [...deptFilter].sort().join('|'), [deptFilter]);
  const catKey = useMemo(() => [...catFilter].sort().join('|'), [catFilter]);
  const searchActive = debouncedSearch.trim().length >= 2;
  const qTrim = debouncedSearch.trim();

  const refreshUnread = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: SHELL_BADGE_COUNTS_QUERY_KEY });
    const d = queryClient.getQueryData<ShellBadgeCounts>(SHELL_BADGE_COUNTS_QUERY_KEY);
    if (d) onUnreadChange?.(d.broadcast_unread);
  }, [queryClient, onUnreadChange]);

  const searchQueryResult = useQuery({
    queryKey: ['broadcast-feed-search', orgId, userId, qTrim, deptKey, catKey],
    enabled: searchActive,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_broadcasts', {
        q: qTrim,
        limit_n: 50,
      });
      if (error) throw error;
      const raw = (data ?? []) as RawBroadcast[];
      return enrichBroadcastRows(supabase, userId, raw);
    },
  });

  const feedInfinite = useInfiniteQuery<
    FeedPage,
    Error,
    InfiniteData<FeedPage>,
    readonly string[],
    number
  >({
    queryKey: ['broadcast-feed', orgId, userId, deptKey, catKey] as const,
    enabled: !searchActive,
    initialPageParam: 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const run = async (mode: 'plan02' | 'legacy') => {
        const select =
          mode === 'plan02'
            ? 'id,title,body,sent_at,dept_id,channel_id,team_id,created_by,is_mandatory,is_pinned,is_org_wide,cover_image_url'
            : 'id,title,body,sent_at,dept_id,channel_id,team_id,created_by,cover_image_url';
        let q = supabase
          .from('broadcasts')
          .select(select)
          .eq('org_id', orgId)
          .eq('status', 'sent');
        if (mode === 'plan02') {
          q = q.order('is_pinned', { ascending: false }).order('sent_at', { ascending: false });
        } else {
          q = q.order('sent_at', { ascending: false });
        }
        if (deptFilter.size) q = q.in('dept_id', [...deptFilter]);
        if (catFilter.size) q = q.in('channel_id', [...catFilter]);
        return q.range(from, to);
      };

      const useLegacy =
        forceLegacyBroadcastFeedSelect() ||
        broadcastFeedApiMode === 'legacy' ||
        readBroadcastFeedLegacyLs();

      const mode: 'plan02' | 'legacy' = useLegacy ? 'legacy' : 'plan02';
      let { data, error } = await run(mode);

      if (error && mode === 'plan02') {
        const legacyResult = await run('legacy');
        if (!legacyResult.error) {
          broadcastFeedApiMode = 'legacy';
          persistBroadcastFeedLegacyLs();
          data = legacyResult.data;
          error = null;
        }
      } else if (!error) {
        broadcastFeedApiMode = mode;
        if (mode === 'plan02') clearBroadcastFeedLegacyLs();
      }

      if (error) throw error;
      const raw = (data ?? []) as unknown as RawBroadcast[];
      const rows = await enrichBroadcastRows(supabase, userId, raw);
      return { rows, hasMore: raw.length === pageSize };
    },
    initialData:
      initialRows.length > 0
        ? {
            pages: [{ rows: initialRows, hasMore: initialRows.length === pageSize }],
            pageParams: [0],
          }
        : undefined,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length : undefined),
  });

  const rows: FeedRow[] = searchActive
    ? (searchQueryResult.data ?? [])
    : (feedInfinite.data?.pages.flatMap((p) => p.rows) ?? []);

  /** Search RPC is org-wide; narrow to selected department client-side when needed. */
  const rowsAfterDept = useMemo(() => {
    if (!searchActive || !deptFilter.size) return rows;
    return rows.filter((r) => deptFilter.has(r.dept_id));
  }, [rows, searchActive, deptFilter]);

  const displayRows = useMemo(() => {
    const unreadActive = unreadOnly || advancedFilter === 'unread_only';
    let next = unreadActive ? rowsAfterDept.filter((r) => !r.read) : rowsAfterDept;

    if (advancedFilter === 'my_departments') {
      next = next.filter((r) => {
        if (viewerDeptIds.has(r.dept_id)) return true;
        return (r.collab_departments ?? []).some((d) => viewerDeptIds.has(d.id));
      });
    } else if (advancedFilter === 'pinned') {
      next = next.filter((r) => r.is_pinned);
    } else if (advancedFilter === 'mandatory') {
      next = next.filter((r) => r.is_mandatory);
    } else if (advancedFilter === 'org_wide') {
      next = next.filter((r) => r.is_org_wide);
    }

    const sorted = [...next];
    if (sortBy === 'oldest') {
      sorted.sort((a, b) => {
        const at = a.sent_at ? new Date(a.sent_at).getTime() : 0;
        const bt = b.sent_at ? new Date(b.sent_at).getTime() : 0;
        return at - bt;
      });
      return sorted;
    }
    if (sortBy === 'title_asc') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      return sorted;
    }
    if (sortBy === 'title_desc') {
      sorted.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }));
      return sorted;
    }
    sorted.sort((a, b) => {
      const ap = a.is_pinned ? 1 : 0;
      const bp = b.is_pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      const bt = b.sent_at ? new Date(b.sent_at).getTime() : 0;
      return bt - at;
    });
    return sorted;
  }, [rowsAfterDept, unreadOnly, advancedFilter, sortBy, viewerDeptIds]);

  const [sessionAnchor, setSessionAnchor] = useState<string | null>(null);
  useEffect(() => {
    try {
      const s = sessionStorage.getItem(BROADCAST_LAST_VIEWED_ID_KEY);
      setSessionAnchor(s && s.length > 0 ? s : null);
    } catch {
      setSessionAnchor(null);
    }
  }, []);

  const anchorBroadcastId = useMemo(
    () => sessionAnchor ?? displayRows[0]?.id ?? null,
    [sessionAnchor, displayRows],
  );

  const loading = searchActive ? searchQueryResult.isLoading : feedInfinite.isLoading;
  const fetching = searchActive ? searchQueryResult.isFetching : feedInfinite.isFetching;

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, rowsAfterDept.length]);

  const markAllRead = useCallback(async () => {
    await supabase.rpc('broadcast_mark_all_read');
    queryClient.setQueriesData(
      {
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'broadcast-feed',
      },
      (old: unknown) => {
        if (!old || typeof old !== 'object' || !('pages' in old)) return old;
        const o = old as { pages: { rows: FeedRow[]; hasMore: boolean }[] };
        return {
          ...o,
          pages: o.pages.map((p) => ({
            ...p,
            rows: p.rows.map((r) => ({ ...r, read: true })),
          })),
        };
      }
    );
    queryClient.setQueriesData(
      {
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'broadcast-feed-search',
      },
      (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return (old as FeedRow[]).map((r) => ({ ...r, read: true }));
      }
    );
    void refreshUnread();
  }, [supabase, queryClient, refreshUnread]);

  useImperativeHandle(ref, () => ({ markAllRead }), [markAllRead]);

  const preview = (md: string) => broadcastMarkdownPreview(md, 140);

  const unreadFilterActive = unreadOnly || advancedFilter === 'unread_only';
  const filteredOutByUnread =
    unreadFilterActive && !loading && rowsAfterDept.length > 0 && displayRows.length === 0;

  const trulyEmpty = !loading && rowsAfterDept.length === 0;

  const showFeedNavStrip = false;

  return (
    <div className="flex flex-col gap-2.5">
      {showFeedNavStrip ? (
        <FeedNavigationStrip
          supabase={supabase}
          anchorBroadcastId={anchorBroadcastId}
          searchActive={searchActive}
          timelineMode={feedLayout === 'timeline'}
        />
      ) : null}
      {fetching && rows.length > 0 ? (
        <p className="text-xs text-[#9b9b9b]" aria-live="polite">
          Updating...
        </p>
      ) : null}

      {unreadFilterActive && !searchActive ? (
        <p className="text-xs text-[#9b9b9b]">
          Unread view filters loaded items. Use &ldquo;Load more&rdquo; to fetch additional broadcasts, then
          unread items from those pages will appear.
        </p>
      ) : null}

      {loading && !rows.length ? null : trulyEmpty ? (
        <div className="py-12 text-center text-[#9b9b9b]">
          <div className="mb-3 text-4xl" aria-hidden>
            📭
          </div>
          <div className="text-[15px] font-medium text-[#6b6b6b]">No broadcasts here</div>
          <p className="mt-1.5 text-[13px]">
            {emptyStateCanCompose
              ? emptyStateDraftForApproval
                ? 'Try a different filter or create a draft for approval.'
                : 'Try a different filter or compose a new broadcast.'
              : 'Try a different filter.'}
          </p>
        </div>
      ) : filteredOutByUnread ? (
        <div className="py-12 text-center text-[#9b9b9b]">
          <div className="mb-3 text-4xl" aria-hidden>
            📭
          </div>
          <div className="text-[15px] font-medium text-[#6b6b6b]">No unread in loaded items</div>
          <p className="mt-1.5 text-[13px]">Load more below or switch to All.</p>
        </div>
      ) : feedLayout === 'timeline' ? (
        <BroadcastTimelineStrip rows={displayRows} bodyPreview={preview} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {displayRows.map((b) => (
            <li key={b.id}>
              <FeedBroadcastCard b={b} bodyPreview={preview} />
            </li>
          ))}
        </ul>
      )}

      {!searchActive && feedInfinite.hasNextPage && !feedInfinite.isFetchingNextPage ? (
        <button
          type="button"
          className="min-h-[44px] self-start text-sm text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
          onClick={() => void feedInfinite.fetchNextPage()}
        >
          Load more
        </button>
      ) : null}
      {!searchActive && feedInfinite.isFetchingNextPage ? (
        <p className="text-sm text-[#6b6b6b]">Loading more...</p>
      ) : null}
    </div>
  );
});
