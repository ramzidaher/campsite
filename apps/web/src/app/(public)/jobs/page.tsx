import { CareersHeader, CareersJobsHero } from '@/app/(public)/jobs/CareersBranding';
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
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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

  const [{ data: summaryRows }, { data, error }, { data: orgLookup }] =
    await Promise.all([
      supabase.rpc('public_job_listings_org_summary', { p_org_slug: orgSlug }),
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
        .select('name, logo_url, brand_preset_key, brand_tokens, brand_policy')
        .eq('slug', orgSlug)
        .maybeSingle(),
    ]);

  if (error) notFound();

  const summary = summaryRows?.[0] as
    | { live_job_count?: number; department_count?: number }
    | undefined;
  const liveCount = Number(summary?.live_job_count ?? 0);
  const deptCount = Number(summary?.department_count ?? 0);
  const rows = ((data as PublicJobListRow[] | null) ?? []).slice(0, PAGE_SIZE);
  const hasNext = ((data as PublicJobListRow[] | null) ?? []).length > PAGE_SIZE;
  const hasPrev = page > 1;

  const orgName = (orgLookup?.name as string | undefined)?.trim() || rows[0]?.org_name || 'Organisation';
  const orgLogoUrl = (orgLookup as { logo_url?: string | null } | null)?.logo_url ?? null;

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

  const orgQuery = !tenantHostMatchesOrg(orgSlug, host) ? (
    <input type="hidden" name="org" value={orgSlug} />
  ) : null;
  const year = new Date().getFullYear();

  const heroDescription =
    liveCount === 0
      ? 'No open roles at the moment — check back soon for new opportunities.'
      : `${liveCount} open ${liveCount === 1 ? 'role' : 'roles'}${deptCount > 0 ? ` across ${deptCount} ${deptCount === 1 ? 'team' : 'teams'}` : ''}.`;

  const actionLinkClass =
    'rounded-lg px-3 py-1.5 transition-colors hover:bg-black/[0.06]';
  const actionLinkStyle = { color: 'var(--org-brand-text)' } as const;

  const pillActive = {
    background: 'var(--org-brand-primary)',
    color: 'var(--jobs-on-primary)',
  } as const;
  const pillIdle = {
    background: 'var(--org-brand-surface)',
    color: 'var(--org-brand-muted)',
    boxShadow: 'inset 0 0 0 1px var(--org-brand-border)',
  } as const;

  return (
    <div
      className="font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <CareersHeader
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          orgSlug={orgSlug}
          hostHeader={host}
          current="browse"
          actions={
            <>
              {user ? (
                <span
                  className="hidden max-w-[200px] truncate text-[12px] sm:block"
                  style={{ color: 'var(--org-brand-muted)' }}
                  title={user.email}
                >
                  {user.email}
                </span>
              ) : (
                <>
                  <Link
                    href={tenantJobsSubrouteRelativePath('login', orgSlug, host)}
                    className={actionLinkClass}
                    style={actionLinkStyle}
                  >
                    Sign in
                  </Link>
                  <Link
                    href={tenantJobsSubrouteRelativePath('register', orgSlug, host)}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                    style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
                  >
                    Register
                  </Link>
                </>
              )}
            </>
          }
        />

        {/* ── Hero ── */}
        <CareersJobsHero orgName={orgName} description={heroDescription} />

        {/* ── Search ── */}
        <form method="get" action="/jobs" className="mt-6">
          {orgQuery}
          {dept ? <input type="hidden" name="dept" value={dept} /> : null}
          {contract ? <input type="hidden" name="contract" value={contract} /> : null}
          <label
            className="flex min-h-[48px] items-center gap-3 rounded-xl border px-4 shadow-sm transition-[box-shadow,border-color] focus-within:ring-2"
            style={{
              borderColor: 'var(--org-brand-border)',
              background: 'var(--org-brand-surface)',
              color: 'var(--org-brand-text)',
            }}
          >
            <SearchIcon className="shrink-0 opacity-50" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search roles, teams, keywords…"
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[14px] outline-none placeholder:opacity-50"
              aria-label="Search roles"
              autoComplete="off"
            />
            {q ? (
              <Link
                href={buildPublicJobsHref(orgSlug, host, { dept, contract, page: 1 })}
                className="shrink-0 rounded-md px-2 py-1 text-[12px] opacity-60 hover:opacity-100"
                style={{ color: 'var(--org-brand-muted)' }}
                aria-label="Clear search"
              >
                ✕
              </Link>
            ) : null}
          </label>
        </form>

        {/* ── Filters ── */}
        <div className="mt-5">
          <p
            className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--org-brand-muted)' }}
          >
            Contract
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CONTRACT_OPTIONS.map((opt) => {
              const isOn = opt.value === '' ? contract === '' : contract === opt.value;
              const nextContract = opt.value === '' ? '' : contract === opt.value ? '' : opt.value;
              return (
                <Link
                  key={opt.value || 'all'}
                  href={buildPublicJobsHref(orgSlug, host, { q, dept: '', contract: nextContract, page: 1 })}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-opacity hover:opacity-80"
                  style={isOn ? pillActive : pillIdle}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Divider + result count ── */}
        <div
          className="mt-8 flex items-center justify-between border-b pb-4"
          style={{ borderColor: 'var(--org-brand-border)' }}
        >
          <p className="text-[13px] font-medium" style={{ color: 'var(--org-brand-text)' }}>
            {(q || dept || contract) ? 'Filtered results' : 'All open roles'}
          </p>
          <p className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
            {rows.length} {rows.length === 1 ? 'role' : 'roles'}
          </p>
        </div>

        {/* ── Job list ── */}
        {rows.length === 0 ? (
          <section className="mt-8 rounded-2xl border px-6 py-14 text-center" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}>
            <p
              className="font-authSerif text-[1.375rem]"
              style={{ color: 'var(--org-brand-text)' }}
            >
              {liveCount === 0 && !q && !dept && !contract
                ? 'No open roles yet'
                : 'No matching roles'}
            </p>
            <p
              className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed"
              style={{ color: 'var(--org-brand-muted)' }}
            >
              {liveCount === 0 && !q && !dept && !contract
                ? 'When vacancies go live they will appear here.'
                : 'Try different keywords or clear the filters.'}
            </p>
            {(q || dept || contract) ? (
              <Link
                href={buildPublicJobsHref(orgSlug, host, {})}
                className="mt-6 inline-flex rounded-xl px-5 py-2.5 text-[13px] font-semibold hover:opacity-90"
                style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
              >
                Clear filters
              </Link>
            ) : null}
          </section>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {rows.map((job) => {
              const href = tenantJobListingRelativePath(job.slug, orgSlug, host);
              const daysAgo = job.published_at
                ? Math.floor(
                    (Date.now() - new Date(job.published_at).getTime()) / (1000 * 60 * 60 * 24)
                  )
                : null;
              const postedLabel =
                daysAgo === null
                  ? null
                  : daysAgo === 0
                  ? 'Today'
                  : daysAgo === 1
                  ? 'Yesterday'
                  : daysAgo < 30
                  ? `${daysAgo}d ago`
                  : new Date(job.published_at!).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                    });

              return (
                <li key={job.job_listing_id}>
                  <Link
                    href={href}
                    className="group flex h-full flex-col rounded-2xl border p-5 transition-all hover:shadow-md"
                    style={{
                      borderColor: 'var(--org-brand-border)',
                      background: 'var(--org-brand-surface)',
                    }}
                  >
                    {/* Title */}
                    <h2
                      className="text-[16px] font-semibold leading-snug tracking-[-0.01em]"
                      style={{ color: 'var(--org-brand-text)' }}
                    >
                      {job.title}
                    </h2>

                    {/* Tags */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span
                        className="rounded-md px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          background: 'color-mix(in oklab, var(--org-brand-primary) 12%, var(--org-brand-surface))',
                          color: 'var(--org-brand-text)',
                        }}
                      >
                        {job.department_name}
                      </span>
                      <span
                        className="rounded-md px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          background: 'color-mix(in oklab, var(--org-brand-border) 50%, var(--org-brand-surface))',
                          color: 'var(--org-brand-muted)',
                        }}
                      >
                        {recruitmentContractLabel(job.contract_type)}
                      </span>
                      {job.salary_band?.trim() ? (
                        <span
                          className="rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            background: 'color-mix(in oklab, var(--org-brand-border) 50%, var(--org-brand-surface))',
                            color: 'var(--org-brand-muted)',
                          }}
                        >
                          {job.salary_band.startsWith('£') ? job.salary_band : `£${job.salary_band}`}
                        </span>
                      ) : null}
                    </div>

                    {/* Footer */}
                    <div
                      className="mt-auto flex items-center justify-between border-t pt-4"
                      style={{ borderColor: 'var(--org-brand-border)', marginTop: '1rem' }}
                    >
                      <p className="text-[11px]" style={{ color: 'var(--org-brand-muted)' }}>
                        {postedLabel ? `Posted ${postedLabel}` : 'Recently posted'}
                        {' · '}
                        {jobApplicationModeLabel(job.application_mode)}
                      </p>
                      <span
                        className="text-[12px] font-semibold transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--org-brand-primary)' }}
                        aria-hidden
                      >
                        →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* ── Pagination ── */}
        {(hasPrev || hasNext) ? (
          <div
            className="mt-8 flex items-center justify-between border-t pt-6"
            style={{ borderColor: 'var(--org-brand-border)' }}
          >
            <Link
              aria-disabled={!hasPrev}
              className={`rounded-xl border px-4 py-2 text-[13px] font-medium transition-opacity ${hasPrev ? 'hover:opacity-80' : 'cursor-not-allowed opacity-30'}`}
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)', color: 'var(--org-brand-text)' }}
              href={hasPrev ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page - 1 }) : '#'}
            >
              ← Previous
            </Link>
            <span className="text-[12px] tabular-nums" style={{ color: 'var(--org-brand-muted)' }}>
              Page {page}
            </span>
            <Link
              aria-disabled={!hasNext}
              className={`rounded-xl border px-4 py-2 text-[13px] font-medium transition-opacity ${hasNext ? 'hover:opacity-80' : 'cursor-not-allowed opacity-30'}`}
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)', color: 'var(--org-brand-text)' }}
              href={hasNext ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page + 1 }) : '#'}
            >
              Next →
            </Link>
          </div>
        ) : null}

        {/* ── Footer ── */}
        <footer
          className="mt-16 border-t pt-10"
          style={{ borderColor: 'var(--org-brand-border)' }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-authSerif text-[1.125rem]" style={{ color: 'var(--org-brand-text)' }}>
                Campsite
              </p>
              <p
                className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em]"
                style={{ color: 'var(--org-brand-muted)' }}
              >
                Careers
              </p>
            </div>
            <div
              className="space-y-1 text-[11px] leading-relaxed sm:text-right"
              style={{ color: 'var(--org-brand-muted)' }}
            >
              <p>
                <Link
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                  href={tenantJobsSubrouteRelativePath('login', orgSlug, host)}
                  style={{ color: 'var(--org-brand-text)' }}
                >
                  Sign in
                </Link>
                {' or '}
                <Link
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                  href={tenantJobsSubrouteRelativePath('register', orgSlug, host)}
                  style={{ color: 'var(--org-brand-text)' }}
                >
                  Register
                </Link>
                {' to track your applications.'}
              </p>
              <p className="opacity-60">
                © {year} Common Ground Studios Ltd. Job listings published by {orgName}.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
