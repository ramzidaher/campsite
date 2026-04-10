import { CareersSessionStrip } from '@/app/(public)/jobs/CareersSessionStrip';
import { buildPublicJobsHref } from '@/app/(public)/jobs/buildPublicJobsHref';
import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { createClient } from '@/lib/supabase/server';
import {
  tenantHostMatchesOrg,
  tenantJobListingRelativePath,
  tenantJobsSubrouteRelativePath,
} from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type PublicJobListRow = {
  job_listing_id: string;
  slug: string;
  org_name: string;
  title: string;
  department_name: string;
  grade_level: string;
  salary_band: string;
  contract_type: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  published_at: string | null;
};

const PAGE_SIZE = 12;

const CONTRACT_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'seasonal', label: 'Seasonal' },
] as const;

export default async function PublicJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; contract?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const dept = sp.dept?.trim() ?? '';
  const contract = sp.contract?.trim() ?? '';
  const pageNum = Number.parseInt(sp.page ?? '1', 10);
  const page = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
  const offset = (page - 1) * PAGE_SIZE;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = h.get('x-campsite-org-slug')?.trim();
  if (!orgSlug) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: summaryRows }, { data: deptRows }, { data, error }] = await Promise.all([
    supabase.rpc('public_job_listings_org_summary', { p_org_slug: orgSlug }),
    supabase.rpc('public_job_listing_department_names', { p_org_slug: orgSlug }),
    supabase.rpc('public_job_listings', {
      p_org_slug: orgSlug,
      p_search: q || null,
      p_department: dept || null,
      p_contract_type: contract || null,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
    }),
  ]);

  if (error) {
    notFound();
  }

  const summary = summaryRows?.[0] as { live_job_count?: number; department_count?: number } | undefined;
  const liveCount = Number(summary?.live_job_count ?? 0);
  const deptCount = Number(summary?.department_count ?? 0);

  const departmentNames = (deptRows as { department_name: string }[] | null)?.map((r) => r.department_name) ?? [];

  const rows = ((data as PublicJobListRow[] | null) ?? []).slice(0, PAGE_SIZE);
  const hasNext = ((data as PublicJobListRow[] | null) ?? []).length > PAGE_SIZE;
  const hasPrev = page > 1;

  const orgDisplayName = rows[0]?.org_name ?? 'this organisation';

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <CareersSessionStrip orgSlug={orgSlug} hostHeader={host} userEmail={user?.email ?? null} />

      <div className="mx-auto max-w-3xl px-5 pt-2">
        <nav className="mb-4 flex gap-0.5 rounded-[11px] border border-[#d8d8d8] bg-[#f5f4f1] p-1">
          <span className="flex-1 rounded-[9px] bg-[#121212] py-2 text-center text-[13px] font-medium text-white">
            Open roles
          </span>
          <Link
            href={tenantJobsSubrouteRelativePath('me', orgSlug, host)}
            className="flex-1 rounded-[9px] py-2 text-center text-[13px] font-medium text-[#6b6b6b] hover:bg-[#eeecea]"
          >
            My applications
          </Link>
          <Link
            href={tenantJobsSubrouteRelativePath('me/profile', orgSlug, host)}
            className="flex-1 rounded-[9px] py-2 text-center text-[13px] font-medium text-[#6b6b6b] hover:bg-[#eeecea]"
          >
            Profile
          </Link>
        </nav>
      </div>

      <header className="border-b border-[#ececec] bg-white px-5 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Careers</p>
            <h1 className="font-authSerif text-[28px] tracking-tight">Open roles</h1>
            <p className="mt-1 text-[13px] text-[#6b6b6b]">
              {liveCount === 0
                ? 'No live vacancies right now.'
                : `${liveCount} ${liveCount === 1 ? 'position' : 'positions'} across ${deptCount} ${deptCount === 1 ? 'department' : 'departments'}`}
            </p>
          </div>
          <p className="text-[12px] text-[#9b9b9b]">{orgDisplayName}</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7">
        <form method="get" action="/jobs" className="mb-4 flex flex-col gap-2 sm:flex-row">
          {!tenantHostMatchesOrg(orgSlug, host) ? <input type="hidden" name="org" value={orgSlug} /> : null}
          {dept ? <input type="hidden" name="dept" value={dept} /> : null}
          {contract ? <input type="hidden" name="contract" value={contract} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search roles, teams, keywords…"
            className="min-h-[40px] flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#121212]"
            aria-label="Search roles"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#121212] px-4 py-2 text-[14px] font-medium text-white sm:shrink-0"
          >
            Search
          </button>
        </form>

        <div className="mb-3 flex flex-wrap gap-2">
          <span className="text-[12px] text-[#9b9b9b]">Contract:</span>
          {CONTRACT_OPTIONS.map((opt) => {
            const isActive = contract === opt.value;
            const href = buildPublicJobsHref(orgSlug, host, { q, dept, contract: opt.value, page: 1 });
            return (
              <Link
                key={opt.value || 'all'}
                href={href}
                className={[
                  'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition',
                  isActive ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:border-[#9b9b9b]',
                ].join(' ')}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-[12px] text-[#9b9b9b]">Team:</span>
          <Link
            href={buildPublicJobsHref(orgSlug, host, { q, dept: '', contract, page: 1 })}
            className={[
              'rounded-full border px-3 py-1 text-[12px]',
              !dept ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b] hover:bg-[#eeecea]',
            ].join(' ')}
          >
            All teams
          </Link>
          {departmentNames.map((name) => {
            const isActive = dept === name;
            const href = buildPublicJobsHref(orgSlug, host, { q, dept: name, contract, page: 1 });
            return (
              <Link
                key={name}
                href={href}
                className={[
                  'rounded-full border px-3 py-1 text-[12px]',
                  isActive ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b] hover:bg-[#eeecea]',
                ].join(' ')}
              >
                {name}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <section className="rounded-xl border border-[#e8e8e8] bg-white p-8 text-center">
            <h2 className="font-authSerif text-[26px]">
              {liveCount === 0 && !q && !dept && !contract ? 'No live vacancies right now' : 'No matching roles'}
            </h2>
            <p className="mt-2 text-[14px] text-[#6b6b6b]">
              {liveCount === 0 && !q && !dept && !contract
                ? 'Check back soon — new roles will appear here when published.'
                : 'Try another keyword, team, or contract filter — or clear filters to see all live roles.'}
            </p>
            <Link
              href={buildPublicJobsHref(orgSlug, host, {})}
              className="mt-4 inline-flex rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium hover:bg-[#f5f4f1]"
            >
              Clear filters
            </Link>
          </section>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map((job) => {
              const href = tenantJobListingRelativePath(job.slug, orgSlug, host);
              return (
                <li
                  key={job.job_listing_id}
                  className="group cursor-pointer rounded-xl border border-[#d8d8d8] bg-white p-5 shadow-sm transition hover:border-[#9b9b9b]"
                >
                  <Link href={href} className="block">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{job.org_name}</p>
                    <h2 className="mt-1 font-authSerif text-[22px] leading-tight text-[#121212]">{job.title}</h2>
                    <p className="mt-1 text-[13px] text-[#6b6b6b]">{job.department_name}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#eeecea] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                        {recruitmentContractLabel(job.contract_type)}
                      </span>
                      <span className="rounded-full border border-[#eeecea] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                        {job.grade_level}
                      </span>
                      <span className="rounded-full border border-[#eeecea] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                        {job.salary_band}
                      </span>
                    </div>
                    <p className="mt-3 text-[12px] text-[#6b6b6b]">Apply via {jobApplicationModeLabel(job.application_mode)}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-[#eeecea] pt-3">
                      <p className="text-[11px] text-[#9b9b9b]">
                        {job.published_at
                          ? `Posted ${new Date(job.published_at).toLocaleDateString(undefined, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}`
                          : 'Recently published'}
                      </p>
                      <span className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-1.5 text-[12px] font-medium text-[#121212] group-hover:bg-[#121212] group-hover:text-white">
                        View role →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Link
            aria-disabled={!hasPrev}
            className={`rounded-lg px-3 py-2 text-[13px] ${hasPrev ? 'border border-[#d8d8d8] bg-white hover:bg-[#f5f4f1]' : 'pointer-events-none cursor-not-allowed border border-[#ececec] text-[#b0b0b0]'}`}
            href={hasPrev ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page - 1 }) : '#'}
          >
            Previous
          </Link>
          <span className="text-[12px] text-[#6b6b6b]">Page {page}</span>
          <Link
            aria-disabled={!hasNext}
            className={`rounded-lg px-3 py-2 text-[13px] ${hasNext ? 'border border-[#d8d8d8] bg-white hover:bg-[#f5f4f1]' : 'pointer-events-none cursor-not-allowed border border-[#ececec] text-[#b0b0b0]'}`}
            href={hasNext ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page + 1 }) : '#'}
          >
            Next
          </Link>
        </div>

        <div className="mt-8 rounded-xl border border-[#d8ece5] bg-[#f0fdf9] p-4 text-[13px] text-[#14532d]">
          Want to track your applications?{' '}
          <Link className="font-medium underline" href={tenantJobsSubrouteRelativePath('login', orgSlug, host)}>
            Candidate login
          </Link>
          {' · '}
          <Link className="font-medium underline" href={tenantJobsSubrouteRelativePath('register', orgSlug, host)}>
            Create account
          </Link>
        </div>
      </main>
    </div>
  );
}
