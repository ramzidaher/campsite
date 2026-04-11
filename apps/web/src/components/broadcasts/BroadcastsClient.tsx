'use client';

import type { ProfileRole } from '@campsite/types';
import {
  canComposeBroadcast,
  isBroadcastApproverRole,
  isBroadcastDraftOnlyRole,
} from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useShellRefresh } from '@/hooks/useShellRefresh';
import { countPendingBroadcastApprovalsForViewer } from '@/lib/broadcasts/countPendingBroadcastApprovalsForViewer';
import { BroadcastComposer } from './BroadcastComposer';
import Link from 'next/link';
import { BroadcastFeed, type BroadcastFeedHandle } from './BroadcastFeed';
import { departmentsForBroadcast, type DeptRow } from './dept-scope';

type Profile = {
  id: string;
  org_id: string;
  role: ProfileRole;
  full_name: string;
};

type Tab = 'feed' | 'compose' | 'drafts' | 'submitted' | 'scheduled' | 'pending';

/** Toolbar filter: all, unread only, or a single department id */
type FeedPill = 'all' | 'unread' | string;
type AdvancedFeedFilter = 'all' | 'my_departments' | 'pinned' | 'mandatory' | 'org_wide';
type BroadcastSort = 'newest' | 'oldest' | 'title_asc' | 'title_desc';

const FILTER_KEY_D = 'campsite_broadcast_filter_depts';
const FILTER_KEY_C = 'campsite_broadcast_filter_cats';
const FILTER_KEY_PILL = 'campsite_broadcast_feed_pill';
const FILTER_KEY_ADV = 'campsite_broadcast_feed_adv_filter';
const FILTER_KEY_SORT = 'campsite_broadcast_feed_sort';

export function BroadcastsClient({
  profile,
  initialTab,
}: {
  profile: Profile;
  /** Deep-link from overview CTAs, e.g. `?tab=compose` or `?tab=submitted` */
  initialTab?: Tab;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const feedRef = useRef<BroadcastFeedHandle>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const r = profile.role;
    const compose = canComposeBroadcast(r);
    const showScheduled = compose && !isBroadcastDraftOnlyRole(r);
    switch (initialTab) {
      case 'compose':
        return compose ? 'compose' : 'feed';
      case 'submitted':
        return compose ? 'submitted' : 'feed';
      case 'drafts':
        return compose ? 'drafts' : 'feed';
      case 'scheduled':
        return showScheduled ? 'scheduled' : 'feed';
      case 'pending':
        return isBroadcastApproverRole(r) ? 'pending' : 'feed';
      default:
        return 'feed';
    }
  });
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [userDeptIds, setUserDeptIds] = useState<Set<string>>(new Set());
  const [managedDeptIds, setManagedDeptIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<{ id: string; name: string; dept_id: string }[]>([]);
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [feedPill, setFeedPill] = useState<FeedPill>('all');
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFeedFilter>('all');
  const [sortBy, setSortBy] = useState<BroadcastSort>('newest');
  const [hydrated, setHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const [submittedPendingCount, setSubmittedPendingCount] = useState(0);
  const [pendingApprovalQueueCount, setPendingApprovalQueueCount] = useState(0);

  useEffect(() => {
    try {
      const pillRaw = sessionStorage.getItem(FILTER_KEY_PILL);
      if (pillRaw === 'all' || pillRaw === 'unread') {
        setFeedPill(pillRaw);
        setDeptFilter(new Set());
        setCatFilter(new Set());
      } else if (pillRaw && pillRaw.length > 0) {
        setFeedPill(pillRaw);
        setDeptFilter(new Set([pillRaw]));
        setCatFilter(new Set());
      } else {
        const ds = sessionStorage.getItem(FILTER_KEY_D);
        if (ds) {
          const arr = JSON.parse(ds) as string[];
          if (arr.length === 1) {
            setFeedPill(arr[0]!);
            setDeptFilter(new Set(arr));
            setCatFilter(new Set());
            sessionStorage.setItem(FILTER_KEY_PILL, arr[0]!);
          } else if (arr.length > 1) {
            setDeptFilter(new Set());
            setCatFilter(new Set());
            setFeedPill('all');
          }
        }
      }
      const advRaw = sessionStorage.getItem(FILTER_KEY_ADV);
      if (
        advRaw === 'all' ||
        advRaw === 'my_departments' ||
        advRaw === 'pinned' ||
        advRaw === 'mandatory' ||
        advRaw === 'org_wide'
      ) {
        setAdvancedFilter(advRaw);
      }
      const sortRaw = sessionStorage.getItem(FILTER_KEY_SORT);
      if (
        sortRaw === 'newest' ||
        sortRaw === 'oldest' ||
        sortRaw === 'title_asc' ||
        sortRaw === 'title_desc'
      ) {
        setSortBy(sortRaw);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(FILTER_KEY_D, JSON.stringify([...deptFilter]));
      sessionStorage.setItem(FILTER_KEY_C, JSON.stringify([...catFilter]));
      const pillStored =
        feedPill === 'all' ? 'all' : feedPill === 'unread' ? 'unread' : feedPill;
      sessionStorage.setItem(FILTER_KEY_PILL, pillStored);
      sessionStorage.setItem(FILTER_KEY_ADV, advancedFilter);
      sessionStorage.setItem(FILTER_KEY_SORT, sortBy);
    } catch {
      /* ignore */
    }
  }, [hydrated, deptFilter, catFilter, feedPill, advancedFilter, sortBy]);

  const loadMeta = useCallback(async () => {
    const compose = canComposeBroadcast(profile.role);
    const approver = isBroadcastApproverRole(profile.role);
    const [{ data: deps }, { data: ud }, { data: dm }, submittedHead, pendingQueue] = await Promise.all([
      supabase.from('departments').select('id,org_id,name,type,is_archived').eq('org_id', profile.org_id),
      supabase.from('user_departments').select('dept_id').eq('user_id', profile.id),
      supabase.from('dept_managers').select('dept_id').eq('user_id', profile.id),
      compose
        ? supabase
            .from('broadcasts')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', profile.id)
            .eq('status', 'pending_approval')
        : Promise.resolve({ count: null as number | null }),
      approver
        ? countPendingBroadcastApprovalsForViewer(supabase, {
            userId: profile.id,
            orgId: profile.org_id,
            role: profile.role,
          })
        : Promise.resolve(0),
    ]);
    setSubmittedPendingCount(typeof submittedHead.count === 'number' ? submittedHead.count : 0);
    setPendingApprovalQueueCount(typeof pendingQueue === 'number' ? pendingQueue : 0);
    setDepartments((deps ?? []) as DeptRow[]);
    setUserDeptIds(new Set((ud ?? []).map((r) => r.dept_id as string)));
    setManagedDeptIds(new Set((dm ?? []).map((r) => r.dept_id as string)));
    const dids = (deps ?? []).map((d) => d.id as string);
    if (!dids.length) {
      setCategories([]);
      return;
    }
    const { data: cats } = await supabase
      .from('broadcast_channels')
      .select('id,name,dept_id')
      .in('dept_id', dids);
    setCategories(
      (cats ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        dept_id: c.dept_id as string,
      }))
    );
  }, [supabase, profile.org_id, profile.id, profile.role]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useShellRefresh(() => void loadMeta());

  useEffect(() => {
    if (tab === 'compose') void loadMeta();
  }, [tab, loadMeta]);

  useEffect(() => {
    if (tab === 'submitted') void loadMeta();
  }, [tab, loadMeta]);

  useEffect(() => {
    if (tab === 'pending') void loadMeta();
  }, [tab, loadMeta]);

  const draftOnlyRole = isBroadcastDraftOnlyRole(profile.role);
  useEffect(() => {
    if (draftOnlyRole && tab === 'scheduled') setTab('feed');
  }, [draftOnlyRole, tab]);

  const scopedDepts = useMemo(
    () =>
      departmentsForBroadcast(profile.role, profile.org_id, departments, userDeptIds, managedDeptIds),
    [profile.role, profile.org_id, departments, userDeptIds, managedDeptIds]
  );
  const viewerDeptIds = useMemo(() => {
    const out = new Set<string>();
    for (const id of userDeptIds) out.add(id);
    for (const id of managedDeptIds) out.add(id);
    return out;
  }, [userDeptIds, managedDeptIds]);

  /** Lowercase dept_id keys so lookups match `displayDeptId` from the departments query (UUID casing can differ). */
  const categoriesByDept = useMemo(() => {
    const m = new Map<string, { id: string; name: string; dept_id: string }[]>();
    for (const c of categories) {
      const key = String(c.dept_id).toLowerCase();
      const list = m.get(key) ?? [];
      list.push(c);
      m.set(key, list);
    }
    return m;
  }, [categories]);

  const filterChipsDept = useMemo(() => {
    return departments.filter((d) => !d.is_archived);
  }, [departments]);

  const setPillAll = () => {
    setFeedPill('all');
    setDeptFilter(new Set());
    setCatFilter(new Set());
  };

  const setPillUnread = () => {
    setFeedPill('unread');
    setDeptFilter(new Set());
    setCatFilter(new Set());
  };

  const setPillDept = (deptId: string) => {
    setFeedPill(deptId);
    setDeptFilter(new Set([deptId]));
    setCatFilter(new Set());
  };

  const pillClass = (active: boolean) =>
    [
      'rounded-full border px-3 py-1.5 text-[12.5px] font-normal transition-colors',
      active
        ? 'border-[#121212] bg-[#121212] text-[#faf9f6] hover:bg-[#2a2a2a]'
        : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:bg-[#f5f4f1] hover:text-[#121212]',
    ].join(' ');

  const tabClass = (active: boolean) =>
    [
      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
        : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:bg-[#f5f4f1]',
    ].join(' ');

  const composeAllowed = canComposeBroadcast(profile.role);
  const showScheduledTab = composeAllowed && !draftOnlyRole;
  const primaryComposeCta = composeAllowed && !draftOnlyRole;

  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t) return;
    if (t === 'feed') setTab('feed');
    else if (t === 'submitted' && composeAllowed) setTab('submitted');
    else if (t === 'compose' && composeAllowed) setTab('compose');
    else if (t === 'drafts' && composeAllowed) setTab('drafts');
    else if (t === 'scheduled' && showScheduledTab) setTab('scheduled');
    else if (t === 'pending' && isBroadcastApproverRole(profile.role)) setTab('pending');
  }, [searchParams, composeAllowed, showScheduledTab, profile.role]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 px-5 sm:px-[28px]">
        <div>
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Broadcasts</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            {draftOnlyRole
              ? 'Feed, drafts, and submit messages for approval.'
              : 'Org feed, compose, and approvals.'}
          </p>
        </div>
        {unread > 0 ? (
          <span className="rounded-full border border-[#d8d8d8] bg-white px-3 py-1 text-[12.5px] text-[#6b6b6b]">
            {unread} unread
          </span>
        ) : null}
      </div>

      <div className="mb-0 flex flex-wrap gap-2 border-b border-[#d8d8d8] px-5 pb-3 sm:px-[28px]">
        {(
          [
            ['feed', 'Feed'],
            ...(composeAllowed
              ? ([['compose', draftOnlyRole ? 'New draft' : 'Compose']] as const)
              : []),
            ...(composeAllowed ? ([['drafts', 'My drafts']] as const) : []),
            ...(composeAllowed ? ([['submitted', 'Sent for approval']] as const) : []),
            ...(showScheduledTab ? ([['scheduled', 'Scheduled']] as const) : []),
            ...(isBroadcastApproverRole(profile.role) ? ([['pending', 'Pending approval']] as const) : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as Tab)}
            className={tabClass(tab === id)}
          >
            {label}
            {id === 'feed' && unread > 0 ? (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs">{unread}</span>
            ) : null}
            {id === 'submitted' && submittedPendingCount > 0 ? (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-950">
                {submittedPendingCount}
              </span>
            ) : null}
            {id === 'pending' && pendingApprovalQueueCount > 0 ? (
              <span
                className={[
                  'ml-1 rounded-full px-1.5 text-xs font-semibold',
                  tab === 'pending'
                    ? 'bg-white/25 text-white'
                    : 'bg-amber-100 text-amber-950',
                ].join(' ')}
              >
                {pendingApprovalQueueCount > 99 ? '99+' : pendingApprovalQueueCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'feed' ? (
        <>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#d8d8d8] bg-[#faf9f6] px-7 py-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <button type="button" className={pillClass(feedPill === 'all')} onClick={setPillAll}>
                All
              </button>
              <button type="button" className={pillClass(feedPill === 'unread')} onClick={setPillUnread}>
                Unread
              </button>
              {filterChipsDept.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={pillClass(feedPill === d.id)}
                  onClick={() => setPillDept(d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                onClick={() => void feedRef.current?.markAllRead()}
              >
                Mark all as read
              </button>
              {primaryComposeCta ? (
                <button
                  type="button"
                  onClick={() => setTab('compose')}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:-translate-y-px hover:bg-[#2a2a2a] active:translate-y-0"
                >
                  ✏ New broadcast
                </button>
              ) : composeAllowed ? (
                <button
                  type="button"
                  onClick={() => setTab('compose')}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] shadow-sm transition hover:-translate-y-px hover:bg-[#2a2a2a] active:translate-y-0"
                >
                  ✏ Submit draft for approval
                </button>
              ) : null}
            </div>
          </div>

          <div className="border-b border-[#d8d8d8] bg-[#faf9f6] px-7 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[240px] flex-1 max-w-md">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9b9b9b]">
                  🔍
                </span>
                <input
                  type="search"
                  placeholder="Search broadcasts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] py-2 pl-9 pr-3 text-[13px] text-[#121212] outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
                />
              </div>
              <div className="relative">
                <select
                  value={advancedFilter}
                  onChange={(e) => setAdvancedFilter(e.target.value as AdvancedFeedFilter)}
                  className="h-9 appearance-none rounded-lg border border-[#d8d8d8] bg-white px-3 pr-9 text-[13px] text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
                  aria-label="Filter broadcasts"
                >
                  <option value="all">All broadcasts</option>
                  <option value="my_departments">My departments</option>
                  <option value="pinned">Pinned only</option>
                  <option value="mandatory">Mandatory only</option>
                  <option value="org_wide">Org-wide only</option>
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b6b]"
                >
                  ▾
                </span>
              </div>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as BroadcastSort)}
                  className="h-9 appearance-none rounded-lg border border-[#d8d8d8] bg-white px-3 pr-9 text-[13px] text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
                  aria-label="Sort broadcasts"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title_asc">Title A-Z</option>
                  <option value="title_desc">Title Z-A</option>
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b6b]"
                >
                  ▾
                </span>
              </div>
            </div>
          </div>

          <div className="px-7 py-5">
            <BroadcastFeed
              ref={feedRef}
              supabase={supabase}
              orgId={profile.org_id}
              userId={profile.id}
              viewerDeptIds={viewerDeptIds}
              deptFilter={deptFilter.size ? deptFilter : new Set()}
              catFilter={catFilter.size ? catFilter : new Set()}
              searchQuery={searchQuery}
              unreadOnly={feedPill === 'unread'}
              advancedFilter={advancedFilter}
              sortBy={sortBy}
              emptyStateCanCompose={composeAllowed}
              emptyStateDraftForApproval={draftOnlyRole}
              onUnreadChange={setUnread}
            />
          </div>
        </>
      ) : null}

      {tab === 'compose' && composeAllowed ? (
        <div className="space-y-4 px-5 py-6 sm:px-[28px]">
          <BroadcastComposer
            supabase={supabase}
            orgId={profile.org_id}
            userId={profile.id}
            canCompose={composeAllowed}
            draftOnly={draftOnlyRole}
            canPublishWithoutApproval={composeAllowed && !draftOnlyRole}
            departments={scopedDepts}
            categoriesByDept={categoriesByDept}
            onCreated={(outcome) => {
              void loadMeta();
              if (outcome === 'submitted_for_approval') setTab('submitted');
              else if (outcome === 'draft_saved') setTab('drafts');
              else setTab('feed');
            }}
          />
        </div>
      ) : null}

      {tab === 'drafts' && composeAllowed ? (
        <div className="space-y-4 px-5 py-6 sm:px-[28px]">
          <button
            type="button"
            onClick={() => setTab('compose')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a]"
          >
            {draftOnlyRole ? '✏ New draft' : '✏ New broadcast'}
          </button>
          <DraftsScheduledList supabase={supabase} userId={profile.id} mode="draft" />
        </div>
      ) : null}

      {tab === 'submitted' && composeAllowed ? (
        <div className="space-y-4 px-5 py-6 sm:px-[28px]">
          <p className="max-w-xl text-sm leading-relaxed text-[#6b6b6b]">
            These messages are waiting for an approver in your organisation. You’ll see them on the feed once
            they’re approved. If one is rejected, it won’t be sent - check with your manager if you’re unsure.
          </p>
          <MySubmissionsPendingList supabase={supabase} userId={profile.id} />
        </div>
      ) : null}

      {tab === 'scheduled' && showScheduledTab ? (
        <div className="space-y-4 px-5 py-6 sm:px-[28px]">
          <button
            type="button"
            onClick={() => setTab('compose')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a]"
          >
            ✏ New broadcast
          </button>
          <DraftsScheduledList supabase={supabase} userId={profile.id} mode="scheduled" />
        </div>
      ) : null}

      {tab === 'pending' && isBroadcastApproverRole(profile.role) ? (
        <div className="px-5 py-6 sm:px-[28px]">
          <PendingBroadcastList
            supabase={supabase}
            profile={profile}
            onDone={() => {
              void loadMeta();
              router.refresh();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MySubmissionsPendingList({
  supabase,
  userId,
}: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  userId: string;
}) {
  const [rows, setRows] = useState<{ id: string; title: string; updated_at: string | null }[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('broadcasts')
      .select('id,title,updated_at')
      .eq('created_by', userId)
      .eq('status', 'pending_approval')
      .order('updated_at', { ascending: false });
    setRows((data ?? []) as typeof rows);
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useShellRefresh(() => void load());

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[#121212]">{(r.title ?? '').trim() || 'Untitled'}</span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                Awaiting approval
              </span>
            </div>
            <p className="mt-1 text-xs text-[#6b6b6b]">
              Last updated{' '}
              {r.updated_at
                ? new Date(r.updated_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '-'}
            </p>
          </div>
          <Link
            href={`/broadcasts/${r.id}`}
            className="shrink-0 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-1.5 text-xs font-medium text-[#121212] transition hover:bg-[#f5f4f1]"
          >
            Open
          </Link>
        </li>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-[#6b6b6b]">Nothing waiting for approval right now.</p>
      ) : null}
    </ul>
  );
}

function DraftsScheduledList({
  supabase,
  userId,
  mode,
}: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  userId: string;
  mode: 'draft' | 'scheduled';
}) {
  const [rows, setRows] = useState<
    { id: string; title: string; status: string; scheduled_at: string | null; sent_at: string | null }[]
  >([]);

  const load = useCallback(async () => {
    const st = mode === 'draft' ? 'draft' : 'scheduled';
    const { data } = await supabase
      .from('broadcasts')
      .select('id,title,status,scheduled_at,sent_at')
      .eq('created_by', userId)
      .eq('status', st)
      .order('updated_at', { ascending: false });
    setRows((data ?? []) as typeof rows);
  }, [supabase, userId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useShellRefresh(() => void load());

  const cancel = async (id: string, scheduledAt: string | null) => {
    if (mode === 'scheduled' && scheduledAt) {
      const ms = new Date(scheduledAt).getTime() - Date.now();
      if (ms < 60_000) {
        alert('Cannot cancel within 1 minute of send time.');
        return;
      }
    }
    await supabase.from('broadcasts').update({ status: 'cancelled' }).eq('id', id);
    void load();
  };

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d8d8d8] bg-white px-3 py-2 text-sm"
        >
          <span className="font-medium text-[#121212]">{r.title}</span>
          {mode === 'scheduled' ? (
            <span className="text-xs text-[#6b6b6b]">
              {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '-'}
            </span>
          ) : null}
          {mode === 'scheduled' ? (
            <button
              type="button"
              className="text-xs text-[#b91c1c] hover:underline"
              onClick={() => void cancel(r.id, r.scheduled_at)}
            >
              Cancel
            </button>
          ) : null}
        </li>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-[#6b6b6b]">Nothing here.</p>
      ) : null}
    </ul>
  );
}

function PendingBroadcastList({
  supabase,
  profile,
  onDone,
}: {
  supabase: ReturnType<typeof createClient>;
  profile: Profile;
  onDone: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [rows, setRows] = useState<
    {
      id: string;
      title: string;
      body: string;
      dept_id: string;
      created_by: string;
      profiles: { full_name: string } | null;
    }[]
  >([]);

  const load = useCallback(async () => {
    let q = supabase
      .from('broadcasts')
      .select('id,title,body,dept_id,created_by')
      .eq('status', 'pending_approval')
      .eq('org_id', profile.org_id);

    if (profile.role === 'manager') {
      const { data: dm } = await supabase.from('dept_managers').select('dept_id').eq('user_id', profile.id);
      const ids = (dm ?? []).map((d) => d.dept_id as string);
      if (!ids.length) {
        setRows([]);
        return;
      }
      q = q.in('dept_id', ids);
    }

    const { data: raw } = await q;
    const list = raw ?? [];
    const authorIds = [...new Set(list.map((r) => r.created_by as string))];
    let names = new Map<string, string>();
    if (authorIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', authorIds);
      names = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));
    }
    setRows(
      list.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        body: r.body as string,
        dept_id: r.dept_id as string,
        created_by: r.created_by as string,
        profiles: { full_name: names.get(r.created_by as string) ?? 'Unknown' },
      }))
    );
  }, [supabase, profile.org_id, profile.id, profile.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useShellRefresh(() => void load());

  const decide = async (id: string, action: 'approve_send' | 'reject', note?: string) => {
    setDecideError(null);
    setBusyId(id);
    try {
      const { error } = await supabase.rpc('decide_pending_broadcast', {
        p_broadcast_id: id,
        p_action: action,
        p_rejection_note: note ?? null,
      });
      if (error) {
        setDecideError(error.message);
        return;
      }
      onDone();
      void load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {decideError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{decideError}</p>
      ) : null}
      <ul className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-xl border border-[#d8d8d8] bg-white p-4"
        >
          <div className="font-medium text-[#121212]">{r.title}</div>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-[#6b6b6b]">
            {r.body}
          </p>
          <p className="mt-2 text-xs text-[#6b6b6b]">
            From {r.profiles?.full_name ?? 'Unknown'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId === r.id}
              className="rounded-md bg-[#15803D] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#166534] disabled:opacity-50"
              onClick={() => void decide(r.id, 'approve_send')}
            >
              Approve & send
            </button>
            <button
              type="button"
              disabled={busyId === r.id}
              className="rounded-md border border-[#fecaca] px-3 py-1.5 text-sm text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
              onClick={() => {
                const note = window.prompt('Rejection note for the author?');
                if (note === null) return;
                void decide(r.id, 'reject', note || 'Rejected');
              }}
            >
              Reject
            </button>
          </div>
        </li>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-[#6b6b6b]">No pending broadcasts.</p>
      ) : null}
      </ul>
    </div>
  );
}
