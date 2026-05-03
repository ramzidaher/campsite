'use client';

import { FormSelect } from '@campsite/ui/web';
import { EmployeeQuickViewModal } from '@/components/admin/hr/EmployeeQuickViewModal';
import { EmployeeDirectoryGraph } from '@/components/genz/EmployeeDirectoryGraph';
import { useUiModePreference } from '@/hooks/useUiModePreference';
import type { UiMode } from '@/lib/uiMode';
import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

export type HRDirectoryRow = {
  user_id: string;
  full_name: string;
  preferred_name?: string | null;
  display_name?: string | null;
  email: string | null;
  status: string;
  avatar_url: string | null;
  role: string;
  reports_to_user_id: string | null;
  reports_to_name: string | null;
  department_names: string[];
  hr_record_id: string | null;
  job_title: string | null;
  grade_level: string | null;
  contract_type: string | null;
  salary_band: string | null;
  fte: number | null;
  work_location: string | null;
  employment_start_date: string | null;
  probation_end_date: string | null;
  notice_period_weeks: number | null;
  weekly_hours?: number | null;
  positions_count?: number | null;
  length_of_service_years?: number | null;
  length_of_service_months?: number | null;
};

type DashStats = {
  headcount_total: number;
  missing_hr_records: number;
  onboarding_active: number;
  by_contract: { contract_type: string; count: number }[];
  by_location: { work_location: string; count: number }[];
  probation_ending_soon: {
    user_id: string;
    full_name: string;
    preferred_name?: string | null;
    display_name?: string | null;
    probation_end_date: string;
    reports_to_user_id?: string | null;
    alert_level?: 'due_soon' | 'overdue' | 'critical';
  }[];
  review_cycles_active: { id: string; name: string; type: string; total: number; completed: number; manager_due: string | null }[];
  on_leave_today: { user_id: string; full_name: string; preferred_name?: string | null; display_name?: string | null; kind: string; end_date: string }[];
  bradford_alerts: { user_id: string; full_name: string; preferred_name?: string | null; display_name?: string | null; spell_count: number; total_days: number; bradford_score: number }[];
  one_on_one_pairs_overdue?: number;
  one_on_one_pairs_due_soon?: number;
};

function contractLabel(ct: string | null) {
  switch (ct) {
    case 'full_time': return 'Full-time';
    case 'part_time': return 'Part-time';
    case 'contractor': return 'Contractor';
    case 'zero_hours': return 'Zero hours';
    default: return '—';
  }
}

function locationLabel(wl: string | null) {
  switch (wl) {
    case 'office': return 'Office';
    case 'remote': return 'Remote';
    case 'hybrid': return 'Hybrid';
    default: return '—';
  }
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function hrRoleLabel(role: string) {
  return role ? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}

function hrStatusBadge(status: string) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#166534]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Active
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[11px] font-medium text-[#c2410c]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9b9b]">
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      Inactive
    </span>
  );
}

function HRQuickViewSummary({
  r,
  today,
  contractLabel,
  locationLabel,
}: {
  r: HRDirectoryRow;
  today: string;
  contractLabel: (ct: string | null) => string;
  locationLabel: (wl: string | null) => string;
}) {
  const onProbation = r.probation_end_date && r.probation_end_date >= today;
  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        {r.avatar_url ? (
          <img src={r.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[14px] font-bold text-[#6b6b6b]">
            {initials(r.full_name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[#121212]">{r.display_name ?? r.full_name}</p>
          {r.email ? <p className="truncate text-[12.5px] text-[#9b9b9b]">{r.email}</p> : null}
        </div>
      </div>
      {!r.hr_record_id ? (
        <p className="status-banner-warning mb-4 rounded-lg px-3 py-2 text-[12.5px]">
          No HR record on file yet. Open the full file to create one.
        </p>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Job title</dt>
          <dd className="mt-0.5 text-[#121212]">
            {r.job_title || '—'}
            {r.grade_level ? <span className="ml-1 text-[11px] text-[#9b9b9b]">({r.grade_level})</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Contract</dt>
          <dd className="mt-0.5 text-[#121212]">
            {r.contract_type ? contractLabel(r.contract_type) : '—'}
            {r.fte != null && r.fte < 1 ? ` · ${Math.round(r.fte * 100)}% FTE` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Location</dt>
          <dd className="mt-0.5 text-[#121212]">{r.work_location ? locationLabel(r.work_location) : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Start date</dt>
          <dd className="mt-0.5 text-[#121212]">{r.employment_start_date ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Tenure</dt>
          <dd className="mt-0.5 text-[#121212]">
            {r.length_of_service_years != null && r.length_of_service_months != null
              ? `${r.length_of_service_years}y ${r.length_of_service_months}m`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Hours / positions</dt>
          <dd className="mt-0.5 text-[#121212]">
            {r.weekly_hours != null ? `${r.weekly_hours}h` : '—'}
            {r.positions_count != null && r.positions_count > 1 ? (
              <span className="text-[#9b9b9b]"> · {r.positions_count} positions</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Probation ends</dt>
          <dd className="mt-0.5">
            {r.probation_end_date ? (
              <span className={['text-[#121212]', onProbation ? 'font-medium text-[#c2410c]' : ''].join(' ')}>
                {r.probation_end_date}
                {onProbation ? ' (on probation)' : ''}
              </span>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Salary band</dt>
          <dd className="mt-0.5 text-[#121212]">{r.salary_band || '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Departments</dt>
          <dd className="mt-0.5 text-[#121212]">{r.department_names.length ? r.department_names.join(', ') : '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Reports to</dt>
          <dd className="mt-0.5 text-[#121212]">{r.reports_to_name || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Role</dt>
          <dd className="mt-0.5 text-[#121212]">{hrRoleLabel(r.role)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Account status</dt>
          <dd className="mt-0.5">{hrStatusBadge(r.status)}</dd>
        </div>
      </dl>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  warn,
  danger,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  warn?: boolean;
  /** Stronger than warn (e.g. compliance breach). */
  danger?: boolean;
}) {
  const inner = (
    <div
      className={[
        'flex h-full min-h-[5.5rem] flex-col rounded-xl border p-4',
        danger ? 'border-[#dc2626] bg-[#fef2f2]' : warn ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#d8d8d8] bg-white',
      ].join(' ')}
    >
      <p
        className={[
          'text-[11.5px] font-medium uppercase tracking-wide',
          danger ? 'text-[#991b1b]' : warn ? 'text-[#b91c1c]' : 'text-[#9b9b9b]',
        ].join(' ')}
      >
        {label}
      </p>
      <p
        className={[
          'mt-1 text-[28px] font-bold leading-none',
          danger ? 'text-[#991b1b]' : warn ? 'text-[#b91c1c]' : 'text-[#121212]',
        ].join(' ')}
      >
        {value}
      </p>
      {/* Fixed-height slot so cards align whether or not there is subtext */}
      {sub ? (
        <p className="mt-1 min-h-[2.75rem] text-[11.5px] leading-snug text-[#9b9b9b]">{sub}</p>
      ) : (
        <div className="mt-1 min-h-[2.75rem]" aria-hidden />
      )}
    </div>
  );
  if (href) return <Link href={href} className="block h-full min-h-0 hover:opacity-80 transition-opacity">{inner}</Link>;
  return inner;
}

export function HRDirectoryClient({
  orgId: _orgId,
  canManage: _canManage,
  canManagePerformanceCycles,
  canViewAll,
  initialRows,
  dashStats,
  initialQuery = '',
  initialUiMode = 'classic',
}: {
  orgId: string;
  canManage: boolean;
  /** Opens `/hr/performance/[cycleId]` (requires `performance.manage_cycles` on the destination). */
  canManagePerformanceCycles: boolean;
  /** true = hr.view_records (HR admin). false = hr.view_direct_reports (manager, direct reports only). */
  canViewAll: boolean;
  initialRows: HRDirectoryRow[];
  dashStats: Record<string, unknown> | null;
  /** Optional query seeded from URL (`?q=`), used by top-bar search. */
  initialQuery?: string;
  initialUiMode?: UiMode;
}) {
  const columnOptions = [
    { key: 'jobTitle', label: 'Job title' },
    { key: 'contract', label: 'Contract' },
    { key: 'location', label: 'Location' },
    { key: 'startDate', label: 'Start date' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'hoursPositions', label: 'Hrs / pos.' },
    { key: 'probation', label: 'Probation ends' },
    { key: 'departments', label: 'Departments' },
  ] as const;
  type ColumnKey = typeof columnOptions[number]['key'];
  const defaultVisibleColumns: Record<ColumnKey, boolean> = {
    jobTitle: true,
    contract: true,
    location: true,
    startDate: true,
    tenure: true,
    hoursPositions: true,
    probation: true,
    departments: true,
  };
  const columnPrefsKey = 'hr-directory-visible-columns-v1';

  const [stats, setStats] = useState<DashStats | null>(() => (dashStats as DashStats | null));
  const [dashboardStatsState, setDashboardStatsState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    dashStats ? 'ready' : 'idle'
  );
  const [dashboardStatsError, setDashboardStatsError] = useState<string | null>(null);

  const probationCriticalCount = useMemo(() => {
    const list = stats?.probation_ending_soon;
    if (!list?.length) return 0;
    return list.filter((p) => p.alert_level === 'critical').length;
  }, [stats]);

  const [q, setQ] = useState(initialQuery);
  const [filterContract, setFilterContract] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterHasRecord, setFilterHasRecord] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return defaultVisibleColumns;
    try {
      const raw = window.localStorage.getItem(columnPrefsKey);
      if (!raw) return defaultVisibleColumns;
      const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>;
      return {
        ...defaultVisibleColumns,
        ...parsed,
      };
    } catch {
      return defaultVisibleColumns;
    }
  });
  const [draftVisibleColumns, setDraftVisibleColumns] = useState<Record<ColumnKey, boolean>>(visibleColumns);
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'directory'>(stats ? 'dashboard' : 'directory');
  const [dashboardRequested, setDashboardRequested] = useState(Boolean(stats));
  const [previewRow, setPreviewRow] = useState<HRDirectoryRow | null>(null);
  const deferredQ = useDeferredValue(q);
  const { uiMode } = useUiModePreference(initialUiMode);
  const isInteractiveDirectoryView = uiMode === 'interactive' && tab === 'directory';

  useEffect(() => {
    if (tab !== 'directory') setPreviewRow(null);
  }, [tab]);

  useEffect(() => {
    if (!canViewAll) return;
    if (!dashboardRequested) return;
    if (stats) return;
    if (dashboardStatsState !== 'idle') return;

    let active = true;
    const controller = new AbortController();
    setDashboardStatsState('loading');
    setDashboardStatsError(null);

    async function loadDashboardStats() {
      try {
        const response = await fetch('/api/hr/dashboard-stats', {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          stats?: Record<string, unknown> | null;
        };
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load HR overview.');
        if (!active) return;
        setStats((payload.stats as DashStats | null) ?? null);
        setDashboardStatsState('ready');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Failed to load HR overview.';
        setDashboardStatsError(message);
        setDashboardStatsState('error');
      }
    }

    void loadDashboardStats();

    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewAll, dashboardRequested, dashboardStatsState, stats]);

  useEffect(() => {
    if (!isColumnsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!columnsMenuRef.current) return;
      if (!columnsMenuRef.current.contains(event.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isColumnsMenuOpen]);

  const indexedRows = useMemo(
    () =>
      initialRows.map((r) => ({
        row: r,
        searchText: [r.display_name ?? r.full_name, r.full_name, r.preferred_name, r.email, r.role, r.job_title, r.department_names.join(' ')]
          .join(' ')
          .toLowerCase(),
      })),
    [initialRows]
  );

  const filtered = useMemo(() => {
    const term = deferredQ.toLowerCase().trim();
    return indexedRows
      .filter(({ row: r, searchText }) => {
      if (term) {
        if (!searchText.includes(term)) return false;
      }
      if (filterContract && r.contract_type !== filterContract) return false;
      if (filterLocation && r.work_location !== filterLocation) return false;
      if (filterHasRecord === 'yes' && !r.hr_record_id) return false;
      if (filterHasRecord === 'no' && r.hr_record_id) return false;
      return true;
      })
      .map(({ row }) => row);
  }, [indexedRows, deferredQ, filterContract, filterLocation, filterHasRecord]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className={
        isInteractiveDirectoryView
          ? 'w-full px-0 py-0'
          : 'mx-auto max-w-6xl px-5 py-8 sm:px-7'
      }
    >
      <div className={isInteractiveDirectoryView ? 'px-5 pt-6 sm:px-7' : 'mb-6'}>
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          {canViewAll ? 'Employee records' : 'Team records'}
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          {canViewAll ? 'HR overview and employee directory.' : 'HR records for your direct reports.'}
        </p>
      </div>

      {/* Tabs */}
      <div className={isInteractiveDirectoryView ? 'mt-4 flex border-b border-[#ececec] px-5 sm:px-7' : 'mb-6 flex border-b border-[#ececec]'}>
        {canViewAll ? (
          <button
            type="button"
            onClick={() => {
              setDashboardRequested(true);
              setTab('dashboard');
            }}
            className={['px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors', tab === 'dashboard' ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#9b9b9b] hover:text-[#4a4a4a]'].join(' ')}
          >
            Overview
            {dashboardStatsState === 'loading' ? '...' : ''}
          </button>
        ) : null}
        <button type="button" onClick={() => setTab('directory')} className={['px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors', tab === 'directory' ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#9b9b9b] hover:text-[#4a4a4a]'].join(' ')}>
          Directory ({initialRows.length})
        </button>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && stats ? (
        <div className="space-y-8">
          {/* Headline stats */}
          <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-4">
            <StatCard label="Active headcount" value={stats.headcount_total} />
            {typeof stats.one_on_one_pairs_overdue === 'number' ? (
              <StatCard
                label="1:1 pairs overdue"
                value={stats.one_on_one_pairs_overdue}
                warn={stats.one_on_one_pairs_overdue > 0}
                sub={stats.one_on_one_pairs_overdue > 0 ? 'Cadence missed' : 'On track'}
                href="/hr/one-on-ones"
              />
            ) : null}
            {typeof stats.one_on_one_pairs_due_soon === 'number' ? (
              <StatCard
                label="1:1 due soon"
                value={stats.one_on_one_pairs_due_soon}
                href="/hr/one-on-ones"
              />
            ) : null}
            <StatCard
              label="Missing HR records"
              value={stats.missing_hr_records}
              warn={stats.missing_hr_records > 0}
              sub={stats.missing_hr_records > 0 ? 'No record on file' : 'All employees covered'}
            />
            <StatCard
              label="Active onboardings"
              value={stats.onboarding_active}
              href="/hr/onboarding"
            />
            <StatCard
              label="Probation review due"
              value={stats.probation_ending_soon.length}
              danger={probationCriticalCount > 0}
              warn={stats.probation_ending_soon.length > 0 && probationCriticalCount === 0}
              sub={
                stats.probation_ending_soon.length === 0
                  ? 'No pending probation checks in scope'
                  : probationCriticalCount > 0
                    ? `${probationCriticalCount} over one week overdue`
                    : 'Within 30 days or overdue (check not recorded)'
              }
            />
          </div>

          {/* Two-column middle row */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Breakdown by contract */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Contract types</h2>
              {stats.by_contract.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">No HR records yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stats.by_contract.map((c) => {
                    const pct = stats.headcount_total > 0 ? Math.round((c.count / stats.headcount_total) * 100) : 0;
                    return (
                      <li key={c.contract_type}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-[#4a4a4a]">{contractLabel(c.contract_type)}</span>
                          <span className="font-medium text-[#121212]">{c.count} <span className="font-normal text-[#9b9b9b]">({pct}%)</span></span>
                        </div>
                        <div className="mt-1 h-1 w-full rounded-full bg-[#ececec]">
                          <div className="h-1 rounded-full bg-[#121212]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Breakdown by location */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Work locations</h2>
              {stats.by_location.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">No HR records yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stats.by_location.map((l) => {
                    const pct = stats.headcount_total > 0 ? Math.round((l.count / stats.headcount_total) * 100) : 0;
                    return (
                      <li key={l.work_location}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-[#4a4a4a]">{locationLabel(l.work_location)}</span>
                          <span className="font-medium text-[#121212]">{l.count} <span className="font-normal text-[#9b9b9b]">({pct}%)</span></span>
                        </div>
                        <div className="mt-1 h-1 w-full rounded-full bg-[#ececec]">
                          <div className="h-1 rounded-full bg-[#4a4a4a]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Active review cycles */}
          {stats.review_cycles_active.length > 0 ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-[#121212]">Active review cycles</h2>
                <Link href="/hr/performance" className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">View all</Link>
              </div>
              <ul className="mt-3 space-y-3">
                {stats.review_cycles_active.map((c) => {
                  const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        {canManagePerformanceCycles ? (
                          <Link href={`/hr/performance/${c.id}`} className="font-medium text-[#121212] hover:underline">{c.name}</Link>
                        ) : (
                          <span className="font-medium text-[#121212]">{c.name}</span>
                        )}
                        <span className="text-[#9b9b9b]">{c.completed}/{c.total} done</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[#ececec]">
                        <div className="h-1.5 rounded-full bg-[#121212] transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {c.manager_due ? <p className="mt-0.5 text-[11px] text-[#9b9b9b]">Manager assessment due {c.manager_due}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Bottom row: probation + leave + bradford */}
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Probation review due / overdue */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Probation review</h2>
              <p className="mt-0.5 text-[11px] text-[#9b9b9b]">Prompts from 30 days before end; red if over one week past end with no check.</p>
              {stats.probation_ending_soon.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">None in scope.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#ececec]">
                  {stats.probation_ending_soon.map((p) => (
                    <li key={p.user_id} className="py-2">
                      <Link href={`/hr/records/${p.user_id}`} className="text-[12.5px] font-medium text-[#121212] hover:underline">{p.display_name ?? p.full_name}</Link>
                      <p
                        className={[
                          'text-[11.5px]',
                          p.alert_level === 'critical'
                            ? 'font-semibold text-[#b91c1c]'
                            : p.alert_level === 'overdue'
                              ? 'text-[#c2410c]'
                              : 'text-[#a16207]',
                        ].join(' ')}
                      >
                        Ends {p.probation_end_date}
                        {p.alert_level === 'critical'
                          ? ' · Over one week overdue'
                          : p.alert_level === 'overdue'
                            ? ' · Overdue'
                            : ' · Due soon'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* On leave today */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">On leave today</h2>
              {stats.on_leave_today.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">Nobody on leave today.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#ececec]">
                  {stats.on_leave_today.map((l) => (
                    <li key={l.user_id} className="py-2">
                      <p className="text-[12.5px] font-medium text-[#121212]">{l.display_name ?? l.full_name}</p>
                      <p className="text-[11.5px] text-[#9b9b9b]">
                        {l.kind === 'annual' ? 'Annual leave' : 'TOIL'} · back {l.end_date}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Bradford alerts */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-[#121212]">
                  Sickness score alerts <span className="text-[11px] font-normal text-[#9b9b9b]">(≥200)</span>
                </h2>
                <Link
                  href="/hr/absence-reporting"
                  className="shrink-0 text-[11.5px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                >
                  Full report
                </Link>
              </div>
              {stats.bradford_alerts.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">No alerts.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#ececec]">
                  {stats.bradford_alerts.map((b) => (
                    <li key={b.user_id} className="py-2">
                      <div className="flex items-center justify-between">
                        <Link href={`/hr/records/${b.user_id}`} className="text-[12.5px] font-medium text-[#121212] hover:underline">{b.display_name ?? b.full_name}</Link>
                        <span className="text-[12px] font-bold text-[#b91c1c]">{b.bradford_score}</span>
                      </div>
                      <p className="text-[11px] text-[#9b9b9b]">{b.spell_count} spell{b.spell_count === 1 ? '' : 's'} · {b.total_days} day{b.total_days === 1 ? '' : 's'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : tab === 'dashboard' && canViewAll ? (
        <div className="rounded-2xl border border-[#ececec] bg-white px-5 py-6 text-[13px] text-[#6b6b6b] sm:px-6">
          {dashboardStatsState === 'loading' ? (
            <p>Loading the HR overview...</p>
          ) : dashboardStatsState === 'error' ? (
            <div className="space-y-3">
              <p>{dashboardStatsError ?? 'The HR overview could not be loaded right now.'}</p>
              <button
                type="button"
                onClick={() => {
                  setDashboardStatsError(null);
                  setDashboardStatsState('idle');
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] text-[#121212] transition-colors hover:bg-[#f5f4f1]"
              >
                Retry overview
              </button>
            </div>
          ) : (
            <p>Open the overview tab to load live HR metrics.</p>
          )}
        </div>
      ) : null}

      {/* ── DIRECTORY TAB ── */}
      {tab === 'directory' ? (
        <>
          {/* Filters */}
          <div className={isInteractiveDirectoryView ? 'mt-3 mb-2 flex flex-wrap gap-3 px-5 sm:px-7' : 'mb-5 flex flex-wrap gap-3'}>
            <input
              type="search"
              placeholder="Search name, email, role…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-64 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] outline-none focus:border-[#121212]"
            />
            <FormSelect value={filterContract} onChange={(e) => setFilterContract(e.target.value)} className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]">
              <option value="">All contracts</option>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contractor">Contractor</option>
              <option value="zero_hours">Zero hours</option>
            </FormSelect>
            <FormSelect value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]">
              <option value="">All locations</option>
              <option value="office">Office</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </FormSelect>
            <FormSelect value={filterHasRecord} onChange={(e) => setFilterHasRecord(e.target.value)} className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]">
              <option value="">All members</option>
              <option value="yes">Has HR record</option>
              <option value="no">Missing HR record</option>
            </FormSelect>
            <div ref={columnsMenuRef} className="relative z-40">
              <button
                type="button"
                onClick={() => setIsColumnsMenuOpen((prev) => !prev)}
                className="flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#4a4a4a]"
              >
                Columns
              </button>
              {isColumnsMenuOpen ? (
                <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-[#d8d8d8] bg-white p-2 shadow-sm">
                  {columnOptions.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-[12.5px] text-[#4a4a4a] hover:bg-[#faf9f6]">
                      <span>{c.label}</span>
                      <input
                        type="checkbox"
                        checked={draftVisibleColumns[c.key]}
                        onChange={(e) => {
                          setDraftVisibleColumns((prev) => ({ ...prev, [c.key]: e.target.checked }));
                        }}
                        className="h-3.5 w-3.5 accent-[#121212]"
                      />
                    </label>
                  ))}
                  <div className="mt-1 flex items-center gap-2 border-t border-[#ececec] px-1 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVisibleColumns(draftVisibleColumns);
                        window.localStorage.setItem(columnPrefsKey, JSON.stringify(draftVisibleColumns));
                        setIsColumnsMenuOpen(false);
                      }}
                      className="rounded-md bg-[#121212] px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#2b2b2b]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftVisibleColumns(defaultVisibleColumns);
                        setVisibleColumns(defaultVisibleColumns);
                        window.localStorage.removeItem(columnPrefsKey);
                        setIsColumnsMenuOpen(false);
                      }}
                      className="rounded-md border border-[#d8d8d8] bg-white px-2.5 py-1.5 text-[12px] text-[#4a4a4a] hover:bg-[#faf9f6]"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <span className="ml-auto flex items-center text-[12px] text-[#9b9b9b]">{filtered.length} of {initialRows.length}</span>
          </div>

          {uiMode === 'interactive' ? (
            <EmployeeDirectoryGraph rows={filtered} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
              <table className="w-full min-w-[840px] text-[13px]">
                <thead>
                  <tr className="border-b border-[#ececec] text-left text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    <th className="px-4 py-3">Name</th>
                    {visibleColumns.jobTitle ? <th className="px-4 py-3">Job title</th> : null}
                    {visibleColumns.contract ? <th className="px-4 py-3">Contract</th> : null}
                    {visibleColumns.location ? <th className="px-4 py-3">Location</th> : null}
                    {visibleColumns.startDate ? <th className="px-4 py-3">Start date</th> : null}
                    {visibleColumns.tenure ? <th className="px-4 py-3">Tenure</th> : null}
                    {visibleColumns.hoursPositions ? <th className="px-4 py-3">Hrs / pos.</th> : null}
                    {visibleColumns.probation ? <th className="px-4 py-3">Probation ends</th> : null}
                    {visibleColumns.departments ? <th className="px-4 py-3">Departments</th> : null}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ececec]">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={2 + columnOptions.filter((c) => visibleColumns[c.key]).length} className="px-4 py-8 text-center text-[#9b9b9b]">No members match.</td></tr>
                  ) : null}
                  {filtered.map((r) => {
                    const onProbation = r.probation_end_date && r.probation_end_date >= today;
                    return (
                      <tr
                        key={r.user_id}
                        className="group cursor-pointer hover:bg-[#faf9f6]"
                        onClick={() => setPreviewRow(r)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {r.avatar_url ? (
                              <img src={r.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[10px] font-bold text-[#6b6b6b]">{initials(r.full_name)}</div>
                            )}
                            <div>
                              <div className="font-medium text-[#121212]">{r.display_name ?? r.full_name}</div>
                              {r.email ? <div className="text-[11.5px] text-[#9b9b9b]">{r.email}</div> : null}
                            </div>
                          </div>
                        </td>
                        {visibleColumns.jobTitle ? (
                          <td className="px-4 py-3 text-[#4a4a4a]">
                            {r.job_title || <span className="text-[#c8c8c8]">—</span>}
                            {r.grade_level ? <span className="ml-1 whitespace-nowrap text-[11px] text-[#9b9b9b]">({r.grade_level})</span> : null}
                          </td>
                        ) : null}
                        {visibleColumns.contract ? (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {r.contract_type ? (
                              <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium text-[#4a4a4a]">
                                {contractLabel(r.contract_type)}{r.fte && r.fte < 1 ? ` ${Math.round(r.fte * 100)}%` : ''}
                              </span>
                            ) : <span className="text-[#c8c8c8]">—</span>}
                          </td>
                        ) : null}
                        {visibleColumns.location ? (
                          <td className="px-4 py-3 whitespace-nowrap text-[#4a4a4a]">{r.work_location ? locationLabel(r.work_location) : <span className="text-[#c8c8c8]">—</span>}</td>
                        ) : null}
                        {visibleColumns.startDate ? (
                          <td className="px-4 py-3 whitespace-nowrap text-[#4a4a4a]">{r.employment_start_date ?? <span className="text-[#c8c8c8]">—</span>}</td>
                        ) : null}
                        {visibleColumns.tenure ? (
                          <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#4a4a4a]">
                            {r.length_of_service_years != null && r.length_of_service_months != null ? (
                              <span>
                                {r.length_of_service_years}y {r.length_of_service_months}m
                              </span>
                            ) : (
                              <span className="text-[#c8c8c8]">—</span>
                            )}
                          </td>
                        ) : null}
                        {visibleColumns.hoursPositions ? (
                          <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#4a4a4a]">
                            {r.weekly_hours != null ? <span>{r.weekly_hours}h</span> : <span className="text-[#c8c8c8]">—</span>}
                            {r.positions_count != null && r.positions_count > 1 ? (
                              <span className="text-[#9b9b9b]"> · {r.positions_count} pos.</span>
                            ) : null}
                          </td>
                        ) : null}
                        {visibleColumns.probation ? (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {r.probation_end_date ? (
                              <span className={['text-[12px]', onProbation ? 'font-medium text-[#c2410c]' : 'text-[#6b6b6b]'].join(' ')}>
                                {r.probation_end_date}{onProbation ? ' ●' : ''}
                              </span>
                            ) : <span className="text-[#c8c8c8]">—</span>}
                          </td>
                        ) : null}
                        {visibleColumns.departments ? (
                          <td className="px-4 py-3">
                            <div className="flex max-w-[220px] items-center gap-1.5 overflow-hidden whitespace-nowrap">
                              {r.department_names.slice(0, 2).map((d) => (
                                <span
                                  key={d}
                                  title={d}
                                  className="max-w-[130px] truncate rounded-full bg-[#f3f1ed] px-2 py-0.5 text-[11px] font-medium text-[#5b5b5b]"
                                >
                                  {d}
                                </span>
                              ))}
                              {r.department_names.length > 2 ? (
                                <span className="shrink-0 rounded-full bg-[#f7f6f3] px-1.5 py-0.5 text-[10.5px] font-medium text-[#8a8a8a]">
                                  +{r.department_names.length - 2}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                        <td
                          className="px-4 py-3 text-right align-middle whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[16px] font-medium text-[#121212] opacity-70 transition-opacity hover:bg-[#ececec] group-hover:opacity-100"
                            aria-label="Preview employee"
                            title="Preview"
                            onClick={() => setPreviewRow(r)}
                          >
                            →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {initialRows.some((r) => !r.hr_record_id) ? (
            <p className="mt-4 text-[12px] text-[#9b9b9b]">
              {initialRows.filter((r) => !r.hr_record_id).length} member{initialRows.filter((r) => !r.hr_record_id).length === 1 ? '' : 's'} without an HR record — open their file to create one.
            </p>
          ) : null}
        </>
      ) : null}

      {previewRow ? (
        <EmployeeQuickViewModal
          open
          onClose={() => setPreviewRow(null)}
          backLabel={canViewAll ? 'Employee records' : 'Team records'}
          title={previewRow.display_name ?? previewRow.full_name}
          subtitle={previewRow.email}
          fullRecordHref={`/hr/records/${previewRow.user_id}`}
        >
          <HRQuickViewSummary
            r={previewRow}
            today={today}
            contractLabel={contractLabel}
            locationLabel={locationLabel}
          />
        </EmployeeQuickViewModal>
      ) : null}
    </div>
  );
}
