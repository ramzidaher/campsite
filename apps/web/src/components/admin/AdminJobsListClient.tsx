'use client';

import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobListingStatusLabel } from '@/lib/jobs/labels';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export type AdminJobListRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  grade_level: string;
  salary_band: string;
  contract_type: string;
  published_at: string | null;
  posted_year: number | null;
  department_id: string;
  departments: { name: string } | { name: string }[] | null;
};

export type DeptFilterOption = { id: string; name: string };

type ListScope = 'active' | 'archived' | 'all';

export function AdminJobsListClient({
  rows,
  departments,
  orgSlug,
}: {
  rows: AdminJobListRow[];
  departments: DeptFilterOption[];
  orgSlug: string;
}) {
  const [listScope, setListScope] = useState<ListScope>('active');
  const [status, setStatus] = useState<string>('');
  const [deptId, setDeptId] = useState<string>('');
  const [grade, setGrade] = useState<string>('');
  const [salary, setSalary] = useState<string>('');
  const [contract, setContract] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [search, setSearch] = useState('');

  const gradeOptions = useMemo(() => [...new Set(rows.map((r) => r.grade_level))].sort(), [rows]);
  const salaryOptions = useMemo(() => [...new Set(rows.map((r) => r.salary_band))].sort(), [rows]);
  const years = useMemo(() => {
    const ys = rows
      .map((r) => r.posted_year)
      .filter((y): y is number => y != null && !Number.isNaN(y));
    return [...new Set(ys)].sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (listScope === 'active' && r.status !== 'live' && r.status !== 'draft') return false;
      if (listScope === 'archived' && r.status !== 'archived') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const deptName = (Array.isArray(r.departments) ? r.departments[0]?.name : r.departments?.name) ?? '';
        if (!r.title.toLowerCase().includes(q) && !deptName.toLowerCase().includes(q)) return false;
      }
      if (listScope === 'all' && status && r.status !== status) return false;
      if (deptId && r.department_id !== deptId) return false;
      if (grade && r.grade_level !== grade) return false;
      if (salary && r.salary_band !== salary) return false;
      if (contract && r.contract_type !== contract) return false;
      if (year && String(r.posted_year ?? '') !== year) return false;
      return true;
    });
  }, [rows, listScope, status, deptId, grade, salary, contract, year, search]);

  function setScope(next: ListScope) {
    setListScope(next);
    if (next !== 'all') setStatus('');
  }

  const sel =
    'h-9 rounded-lg border border-[#d8d8d8] bg-white px-2.5 text-[13px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';

  const scopeBtn = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
      on ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]'
    }`;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <header className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Job listings</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          HR publishes approved requests as shareable public job URLs. Filter by department, grade, contract,
          salary band, and year posted. Use Active for live and draft listings, or Archived for closed roles.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <div
          className="inline-flex h-9 shrink-0 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-0.5"
          role="group"
          aria-label="Listing scope"
        >
          <button type="button" className={scopeBtn(listScope === 'active')} onClick={() => setScope('active')}>
            Active
          </button>
          <button type="button" className={scopeBtn(listScope === 'archived')} onClick={() => setScope('archived')}>
            Archived
          </button>
          <button type="button" className={scopeBtn(listScope === 'all')} onClick={() => setScope('all')}>
            All
          </button>
        </div>
        <div className="flex h-9 w-full max-w-[260px] items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 transition-[box-shadow,border-color] focus-within:border-[#121212] focus-within:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]">
          <span className="text-[13px] text-[#9b9b9b]" aria-hidden>
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or department..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
          />
        </div>
        {listScope === 'all' ? (
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All states</option>
            <option value="live">Live</option>
            <option value="archived">Archived</option>
            <option value="draft">Draft</option>
          </select>
        ) : null}
        <select className={sel} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className={sel} value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">All grades</option>
          {gradeOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select className={sel} value={salary} onChange={(e) => setSalary(e.target.value)}>
          <option value="">All salary bands</option>
          {salaryOptions.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </select>
        <select className={sel} value={contract} onChange={(e) => setContract(e.target.value)}>
          <option value="">All contract types</option>
          <option value="full_time">{recruitmentContractLabel('full_time')}</option>
          <option value="part_time">{recruitmentContractLabel('part_time')}</option>
          <option value="seasonal">{recruitmentContractLabel('seasonal')}</option>
        </select>
        <select className={sel} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-[#6b6b6b]">No listings match these filters.</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">Try adjusting one or more filters to broaden results.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
          <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-[#ececec] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Posted</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Public link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {filtered.map((r) => {
                const d = r.departments;
                const deptName = Array.isArray(d) ? d[0]?.name : d?.name;
                const showPublic = r.status === 'live' && r.slug && !r.slug.startsWith('draft-');
                const publicUrl = showPublic ? tenantJobPublicUrl(orgSlug, r.slug) : '';
                return (
                  <tr key={r.id} className="transition-colors hover:bg-[#f5f4f1]">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/hr/jobs/${r.id}/edit`}
                        className="text-[#008B60] underline decoration-[#008B60]/25 hover:decoration-[#008B60]"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#505050]">{deptName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-[#d8d8d8] px-2.5 py-1 text-[11px]">
                        {jobListingStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#505050]">
                      {r.published_at
                        ? new Date(r.published_at).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px]">{r.grade_level}</span>
                        <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px]">
                          {recruitmentContractLabel(r.contract_type as 'full_time' | 'part_time' | 'seasonal')}
                        </span>
                        <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px]">{r.salary_band}</span>
                        {r.posted_year ? (
                          <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px]">{r.posted_year}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {showPublic ? (
                        <button
                          type="button"
                          className="text-[12px] font-medium text-[#008B60] hover:underline"
                          onClick={() => {
                            void navigator.clipboard.writeText(publicUrl);
                          }}
                        >
                          Copy link
                        </button>
                      ) : (
                        <span className="text-[12px] text-[#9b9b9b]">Publish to enable</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
