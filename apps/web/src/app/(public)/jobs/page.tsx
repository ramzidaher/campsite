import { CareersOrgHero, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { CareersSectionNav } from '@/app/(public)/jobs/CareersSectionNav';
import { buildPublicJobsHref } from '@/app/(public)/jobs/buildPublicJobsHref';
import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
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
  { value: '', label: 'All' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'seasonal', label: 'Seasonal' },
] as const;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15zM16.5 16.5L21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const linkClass = 'underline underline-offset-[3px]';

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

  const [{ data: summaryRows }, { data: deptRows }, { data, error }, { data: orgLookup }] = await Promise.all([
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
    supabase
      .from('organisations')
      .select('name, brand_preset_key, brand_tokens, brand_policy')
      .eq('slug', orgSlug)
      .maybeSingle(),
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

  const orgName = (orgLookup?.name as string | undefined)?.trim() || rows[0]?.org_name || 'Organisation';
  const resolvedBranding = resolveOrgBranding({
    presetKey: orgLookup?.brand_preset_key,
    customTokens: orgLookup?.brand_tokens,
    policy: orgLookup?.brand_policy,
    effectiveMode: 'off',
  });
  const jobsVars = {
    ...orgBrandingCssVars(resolvedBranding.tokens),
    ['--jobs-on-primary' as string]: onColorFor(resolvedBranding.tokens.primary),
  };

  const orgQuery = !tenantHostMatchesOrg(orgSlug, host) ? <input type="hidden" name="org" value={orgSlug} /> : null;
  const year = new Date().getFullYear();

  const pillOn = 'shadow-sm';
  const pillOff = 'ring-1 ring-inset';

  const metaLabel = 'text-[10px] font-semibold uppercase tracking-[0.1em]';

  return (
    <div
      className="font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <CareersProductStrip />

        <CareersOrgHero
          orgName={orgName}
          description={
            liveCount === 0
              ? 'No open roles at the moment. Listings appear here when your organisation publishes live vacancies.'
              : `${liveCount} open ${liveCount === 1 ? 'role' : 'roles'}${deptCount > 0 ? ` across ${deptCount} ${deptCount === 1 ? 'team' : 'teams'}` : ''}. Search and filter below.`
          }
          className="mt-5"
          trailing={
            <>
              {user?.email ? (
                <p className="max-w-[240px] truncate text-[12px]" style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 78%, transparent)' }} title={user.email}>
                  {user.email}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium">
                <Link href={tenantJobsSubrouteRelativePath('me', orgSlug, host)} className={linkClass} style={{ color: 'var(--jobs-on-primary, #faf9f6)', textDecorationColor: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 35%, transparent)' }}>
                  My applications
                </Link>
                <Link href={tenantJobsSubrouteRelativePath('me/profile', orgSlug, host)} className={linkClass} style={{ color: 'var(--jobs-on-primary, #faf9f6)', textDecorationColor: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 35%, transparent)' }}>
                  Profile
                </Link>
                {!user ? (
                  <>
                    <Link href={tenantJobsSubrouteRelativePath('login', orgSlug, host)} className={linkClass} style={{ color: 'var(--jobs-on-primary, #faf9f6)', textDecorationColor: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 35%, transparent)' }}>
                      Sign in
                    </Link>
                    <Link href={tenantJobsSubrouteRelativePath('register', orgSlug, host)} className={linkClass} style={{ color: 'var(--jobs-on-primary, #faf9f6)', textDecorationColor: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 35%, transparent)' }}>
                      Register
                    </Link>
                  </>
                ) : null}
              </div>
            </>
          }
        />

        <CareersSectionNav orgSlug={orgSlug} hostHeader={host} current="browse" />

        <form method="get" action="/jobs" className="mt-7">
          {orgQuery}
          {dept ? <input type="hidden" name="dept" value={dept} /> : null}
          {contract ? <input type="hidden" name="contract" value={contract} /> : null}
          <label
            className="flex min-h-[46px] items-center gap-3 rounded-xl border px-4 transition-[box-shadow,border-color] focus-within:ring-2"
            style={{
              borderColor: 'var(--org-brand-border)',
              background: 'var(--org-brand-surface)',
              boxShadow: '0 1px 0 0 color-mix(in oklab, var(--org-brand-primary, #121212) 10%, transparent)',
            }}
          >
            <SearchIcon className="shrink-0" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search roles, teams, keywords — press Enter"
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[14px] outline-none"
              style={{ color: 'var(--org-brand-text)' }}
              aria-label="Search roles"
              autoComplete="off"
            />
          </label>
        </form>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>Contract</p>
          <div className="flex flex-wrap gap-1.5">
            {CONTRACT_OPTIONS.map((opt) => {
              const isOn = opt.value === '' ? contract === '' : contract === opt.value;
              const nextContract = opt.value === '' ? '' : contract === opt.value ? '' : opt.value;
              const href = buildPublicJobsHref(orgSlug, host, {
                q,
                dept,
                contract: nextContract,
                page: 1,
              });
              return (
                <Link
                  key={opt.value || 'all'}
                  href={href}
                  className={['rounded-lg px-3 py-1.5 text-[12px] font-semibold', isOn ? pillOn : pillOff].join(' ')}
                  style={
                    isOn
                      ? { background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }
                      : {
                          background: 'var(--org-brand-surface)',
                          color: 'var(--org-brand-muted)',
                          boxShadow: 'inset 0 0 0 1px var(--org-brand-border)',
                        }
                  }
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
          </div>
          <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>Team</p>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={buildPublicJobsHref(orgSlug, host, { q, dept: '', contract, page: 1 })}
              className={['rounded-lg px-3 py-1.5 text-[12px] font-semibold', !dept ? pillOn : pillOff].join(' ')}
              style={
                !dept
                  ? { background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }
                  : {
                      background: 'var(--org-brand-surface)',
                      color: 'var(--org-brand-muted)',
                      boxShadow: 'inset 0 0 0 1px var(--org-brand-border)',
                    }
              }
            >
              All teams
            </Link>
            {departmentNames.map((name) => {
              const isOn = dept === name;
              const nextDept = isOn ? '' : name;
              const href = buildPublicJobsHref(orgSlug, host, { q, dept: nextDept, contract, page: 1 });
              return (
                <Link
                  key={name}
                  href={href}
                  className={['rounded-lg px-3 py-1.5 text-[12px] font-semibold', isOn ? pillOn : pillOff].join(' ')}
                  style={
                    isOn
                      ? { background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }
                      : {
                          background: 'var(--org-brand-surface)',
                          color: 'var(--org-brand-muted)',
                          boxShadow: 'inset 0 0 0 1px var(--org-brand-border)',
                        }
                  }
                >
                  {name}
                </Link>
              );
            })}
          </div>
          </div>
        </div>
        {(q || dept || contract) ? (
          <div className="mt-4">
            <Link
              href={buildPublicJobsHref(orgSlug, host, {})}
              className="inline-flex rounded-md px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
            >
              Clear filters
            </Link>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <section className="mt-10 rounded-2xl border px-6 py-12 text-center">
            <h2 className="font-authSerif text-[1.375rem]" style={{ color: 'var(--org-brand-text)' }}>
              {liveCount === 0 && !q && !dept && !contract ? 'No open roles yet' : 'No matching roles'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
              {liveCount === 0 && !q && !dept && !contract
                ? 'When vacancies go live, they will show here.'
                : 'Try different keywords or clear filters to see everything that is open.'}
            </p>
            <Link
              href={buildPublicJobsHref(orgSlug, host, {})}
              className="mt-6 inline-flex rounded-lg px-4 py-2.5 text-[13px] font-semibold hover:opacity-90"
              style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
            >
              Clear filters
            </Link>
          </section>
        ) : (
          <>
            <div className="mb-3 mt-7 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
                Open roles
              </h2>
              <span className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
                {rows.length} result{rows.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="grid gap-3">
            {rows.map((job) => {
              const href = tenantJobListingRelativePath(job.slug, orgSlug, host);
              const posted =
                job.published_at &&
                new Date(job.published_at).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
              return (
                <li key={job.job_listing_id}>
                  <Link
                    href={href}
                    className="group flex h-full items-start justify-between gap-5 overflow-hidden rounded-2xl border p-5 transition-[border-color,box-shadow]"
                    style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
                  >
                    <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em]" style={{ color: 'var(--org-brand-text)' }}>
                      {job.title}
                    </h2>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                      <div className="min-w-0">
                        <dt className={metaLabel} style={{ color: 'var(--org-brand-muted)' }}>Team</dt>
                        <dd className="mt-0.5 truncate" style={{ color: 'var(--org-brand-text)' }}>{job.department_name}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={metaLabel} style={{ color: 'var(--org-brand-muted)' }}>Contract</dt>
                        <dd className="mt-0.5" style={{ color: 'var(--org-brand-text)' }}>{recruitmentContractLabel(job.contract_type)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={metaLabel} style={{ color: 'var(--org-brand-muted)' }}>Salary band</dt>
                        <dd className="mt-0.5 truncate" style={{ color: 'var(--org-brand-text)' }}>{job.salary_band}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={metaLabel} style={{ color: 'var(--org-brand-muted)' }}>Grade</dt>
                        <dd className="mt-0.5" style={{ color: 'var(--org-brand-text)' }}>{job.grade_level}</dd>
                      </div>
                      <div className="col-span-2 min-w-0 border-t pt-3" style={{ borderColor: 'var(--org-brand-border)' }}>
                        <dt className={metaLabel} style={{ color: 'var(--org-brand-muted)' }}>Posted</dt>
                        <dd className="mt-0.5" style={{ color: 'var(--org-brand-text)' }}>{posted ?? '—'}</dd>
                      </div>
                    </dl>

                    <p className="mt-4 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
                      Apply with <span className="font-medium" style={{ color: 'var(--org-brand-text)' }}>{jobApplicationModeLabel(job.application_mode)}</span>
                    </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="mb-3 text-[11px]" style={{ color: 'var(--org-brand-muted)' }}>Apply with CV upload</p>
                      <span
                        className="inline-flex items-center rounded-md px-3 py-2 text-[12px] font-semibold"
                        style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
                      >
                        View role →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
            </ul>
          </>
        )}

        <div className="mt-8 flex items-center justify-between border-t pt-6" style={{ borderColor: 'var(--org-brand-border)' }}>
          <Link
            aria-disabled={!hasPrev}
            className={`rounded-lg px-3 py-2 text-[13px] font-medium ${
              hasPrev
                ? ''
                : 'cursor-not-allowed'
            }`}
            href={hasPrev ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page - 1 }) : '#'}
            style={
              hasPrev
                ? { background: 'var(--org-brand-surface)', color: 'var(--org-brand-text)', boxShadow: 'inset 0 0 0 1px var(--org-brand-border)' }
                : { color: 'var(--org-brand-muted)' }
            }
          >
            Previous
          </Link>
          <span className="text-[12px] tabular-nums" style={{ color: 'var(--org-brand-muted)' }}>Page {page}</span>
          <Link
            aria-disabled={!hasNext}
            className={`rounded-lg px-3 py-2 text-[13px] font-medium ${
              hasNext
                ? ''
                : 'cursor-not-allowed'
            }`}
            href={hasNext ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page + 1 }) : '#'}
            style={
              hasNext
                ? { background: 'var(--org-brand-surface)', color: 'var(--org-brand-text)', boxShadow: 'inset 0 0 0 1px var(--org-brand-border)' }
                : { color: 'var(--org-brand-muted)' }
            }
          >
            Next
          </Link>
        </div>

        <footer className="mt-10 rounded-xl border px-5 py-4 text-[13px]" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)', color: 'var(--org-brand-muted)' }}>
          <span className="font-medium" style={{ color: 'var(--org-brand-text)' }}>Candidates:</span>{' '}
          <Link className={`${linkClass} font-semibold`} href={tenantJobsSubrouteRelativePath('login', orgSlug, host)} style={{ color: 'var(--org-brand-primary)', textDecorationColor: 'var(--org-brand-border)' }}>
            Sign in
          </Link>
          {' · '}
          <Link className={`${linkClass} font-semibold`} href={tenantJobsSubrouteRelativePath('register', orgSlug, host)} style={{ color: 'var(--org-brand-primary)', textDecorationColor: 'var(--org-brand-border)' }}>
            Create an account
          </Link>
          {' '}to save progress and track applications.
        </footer>

        <div className="mt-12 border-t pt-8" style={{ borderColor: 'var(--org-brand-border)' }}>
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div>
              <p className="font-authSerif text-[1.125rem]" style={{ color: 'var(--org-brand-text)' }}>Campsite</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--org-brand-muted)' }}>Careers</p>
            </div>
            <div className="max-w-md space-y-1 text-[11px] leading-relaxed sm:text-right" style={{ color: 'var(--org-brand-muted)' }}>
              <p>© {year} Common Ground Studios Ltd. All rights reserved.</p>
              <p>
                Campsite is a product of Common Ground Studios Ltd. Job listings are published by the organisation named
                above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
