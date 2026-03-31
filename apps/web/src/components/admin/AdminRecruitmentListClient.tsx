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

type SortKey = 'date' | 'department' | 'urgency';

const URGENCY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

export function AdminRecruitmentListClient({ rows }: { rows: AdminRecruitmentListRow[] }) {
  const [filter, setFilter] = useState<'open' | 'archived' | 'all'>('open');
  const [sort, setSort] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === 'open') r = r.filter((x) => !x.archived_at);
    else if (filter === 'archived') r = r.filter((x) => x.archived_at);
    return r;
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sort === 'date') {
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      if (sort === 'department') {
        const an = (Array.isArray(a.departments) ? a.departments[0]?.name : a.departments?.name) ?? '';
        const bn = (Array.isArray(b.departments) ? b.departments[0]?.name : b.departments?.name) ?? '';
        return dir * an.localeCompare(bn, undefined, { sensitivity: 'base' });
      }
      const au = URGENCY_RANK[a.urgency] ?? 9;
      const bu = URGENCY_RANK[b.urgency] ?? 9;
      return dir * (au - bu);
    });
    return copy;
  }, [filtered, sort, sortDir]);

  const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Recruitment</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Review requests from department managers. Nothing is deleted — filled and rejected requests are
            archived with full history.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-1 text-[12px]">
          {(['open', 'archived', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'rounded-md px-3 py-1.5 font-medium capitalize transition',
                filter === f ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
              ].join(' ')}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="text-[#505050]">Sort by</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[13px]"
          >
            <option value="date">Date submitted</option>
            <option value="department">Department</option>
            <option value="urgency">Urgency</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
            className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[13px]"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-[13px] text-[#6b6b6b]">No requests match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-[#ececec] bg-[#fafafa]">
              <tr>
                <th className={th}>Job</th>
                <th className={th}>Department</th>
                <th className={th}>Requested by</th>
                <th className={th}>Status</th>
                <th className={th}>Urgency</th>
                <th className={th}>Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {sorted.map((r) => {
                const d = r.departments;
                const deptName = Array.isArray(d) ? d[0]?.name : d?.name;
                const p = r.submitter;
                const submitterName = Array.isArray(p) ? p[0]?.full_name : p?.full_name;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/recruitment/${r.id}`}
                        className="text-[#008B60] underline decoration-[#008B60]/25 hover:decoration-[#008B60]"
                      >
                        {r.job_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#505050]">{deptName ?? '—'}</td>
                    <td className="px-4 py-3 text-[#505050]">{submitterName?.trim() || '—'}</td>
                    <td className="px-4 py-3">{recruitmentStatusLabel(r.status)}</td>
                    <td className="px-4 py-3">{recruitmentUrgencyLabel(r.urgency)}</td>
                    <td className="px-4 py-3 text-[#505050]">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
            );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
