import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { jobApplicationStageLabel } from '@/lib/jobs/labels';
import { createClient } from '@/lib/supabase/server';
import { JOB_APPLICATION_STAGES } from '@campsite/types';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('applications.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const sp = await searchParams;
  const filterJobId = spVal(sp.job);
  const filterStage = spVal(sp.stage);
  const filterDept = spVal(sp.dept);
  const filterFrom = spVal(sp.from);
  const filterTo = spVal(sp.to);

  let applicationsQuery = supabase
    .from('job_applications')
    .select(
      `
          id,
          candidate_name,
          candidate_email,
          stage,
          submitted_at,
          job_listing_id,
          department_id,
          job_listings ( title, slug, status ),
          departments ( name )
        `
    )
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: false });

  if (filterJobId) applicationsQuery = applicationsQuery.eq('job_listing_id', filterJobId);
  if (filterStage) applicationsQuery = applicationsQuery.eq('stage', filterStage);
  if (filterDept) applicationsQuery = applicationsQuery.eq('department_id', filterDept);
  if (filterFrom) applicationsQuery = applicationsQuery.gte('submitted_at', `${filterFrom}T00:00:00.000Z`);
  if (filterTo) applicationsQuery = applicationsQuery.lte('submitted_at', `${filterTo}T23:59:59.999Z`);

  const [{ data: jobs }, { data: departments }, { data: apps, error }] = await Promise.all([
    supabase
      .from('job_listings')
      .select('id, title, status')
      .eq('org_id', orgId)
      .order('title', { ascending: true }),
    supabase.from('departments').select('id, name').eq('org_id', orgId).order('name', { ascending: true }),
    applicationsQuery,
  ]);

  if (error) notFound();

  const rows = apps ?? [];

  const controlClass =
    'h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div>
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Application tracker
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Flat database view across all jobs. Filter by job, stage, department, and date applied.
        </p>
      </div>

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
            {(jobs ?? []).map((j) => (
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
            {(departments ?? []).map((d) => (
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
                  No applications match these filters. Try broadening your search.
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
                        ? new Date(r.submitted_at as string).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/hr/jobs/${jid}/applications`} className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
                        Pipeline
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
}
