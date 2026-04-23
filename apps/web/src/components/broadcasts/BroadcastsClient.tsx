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

import { ExperienceLensBar } from '@/components/experience/ExperienceLensBar';
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

type WorkspaceView = 'feed' | 'drafts' | 'submitted' | 'scheduled';

type AdvancedFeedFilter =
  | 'all'
  | 'unread_only'
  | 'my_departments'
  | 'pinned'
  | 'mandatory'
  | 'org_wide';
type BroadcastSort = 'newest' | 'oldest' | 'title_asc' | 'title_desc';

const FILTER_KEY_ADV = 'campsite_broadcast_feed_adv_filter';
const FILTER_KEY_SORT = 'campsite_broadcast_feed_sort';
const FILTER_KEY_DEPT = 'campsite_broadcast_feed_dept_id';
const FEED_LAYOUT_KEY = 'campsite_broadcast_feed_layout';

type FeedLayoutLens = 'stream' | 'timeline';

export function BroadcastsClient({
  profile,
  initialWorkspace,
  initialCompose,
}: {
  profile: Profile;
  initialWorkspace?: WorkspaceView;
  /** Open composer from `?compose=1` */
  initialCompose?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const feedRef = useRef<BroadcastFeedHandle>(null);
  const myPendingIdsRef = useRef<Set<string>>(new Set());

  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => {
    const compose = canComposeBroadcast(profile.role);
    const showScheduled = compose && !isBroadcastDraftOnlyRole(profile.role);
    if (initialWorkspace === 'drafts' && compose) return 'drafts';
    if (initialWorkspace === 'submitted' && compose) return 'submitted';
    if (initialWorkspace === 'scheduled' && showScheduled) return 'scheduled';
    return 'feed';
  });

  const [composeOpen, setComposeOpen] = useState(() => Boolean(initialCompose));
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [userDeptIds, setUserDeptIds] = useState<Set<string>>(new Set());
  const [managedDeptIds, setManagedDeptIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<{ id: string; name: string; dept_id: string }[]>([]);
  const emptyFilterSet = useMemo(() => new Set<string>(), []);
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFeedFilter>('all');
  const [sortBy, setSortBy] = useState<BroadcastSort>('newest');
  const [feedLayout, setFeedLayout] = useState<FeedLayoutLens>('stream');
  const [hydrated, setHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** Empty string = all departments (scoped to what you can target in broadcasts). */
  const [feedDepartmentId, setFeedDepartmentId] = useState('');
  const [unread, setUnread] = useState(0);
  const [submittedPendingCount, setSubmittedPendingCount] = useState(0);
  const [pendingApprovalQueueCount, setPendingApprovalQueueCount] = useState(0);

  useEffect(() => {
    try {
      const layoutRaw = sessionStorage.getItem(FEED_LAYOUT_KEY);
      if (layoutRaw === 'stream' || layoutRaw === 'timeline') {
        setFeedLayout(layoutRaw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const advRaw = sessionStorage.getItem(FILTER_KEY_ADV);
      if (
        advRaw === 'all' ||
        advRaw === 'unread_only' ||
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
      const deptRaw = sessionStorage.getItem(FILTER_KEY_DEPT);
      if (typeof deptRaw === 'string' && deptRaw.length > 0) {
        setFeedDepartmentId(deptRaw);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(FILTER_KEY_ADV, advancedFilter);
      sessionStorage.setItem(FILTER_KEY_SORT, sortBy);
      if (feedDepartmentId) {
        sessionStorage.setItem(FILTER_KEY_DEPT, feedDepartmentId);
      } else {
        sessionStorage.removeItem(FILTER_KEY_DEPT);
      }
    } catch {
      /* ignore */
    }
  }, [hydrated, advancedFilter, sortBy, feedDepartmentId]);

  const loadMeta = useCallback(async () => {
    const compose = canComposeBroadcast(profile.role);
    const approver = isBroadcastApproverRole(profile.role);
    const [{ data: deps }, { data: ud }, { data: dm }, myPendingRes, pendingQueue] = await Promise.all([
      supabase.from('departments').select('id,org_id,name,type,is_archived').eq('org_id', profile.org_id),
      supabase.from('user_departments').select('dept_id').eq('user_id', profile.id),
      supabase.from('dept_managers').select('dept_id').eq('user_id', profile.id),
      compose
        ? supabase
            .from('broadcasts')
            .select('id')
            .eq('created_by', profile.id)
            .eq('status', 'pending_approval')
        : Promise.resolve({ data: null as { id: string }[] | null }),
      approver
        ? countPendingBroadcastApprovalsForViewer(supabase, {
            userId: profile.id,
            orgId: profile.org_id,
            role: profile.role,
          })
        : Promise.resolve(0),
    ]);
    const myPending = (myPendingRes.data ?? []) as { id: string }[];
    setSubmittedPendingCount(myPending.length);
    myPendingIdsRef.current = new Set(myPending.map((r) => r.id));
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
    if (workspaceView === 'submitted' || composeOpen) void loadMeta();
  }, [workspaceView, composeOpen, loadMeta]);

  const [approvalToast, setApprovalToast] = useState<string | null>(null);
  useEffect(() => {
    if (!approvalToast) return;
    const timer = window.setTimeout(() => setApprovalToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [approvalToast]);

  useEffect(() => {
    const ch = supabase
      .channel(`broadcast-author-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'broadcasts',
          filter: `created_by=eq.${profile.id}`,
        },
        (payload) => {
          const rec = payload.new as {
            id: string;
            status: string;
            title?: string | null;
            scheduled_at?: string | null;
          };
          if (!myPendingIdsRef.current.has(rec.id)) return;
          if (rec.status === 'pending_approval') return;
          myPendingIdsRef.current.delete(rec.id);
          const title = (rec.title ?? '').trim() || 'Your broadcast';
          if (rec.status === 'sent') {
            setApprovalToast(`Approved: "${title}" has been published.`);
          } else if (rec.status === 'scheduled') {
            setApprovalToast(`Approved: "${title}" is scheduled to send.`);
          } else if (rec.status === 'draft') {
            setApprovalToast(`Not approved — "${title}" was returned to your drafts.`);
          }
          void loadMeta();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, profile.id, loadMeta]);

  const draftOnlyRole = isBroadcastDraftOnlyRole(profile.role);
  useEffect(() => {
    if (draftOnlyRole && workspaceView === 'scheduled') {
      setWorkspaceView('feed');
      router.replace('/broadcasts', { scroll: false });
    }
  }, [draftOnlyRole, workspaceView, router]);

  const scopedDepts = useMemo(
    () =>
      departmentsForBroadcast(profile.role, profile.org_id, departments, userDeptIds, managedDeptIds),
    [profile.role, profile.org_id, departments, userDeptIds, managedDeptIds]
  );

  const feedDeptsSorted = useMemo(
    () => [...scopedDepts].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [scopedDepts]
  );

  useEffect(() => {
    if (!feedDepartmentId) return;
    if (!scopedDepts.some((d) => d.id === feedDepartmentId)) {
      setFeedDepartmentId('');
    }
  }, [scopedDepts, feedDepartmentId]);

  const feedDeptFilterSet = useMemo(
    () => (feedDepartmentId ? new Set([feedDepartmentId]) : emptyFilterSet),
    [feedDepartmentId, emptyFilterSet]
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

  const composeAllowed = canComposeBroadcast(profile.role);
  const showScheduledTab = composeAllowed && !draftOnlyRole;
  const primaryComposeCta = composeAllowed && !draftOnlyRole;
  const approverRole = isBroadcastApproverRole(profile.role);
  const submittedInboxBadge =
    submittedPendingCount + (approverRole ? pendingApprovalQueueCount : 0);

  const goWorkspace = useCallback(
    (v: WorkspaceView) => {
      setWorkspaceView(v);
      setComposeOpen(false);
      const p = new URLSearchParams();
      if (v !== 'feed') p.set('tab', v);
      const qs = p.toString();
      router.replace(qs ? `/broadcasts?${qs}` : '/broadcasts', { scroll: false });
    },
    [router]
  );

  const openCompose = useCallback(() => {
    setComposeOpen(true);
    setWorkspaceView('feed');
    router.replace('/broadcasts?tab=feed&compose=1', { scroll: false });
  }, [router]);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    const p = new URLSearchParams(searchParams.toString());
    p.delete('compose');
    const qs = p.toString();
    router.replace(qs ? `/broadcasts?${qs}` : '/broadcasts', { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    const t = searchParams.get('tab');
    const c = searchParams.get('compose') === '1';
    setComposeOpen(c);
    if (t === 'drafts' && composeAllowed) setWorkspaceView('drafts');
    else if (t === 'submitted' && composeAllowed) setWorkspaceView('submitted');
    else if (t === 'scheduled' && showScheduledTab) setWorkspaceView('scheduled');
    else setWorkspaceView('feed');
  }, [searchParams, composeAllowed, showScheduledTab]);

  const workspaceSelectClass =
    'h-9 min-w-[200px] appearance-none rounded-xl border border-[#e8e8e8] bg-white px-3 pr-9 text-[13px] text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  const workspaceToolbar =
    composeAllowed ? (
      <div className="border-b border-[#e8e8e8] py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative shrink-0">
            <select
              value={workspaceView}
              onChange={(e) => goWorkspace(e.target.value as WorkspaceView)}
              className={workspaceSelectClass}
              aria-label="Broadcast view"
            >
              <option value="feed">
                Feed{unread > 0 ? ` (${unread} unread)` : ''}
              </option>
              <option value="drafts">My drafts</option>
              <option value="submitted">
                Sent for approval{submittedInboxBadge > 0 ? ` (${submittedInboxBadge})` : ''}
              </option>
              {showScheduledTab ? <option value="scheduled">Scheduled</option> : null}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b6b]"
            >
              ▾
            </span>
          </div>
          {primaryComposeCta ? (
            <button
              type="button"
              onClick={() => openCompose()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a]"
            >
              ✏ New broadcast
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openCompose()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a]"
            >
              ✏ Submit draft for approval
            </button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="w-full px-5 py-8 sm:px-7">
      {/* Page header — match Time off / main workspace pages */}
      <div className="mb-7">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
          Broadcasts
        </h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b6b6b]">
          {draftOnlyRole
            ? 'Feed, drafts, and submit messages for approval.'
            : 'Org-wide messages, your drafts, and approval queue.'}
        </p>
      </div>

      {approvalToast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-white/15 bg-[#121212] px-4 py-3 text-[13px] leading-snug text-[#faf9f6] shadow-lg">
          {approvalToast}
        </div>
      ) : null}

      {!composeOpen && workspaceView === 'feed' ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3 border-b border-[#e8e8e8] py-3">
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
                onClick={() => openCompose()}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition hover:-translate-y-px hover:bg-[#2a2a2a] active:translate-y-0"
              >
                ✏ New broadcast
              </button>
            ) : composeAllowed ? (
              <button
                type="button"
                onClick={() => openCompose()}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] shadow-sm transition hover:-translate-y-px hover:bg-[#2a2a2a] active:translate-y-0"
              >
                ✏ Submit draft for approval
              </button>
            ) : null}
          </div>

          <div className="border-b border-[#e8e8e8] py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {composeAllowed ? (
                <div className="relative min-w-[220px] flex-[1_1_220px] sm:flex-[0_0_auto]">
                  <select
                    value={workspaceView}
                    onChange={(e) => goWorkspace(e.target.value as WorkspaceView)}
                    className={workspaceSelectClass}
                    aria-label="Broadcast view"
                  >
                    <option value="feed">
                      Feed{unread > 0 ? ` (${unread} unread)` : ''}
                    </option>
                    <option value="drafts">My drafts</option>
                    <option value="submitted">
                      Sent for approval{submittedInboxBadge > 0 ? ` (${submittedInboxBadge})` : ''}
                    </option>
                    {showScheduledTab ? <option value="scheduled">Scheduled</option> : null}
                  </select>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b6b]"
                  >
                    ▾
                  </span>
                </div>
              ) : null}
              <div className="relative min-w-[240px] flex-[2_1_360px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9b9b9b]">
                  🔍
                </span>
                <input
                  type="search"
                  placeholder="Search broadcasts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-xl border border-[#e8e8e8] bg-white py-2 pl-9 pr-3 text-[13px] text-[#121212] outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
                />
              </div>
              <div className="flex min-w-[220px] flex-[1_1_520px] flex-wrap items-center gap-2.5">
                <div className="relative min-w-[170px] flex-[1_1_180px]">
                  <select
                    value={feedDepartmentId}
                    onChange={(e) => setFeedDepartmentId(e.target.value)}
                    disabled={feedDeptsSorted.length === 0}
                    className="h-9 w-full appearance-none truncate rounded-xl border border-[#e8e8e8] bg-white px-3 pr-9 text-[13px] text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Department"
                  >
                    <option value="">All departments</option>
                    {feedDeptsSorted.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b6b]"
                  >
                    ▾
                  </span>
                </div>
                <div className="relative min-w-[170px] flex-[1_1_180px]">
                  <select
                    value={advancedFilter}
                    onChange={(e) => setAdvancedFilter(e.target.value as AdvancedFeedFilter)}
                    className="h-9 w-full appearance-none rounded-xl border border-[#e8e8e8] bg-white px-3 pr-9 text-[13px] text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
                    aria-label="Filter broadcasts"
                  >
                    <option value="all">All broadcasts</option>
                    <option value="unread_only">Unread only</option>
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
                <div className="relative min-w-[170px] flex-[1_1_180px]">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as BroadcastSort)}
                    className="h-9 w-full appearance-none rounded-xl border border-[#e8e8e8] bg-white px-3 pr-9 text-[13px] text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
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
              <ExperienceLensBar
                ariaLabel="Broadcast feed layout"
                value={feedLayout}
                onChange={(next) => {
                  setFeedLayout(next);
                  try {
                    sessionStorage.setItem(FEED_LAYOUT_KEY, next);
                  } catch {
                    /* ignore */
                  }
                }}
                choices={[
                  { value: 'stream', label: 'Cards' },
                  { value: 'timeline', label: 'Timeline' },
                ]}
                className="ml-auto shrink-0"
              />
            </div>
          </div>

          <div className="py-6">
            <BroadcastFeed
              ref={feedRef}
              supabase={supabase}
              orgId={profile.org_id}
              userId={profile.id}
              viewerDeptIds={viewerDeptIds}
              deptFilter={feedDeptFilterSet}
              catFilter={emptyFilterSet}
              searchQuery={searchQuery}
              unreadOnly={false}
              advancedFilter={advancedFilter}
              sortBy={sortBy}
              emptyStateCanCompose={composeAllowed}
              emptyStateDraftForApproval={draftOnlyRole}
              onUnreadChange={setUnread}
              feedLayout={feedLayout}
            />
          </div>
        </>
      ) : null}

      {composeOpen && composeAllowed ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => closeCompose()}
            className="text-[13px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
          >
            ← Back
          </button>
          <BroadcastComposer
            supabase={supabase}
            orgId={profile.org_id}
            userId={profile.id}
            canCompose={composeAllowed}
            draftOnly={draftOnlyRole}
            canPublishWithoutApproval={composeAllowed && !draftOnlyRole}
            departments={scopedDepts}
            categoriesByDept={categoriesByDept}
            viewerDeptIds={viewerDeptIds}
            onCreated={(outcome) => {
              void loadMeta();
              closeCompose();
              if (outcome === 'submitted_for_approval') goWorkspace('submitted');
              else if (outcome === 'draft_saved') goWorkspace('drafts');
              else goWorkspace('feed');
            }}
          />
        </div>
      ) : null}

      {!composeOpen && workspaceView === 'drafts' && composeAllowed ? (
        <>
          {workspaceToolbar}
          <div className="space-y-4 py-6">
            <DraftsScheduledList supabase={supabase} userId={profile.id} mode="draft" />
          </div>
        </>
      ) : null}

      {!composeOpen && workspaceView === 'submitted' && composeAllowed ? (
        <>
          {workspaceToolbar}
          <div className="space-y-10 py-6">
            {approverRole ? (
              <section className="space-y-3">
                <div>
                  <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                    Awaiting your review
                  </h2>
                  <p className="text-[13.5px] leading-relaxed text-[#6b6b6b]">
                    Approve or reject submissions from other people. Your own submissions are listed below.
                  </p>
                </div>
                <PendingBroadcastList
                  supabase={supabase}
                  profile={profile}
                  onDone={() => {
                    void loadMeta();
                    router.refresh();
                  }}
                />
              </section>
            ) : null}
            <section className="space-y-3">
              <div>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                  Your submissions
                </h2>
                <p className="max-w-xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
                  These messages are waiting for an approver. They appear on the feed after approval. If one is
                  rejected, it returns to drafts.
                </p>
              </div>
              <MySubmissionsPendingList supabase={supabase} userId={profile.id} />
            </section>
          </div>
        </>
      ) : null}

      {!composeOpen && workspaceView === 'scheduled' && showScheduledTab ? (
        <>
          {workspaceToolbar}
          <div className="space-y-4 py-6">
            <DraftsScheduledList supabase={supabase} userId={profile.id} mode="scheduled" />
          </div>
        </>
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
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8e8e8] bg-white px-4 py-3 text-sm"
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
            className="shrink-0 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-1.5 text-xs font-medium text-[#121212] transition hover:bg-[#f5f4f1]"
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
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e8e8e8] bg-white px-3 py-2 text-sm"
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
      .eq('org_id', profile.org_id)
      .neq('created_by', profile.id);

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
      const { data: profs } = await supabase
        .from('coworker_directory_public')
        .select('id,full_name')
        .in('id', authorIds);
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
          className="rounded-xl border border-[#e8e8e8] bg-white p-4"
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
