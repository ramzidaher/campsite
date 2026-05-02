import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { getCachedAdminApplicationsPageData } from '@/lib/jobs/getCachedAdminApplicationsPageData';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { JOB_APPLICATION_STAGES } from '@campsite/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';

function spVal(v: string | string[] | undefined): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0].trim();
  return '';
}

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pathStartedAtMs = Date.now();
  /** Reuses `(main)/layout` + `hr/layout` cache — avoids duplicate profile + `get_my_permissions` round trips. */
  const bundle = await withServerPerf(
    '/admin/applications',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  if (!permissionKeys.includes('applications.view')) redirect('/forbidden');

  const sp = await searchParams;
  const filterJobId = spVal(sp.job);
  const filterStage = spVal(sp.stage);
  const filterDept = spVal(sp.dept);
  const filterFrom = spVal(sp.from);
  const filterTo = spVal(sp.to);
  const hasFilters = Boolean(filterJobId || filterStage || filterDept || filterFrom || filterTo);
  const cachedData = await withServerPerf(
    '/admin/applications',
    hasFilters ? 'applications_bundle_filtered_cached' : 'applications_bundle_cached',
    getCachedAdminApplicationsPageData(orgId, {
      jobId: filterJobId,
      stage: filterStage,
      deptId: filterDept,
      from: filterFrom,
      to: filterTo,
    }),
    700
  );
  const jobs = cachedData.jobs;
  const departments = cachedData.departments;
  const rows = cachedData.apps as Array<Record<string, unknown>>;

  const controlClass =
    'h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';

  const view = (
    <div>
      <HideInHiringHub>
        <header className="mb-8">
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Who has applied</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
            Everyone in your hiring inbox across roles. Narrow the list with job, stage, department, or dates.
          </p>
        </header>
      </HideInHiringHub>

      <form
        method="get"
        className="mb-5 mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-[#d8d8d8] bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#6b6b6b]" htmlFor="f-job">
            Job
          </label>
          <select
            id="f-job"
            name="job"
            defaultValue={filterJobId}
            className={`min-w-[180px] ${controlClass}`}
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id as string} value={j.id as string}>
                {(j.title as string)?.trim() || 'Untitled'}{' '}
                {j.status !== 'live' ? ` (${String(j.status)})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#6b6b6b]" htmlFor="f-stage">
            Stage
          </label>
          <select
            id="f-stage"
            name="stage"
            defaultValue={filterStage}
            className={`min-w-[160px] ${controlClass}`}
          >
            <option value="">All stages</option>
            {JOB_APPLICATION_STAGES.map((s) => (
              <option key={s} value={s}>
                {jobApplicationStageLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#6b6b6b]" htmlFor="f-dept">
            Department
          </label>
          <select
            id="f-dept"
            name="dept"
            defaultValue={filterDept}
            className={`min-w-[160px] ${controlClass}`}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id as string} value={d.id as string}>
                {(d.name as string)?.trim() || '—'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#6b6b6b]" htmlFor="f-from">
            From
          </label>
          <input
            id="f-from"
            name="from"
            type="date"
            defaultValue={filterFrom}
            className={controlClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#6b6b6b]" htmlFor="f-to">
            To
          </label>
          <input
            id="f-to"
            name="to"
            type="date"
            defaultValue={filterTo}
            className={controlClass}
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
        >
          Apply filters
        </button>
        <Link
          href="/hr/applications"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-[#ececec] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Applied</th>
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#9b9b9b]">
                  No candidates match these filters. Try broadening your search.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const jl = relOne(r.job_listings as { title?: string } | { title?: string }[] | null);
                const dep = relOne(r.departments as { name?: string } | { name?: string }[] | null);
                const jobTitle = jl?.title?.trim() || '—';
                const deptName = dep?.name?.trim() || '—';
                const jid = r.job_listing_id as string;
                return (
                  <tr key={r.id as string} className="border-b border-[#f5f5f5] transition-colors hover:bg-[#f5f4f1] last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#121212]">{String(r.candidate_name)}</p>
                      <p className="text-[12px] text-[#6b6b6b]">{String(r.candidate_email)}</p>
                    </td>
                    <td className="px-4 py-3 text-[#242424]">{jobTitle}</td>
                    <td className="px-4 py-3 text-[#505050]">{deptName}</td>
                    <td className="px-4 py-3">{jobApplicationStageLabel(String(r.stage))}</td>
                    <td className="px-4 py-3 text-[#505050]">
                      {r.submitted_at
                        ? new Date(r.submitted_at as string).toLocaleDateString('en-GB', { timeZone: 'UTC', 
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/hr/jobs/${jid}/applications`} className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
                        Open job
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
  warnIfSlowServerPath('/admin/applications', pathStartedAtMs);
  return view;
}
