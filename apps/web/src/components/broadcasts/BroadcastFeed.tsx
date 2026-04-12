'use client';

import type { FeedRow, RawBroadcast } from '@/lib/broadcasts/feedTypes';
import { channelPillAccessibleName } from '@/lib/broadcasts/channelCopy';
import { deptTagClass } from '@/lib/broadcasts/deptTagClass';
import { enrichBroadcastRows } from '@/lib/broadcasts/enrichBroadcastRows';
import { relTime } from '@/lib/format/relTime';
import Link from 'next/link';
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect, useImperativeHandle, useMemo, useState, forwardRef } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';

export type { FeedRow } from '@/lib/broadcasts/feedTypes';

export type BroadcastFeedHandle = {
  markAllRead: () => Promise<void>;
};

type Props = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  viewerDeptIds?: Set<string>;
  deptFilter: Set<string>;
  catFilter: Set<string>;
  searchQuery: string;
  unreadOnly?: boolean;
  advancedFilter?: 'all' | 'my_departments' | 'pinned' | 'mandatory' | 'org_wide';
  sortBy?: 'newest' | 'oldest' | 'title_asc' | 'title_desc';
  /** Shown in empty-state subline when filters yield no rows */
  emptyStateCanCompose?: boolean;
  /** When true with `emptyStateCanCompose`, copy refers to drafts for approval instead of sending. */
  emptyStateDraftForApproval?: boolean;
  onUnreadChange?: (n: number) => void;
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

export const BroadcastFeed = forwardRef<BroadcastFeedHandle, Props>(function BroadcastFeed(
  {
    supabase,
    orgId,
    userId,
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
    const { data, error } = await supabase.rpc('broadcast_unread_count');
    if (!error && data !== null && data !== undefined) {
      onUnreadChange?.(typeof data === 'number' ? data : Number(data));
    }
  }, [supabase, onUnreadChange]);

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
            ? 'id,title,body,sent_at,dept_id,channel_id,team_id,created_by,is_mandatory,is_pinned,is_org_wide'
            : 'id,title,body,sent_at,dept_id,channel_id,team_id,created_by';
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

      let mode: 'plan02' | 'legacy' = useLegacy ? 'legacy' : 'plan02';
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
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length : undefined),
  });

  const rows: FeedRow[] = searchActive
    ? (searchQueryResult.data ?? [])
    : (feedInfinite.data?.pages.flatMap((p) => p.rows) ?? []);

  const displayRows = useMemo(() => {
    let next = unreadOnly ? rows.filter((r) => !r.read) : rows;

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
      const at = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      const bt = b.sent_at ? new Date(b.sent_at).getTime() : 0;
      return bt - at;
    });
    return sorted;
  }, [rows, unreadOnly, advancedFilter, sortBy, viewerDeptIds]);

  const loading = searchActive ? searchQueryResult.isLoading : feedInfinite.isLoading;
  const fetching = searchActive ? searchQueryResult.isFetching : feedInfinite.isFetching;

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, rows.length]);

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

  const preview = (md: string) =>
    md.replace(/\n+/g, ' ').replace(/[#*_`]/g, '').slice(0, 140);

  const filteredOutByUnread =
    unreadOnly && !loading && rows.length > 0 && displayRows.length === 0;

  const trulyEmpty = !loading && rows.length === 0;

  return (
    <div className="flex flex-col gap-2.5">
      {fetching && rows.length > 0 ? (
        <p className="text-xs text-[#9b9b9b]" aria-live="polite">
          Updating...
        </p>
      ) : null}

      {unreadOnly && !searchActive ? (
        <p className="text-xs text-[#9b9b9b]">
          Unread view filters loaded items. Use &ldquo;Load more&rdquo; to fetch additional broadcasts, then
          unread items from those pages will appear.
        </p>
      ) : null}

      {loading && !rows.length ? (
        <p className="text-sm text-[#6b6b6b]">Loading...</p>
      ) : trulyEmpty ? (
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
      ) : (
        <ul className="flex flex-col gap-2.5">
          {displayRows.map((b) => {
            const unread = b.read === false;
            const deptName = b.departments?.name ?? 'General';
            const channelName = b.broadcast_channels?.name ?? '';
            const teamName = b.department_teams?.name ?? '';
            const collabDepartments = b.collab_departments ?? [];
            const senderName = b.profiles?.full_name?.trim() || 'Unknown sender';
            const sentLabel = b.sent_at
              ? new Date(b.sent_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : 'Send time unavailable';
            return (
              <li key={b.id}>
                <Link
                  href={`/broadcasts/${b.id}`}
                  aria-label={
                    unread
                      ? `${b.title}. Unread broadcast. Sent ${relTime(b.sent_at)}.`
                      : `${b.title}. Read. Sent ${relTime(b.sent_at)}.`
                  }
                  className={[
                    'relative block min-h-[44px] rounded-xl border px-[18px] py-4 transition-[box-shadow,border-color]',
                    unread
                      ? 'border-sky-200 bg-sky-50/90 hover:border-sky-300 hover:shadow-[0_1px_3px_rgba(14,165,233,0.12),0_4px_12px_rgba(0,0,0,0.04)]'
                      : 'border-[#d8d8d8] bg-white hover:border-[#c8c8c8] hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]',
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
                      <div className="text-[11.5px] text-[#9b9b9b]">{relTime(b.sent_at)}</div>
                    </div>
                  </div>
                  <p className="mb-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#6b6b6b]">
                    {preview(b.body)}
                  </p>
                  <p className="mb-2.5 text-[11.5px] text-[#6b6b6b]">
                    Sent by <span className="font-medium text-[#121212]">{senderName}</span>
                    <span className="mx-1.5 text-[#9b9b9b]">·</span>
                    <span>{sentLabel}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {b.is_pinned ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
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
                      <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                        All channels
                      </span>
                    ) : channelName ? (
                      <span
                        className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]"
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
              </li>
            );
          })}
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
