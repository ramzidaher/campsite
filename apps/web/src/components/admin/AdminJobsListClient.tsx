'use client';

import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobListingStatusLabel } from '@/lib/jobs/labels';
import { JOB_LISTING_STATUSES, type JobListingStatus } from '@campsite/types';
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

export function AdminJobsListClient({
  rows,
  departments,
  orgSlug,
}: {
  rows: AdminJobListRow[];
  departments: DeptFilterOption[];
  orgSlug: string;
}) {
  const [status, setStatus] = useState<string>('');
  const [deptId, setDeptId] = useState<string>('');
  const [grade, setGrade] = useState<string>('');
  const [salary, setSalary] = useState<string>('');
  const [contract, setContract] = useState<string>('');
  const [year, setYear] = useState<string>('');

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
      if (status && r.status !== status) return false;
      if (deptId && r.department_id !== deptId) return false;
      if (grade && r.grade_level !== grade) return false;
      if (salary && r.salary_band !== salary) return false;
      if (contract && r.contract_type !== contract) return false;
      if (year && String(r.posted_year ?? '') !== year) return false;
      return true;
    });
  }, [rows, status, deptId, grade, salary, contract, year]);

  const sel =
    'rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[13px] text-[#121212]';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Job listings</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Publish roles to a public page on your organisation&apos;s subdomain. Filter by tags copied from each
          recruitment brief.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {JOB_LISTING_STATUSES.map((s: JobListingStatus) => (
            <option key={s} value={s}>
              {jobListingStatusLabel(s)}
            </option>
          ))}
        </select>
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
        <p className="text-[13px] text-[#6b6b6b]">No listings match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-[#ececec] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Posted</th>
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
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/jobs/${r.id}/edit`}
                        className="text-[#008B60] underline decoration-[#008B60]/25 hover:decoration-[#008B60]"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#505050]">{deptName ?? '—'}</td>
                    <td className="px-4 py-3">{jobListingStatusLabel(r.status)}</td>
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
      )}
    </div>
  );
}
