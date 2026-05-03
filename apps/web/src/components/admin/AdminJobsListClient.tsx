'use client';

import { useInHiringHub } from '@/app/(main)/hr/hiring/HiringHubContext';
import { archiveJobListing } from '@/app/(main)/admin/jobs/actions';
import { FormSelect, campusText } from '@campsite/ui/web';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobListingStatusLabel } from '@/lib/jobs/labels';
import { Archive, ExternalLink, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

export type AdminJobListRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  grade_level: string;
  salary_band: string;
  contract_type: string;
  published_at: string | null;
  applications_close_at: string | null;
  posted_year: number | null;
  department_id: string;
  departments: { name: string } | { name: string }[] | null;
};

export type DeptFilterOption = { id: string; name: string };

type ListScope = 'active' | 'archived' | 'all';

function formatStableShortDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export function AdminJobsListClient({
  rows,
  departments,
  orgSlug,
}: {
  rows: AdminJobListRow[];
  departments: DeptFilterOption[];
  orgSlug: string;
}) {
  const inHiringHub = useInHiringHub();
  const [listScope, setListScope] = useState<ListScope>('active');
  const [status, setStatus] = useState<string>('');
  const [deptId, setDeptId] = useState<string>('');
  const [grade, setGrade] = useState<string>('');
  const [contract, setContract] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [search, setSearch] = useState('');
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [archivingJobId, setArchivingJobId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isArchiving, startArchiving] = useTransition();

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const copyPublicLink = useCallback(async (jobId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      setCopiedJobId(jobId);
      copyResetTimerRef.current = setTimeout(() => {
        setCopiedJobId((cur) => (cur === jobId ? null : cur));
        copyResetTimerRef.current = null;
      }, 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const archiveListing = useCallback(
    (jobId: string) => {
      startArchiving(async () => {
        setArchiveError(null);
        setArchivingJobId(jobId);
        const res = await archiveJobListing(jobId);
        if (!res?.ok) {
          setArchiveError(res?.error ?? 'Could not archive this listing.');
        }
        setArchivingJobId(null);
      });
    },
    [startArchiving],
  );

  const gradeOptions = useMemo(() => [...new Set(rows.map((r) => r.grade_level))].sort(), [rows]);
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
      if (contract && r.contract_type !== contract) return false;
      if (year && String(r.posted_year ?? '') !== year) return false;
      return true;
    });
  }, [rows, listScope, status, deptId, grade, contract, year, search]);

  function setScope(next: ListScope) {
    setListScope(next);
    if (next !== 'all') setStatus('');
  }

  const filterSelectWrap = '!w-auto max-w-[220px] shrink-0';
  const filterSelectClass = 'pl-2.5';

  const scopeBtn = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
      on ? `bg-white ${campusText.ink} shadow-sm` : `${campusText.muted} hover:text-[#121212]`
    }`;

  return (
    <div className={inHiringHub ? 'min-w-0 pt-0' : 'mx-auto max-w-6xl px-5 py-7 sm:px-7'}>
      {inHiringHub ? null : (
        <header className="mb-6">
          <h1 className={`font-authSerif text-[26px] leading-tight tracking-[-0.03em] ${campusText.ink}`}>Job listings</h1>
          <p className={`mt-1 text-[13px] ${campusText.muted}`}>
            HR publishes approved requests as shareable public job URLs. Filter by department, grade, contract, and
            year posted. Use Active for live and draft listings, or Archived for closed roles.
          </p>
        </header>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        {archiveError ? (
          <p className="w-full rounded-lg border border-[#f5d0d0] bg-[#fff7f7] px-3 py-2 text-[12px] text-[#9f1d1d]">
            {archiveError}
          </p>
        ) : null}
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
          <FormSelect
            wrapperClassName={filterSelectWrap}
            className={filterSelectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status"
          >
            <option value="">All states</option>
            <option value="live">Live</option>
            <option value="archived">Archived</option>
            <option value="draft">Draft</option>
          </FormSelect>
        ) : null}
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={deptId}
          onChange={(e) => setDeptId(e.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">All grades</option>
          {gradeOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={contract}
          onChange={(e) => setContract(e.target.value)}
        >
          <option value="">All contract types</option>
          <option value="full_time">{recruitmentContractLabel('full_time')}</option>
          <option value="part_time">{recruitmentContractLabel('part_time')}</option>
          <option value="seasonal">{recruitmentContractLabel('seasonal')}</option>
        </FormSelect>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </FormSelect>
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
                <th className="px-4 py-3">End date</th>
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
                        href={`/hr/jobs/${r.id}/applications`}
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
                        ? formatStableShortDate(r.published_at)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#505050]">
                      {r.applications_close_at ? formatStableShortDate(r.applications_close_at) : '—'}
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
                      <div className="flex flex-wrap items-center gap-1">
                        {showPublic ? (
                          <>
                            <a
                              href={publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e5e5] bg-white text-[#008B60] shadow-sm transition-colors hover:border-[#008B60]/40 hover:bg-[#f0fdf9]"
                              aria-label={`Open public page for ${r.title} in a new tab`}
                              title="Open in new tab"
                            >
                              <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </a>
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e5e5] bg-white text-[#008B60] shadow-sm transition-colors hover:border-[#008B60]/40 hover:bg-[#f0fdf9]"
                              aria-label={`Copy public link for ${r.title}`}
                              title="Copy link"
                              onClick={() => void copyPublicLink(r.id, publicUrl)}
                            >
                              <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </button>
                          </>
                        ) : (
                          <span className="mr-1 text-[12px] text-[#9b9b9b]">Publish to enable</span>
                        )}
                        {r.status !== 'archived' ? (
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e5e5] bg-white text-[#8a4f00] shadow-sm transition-colors hover:border-[#8a4f00]/35 hover:bg-[#fff9f0] disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`Archive ${r.title}`}
                            title="Archive listing"
                            onClick={() => archiveListing(r.id)}
                            disabled={isArchiving && archivingJobId === r.id}
                          >
                            <Archive className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                        ) : null}
                        {copiedJobId === r.id ? (
                          <span className="text-[11px] font-medium text-[#008B60]" role="status">
                            Copied
                          </span>
                        ) : null}
                      </div>
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
