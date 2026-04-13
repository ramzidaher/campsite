'use client';

import { recruitmentStatusLabel, recruitmentUrgencyLabel } from '@/lib/recruitment/labels';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export type AdminRecruitmentListRow = {
  id: string;
  job_title: string;
  status: string;
  urgency: string;
  archived_at: string | null;
  created_at: string;
  department_id: string;
  departments: { name: string } | { name: string }[] | null;
  submitter: { full_name: string } | { full_name: string }[] | null;
};

type SortKey = 'date' | 'department' | 'urgency' | 'status';

const URGENCY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

const STATUS_STYLE: Record<string, string> = {
  pending_review: 'bg-[#fff7ed] text-[#c2410c]',
  approved:       'bg-[#eff6ff] text-[#1d4ed8]',
  in_progress:    'bg-[#faf5ff] text-[#7c3aed]',
  filled:         'bg-[#dcfce7] text-[#166534]',
  rejected:       'bg-[#fef2f2] text-[#b91c1c]',
};

const STATUS_DOT: Record<string, string> = {
  pending_review: 'bg-[#f97316]',
  approved:       'bg-[#3b82f6]',
  in_progress:    'bg-[#8b5cf6]',
  filled:         'bg-[#16a34a]',
  rejected:       'bg-[#dc2626]',
};

const URGENCY_STYLE: Record<string, string> = {
  high:   'bg-[#fef2f2] text-[#b91c1c]',
  normal: 'bg-[#f5f4f1] text-[#6b6b6b]',
  low:    'bg-[#f0fdf4] text-[#166534]',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function deptName(d: AdminRecruitmentListRow['departments']): string {
  return (Array.isArray(d) ? d[0]?.name : d?.name) ?? '—';
}
function submitterName(p: AdminRecruitmentListRow['submitter']): string {
  return ((Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? '').trim() || '—';
}

export function AdminRecruitmentListClient({ rows }: { rows: AdminRecruitmentListRow[] }) {
  const [filter, setFilter] = useState<'open' | 'archived' | 'all'>('open');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const openCount = rows.filter((r) => !r.archived_at).length;
  const pendingCount = rows.filter((r) => r.status === 'pending_review' && !r.archived_at).length;
  const inProgressCount = rows.filter((r) => r.status === 'in_progress' && !r.archived_at).length;
  const filledCount = rows.filter((r) => r.status === 'filled').length;

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === 'open') r = r.filter((x) => !x.archived_at);
    else if (filter === 'archived') r = r.filter((x) => x.archived_at);
    if (statusFilter !== 'all') r = r.filter((x) => x.status === statusFilter);
    return r;
  }, [rows, filter, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sort === 'date') return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sort === 'department') return dir * deptName(a.departments).localeCompare(deptName(b.departments), undefined, { sensitivity: 'base' });
      if (sort === 'status') {
        const rank: Record<string, number> = { pending_review: 0, approved: 1, in_progress: 2, filled: 3, rejected: 4 };
        return dir * ((rank[a.status] ?? 99) - (rank[b.status] ?? 99));
      }
      return dir * ((URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9));
    });
    return copy;
  }, [filtered, sort, sortDir]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Requests</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Recruitment queue for all hiring requests. Review, approve, and track through to filled.
        </p>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#e8e8e8] bg-white p-4 text-center">
          <p className="text-[22px] font-bold text-[#121212]">{openCount}</p>
          <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">Open</p>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${pendingCount > 0 ? 'border-[#fed7aa] bg-[#fff7ed]' : 'border-[#e8e8e8] bg-white'}`}>
          <p className={`text-[22px] font-bold ${pendingCount > 0 ? 'text-[#c2410c]' : 'text-[#121212]'}`}>{pendingCount}</p>
          <p className={`mt-0.5 text-[11.5px] ${pendingCount > 0 ? 'text-[#9a3412]' : 'text-[#6b6b6b]'}`}>Pending review</p>
        </div>
        <div className="rounded-2xl border border-[#e8e8e8] bg-white p-4 text-center">
          <p className="text-[22px] font-bold text-[#7c3aed]">{inProgressCount}</p>
          <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">In progress</p>
        </div>
        <div className="rounded-2xl border border-[#e8e8e8] bg-white p-4 text-center">
          <p className="text-[22px] font-bold text-[#16a34a]">{filledCount}</p>
          <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">Filled</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Open / Archived / All */}
        <div className="flex gap-1 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-1">
          {(['open', 'archived', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors',
                filter === f ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
              ].join(' ')}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          {['all', 'pending_review', 'approved', 'in_progress', 'filled', 'rejected'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={[
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                statusFilter === s
                  ? s === 'all'
                    ? 'border-[#121212] bg-[#121212] text-white'
                    : `border-transparent ${STATUS_STYLE[s]} ring-2 ring-current ring-offset-1`
                  : 'border-[#e8e8e8] bg-white text-[#6b6b6b] hover:border-[#c8c8c8]',
              ].join(' ')}
            >
              {s !== 'all' && statusFilter === s ? (
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s]}`} />
              ) : null}
              {s === 'all' ? 'All statuses' : recruitmentStatusLabel(s)}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-[#e8e8e8] bg-white px-2.5 py-1.5 text-[12.5px] text-[#4a4a4a] focus:border-[#121212] focus:outline-none"
          >
            <option value="date">Date</option>
            <option value="department">Department</option>
            <option value="urgency">Urgency</option>
            <option value="status">Status</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 rounded-lg border border-[#e8e8e8] bg-white px-2.5 py-1.5 text-[12.5px] text-[#4a4a4a] hover:bg-[#faf9f6] transition-colors"
          >
            {sortDir === 'desc' ? '↓' : '↑'} {sortDir === 'desc' ? 'Newest' : 'Oldest'}
          </button>
        </div>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-[#e8e8e8] bg-white px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-[#121212]">No requests match this filter</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">Try changing the status or archive filter above.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
          {sorted.map((r, i) => (
            <div
              key={r.id}
              className={[
                'flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#faf9f6]',
                i < sorted.length - 1 ? 'border-b border-[#f0efe9]' : '',
              ].join(' ')}
            >
              {/* Urgency dot */}
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  r.urgency === 'high' ? 'bg-[#dc2626]' :
                  r.urgency === 'low'  ? 'bg-[#16a34a]' :
                  'bg-[#9b9b9b]'
                }`}
                title={`Urgency: ${recruitmentUrgencyLabel(r.urgency)}`}
              />

              {/* Main info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/hr/recruitment/${r.id}`}
                    className="text-[14px] font-semibold text-[#121212] hover:text-[#008B60] transition-colors"
                  >
                    {r.job_title}
                  </Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] ?? 'bg-[#f5f4f1] text-[#6b6b6b]'}`}>
                    {recruitmentStatusLabel(r.status)}
                  </span>
                  {r.urgency === 'high' ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${URGENCY_STYLE.high}`}>
                      High urgency
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
                  {deptName(r.departments)}
                  {submitterName(r.submitter) !== '—' ? ` · by ${submitterName(r.submitter)}` : ''}
                  {' · '}{fmtDate(r.created_at)}
                </p>
              </div>

              {/* Arrow */}
              <Link
                href={`/hr/recruitment/${r.id}`}
                className="shrink-0 rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-1.5 text-[12px] font-medium text-[#4a4a4a] hover:bg-[#f0efe9] transition-colors"
              >
                Review →
              </Link>
            </div>
          ))}
        </div>
      )}

      {sorted.length > 0 ? (
        <p className="mt-3 text-right text-[11.5px] text-[#9b9b9b]">
          {sorted.length} request{sorted.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
