import { CareersHeader, CareersJobsHero } from '@/app/(public)/jobs/CareersBranding';
import { buildPublicJobsHref } from '@/app/(public)/jobs/buildPublicJobsHref';
import { advertClosingDateToApplicationsCloseAtIso } from '@/lib/datetime/advertClosingDateToApplicationsCloseAtIso';
import { mergeOrgTimeZoneIntoFormatOptions } from '@/lib/datetime';
import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { createClient } from '@/lib/supabase/server';
import {
  tenantHostMatchesOrg,
  tenantJobListingRelativePath,
  tenantJobsSubrouteRelativePath,
} from '@/lib/tenant/adminUrl';
import { ArrowRight, BriefcaseBusiness, CalendarClock, ChevronLeft, ChevronRight, FilterX, Search, SlidersHorizontal } from 'lucide-react';
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

type PublicJobTimelineRow = {
  id: string;
  recruitment_request_id: string | null;
  applications_close_at: string | null;
  start_date_needed: string | null;
  shortlisting_dates: unknown;
  interview_dates: unknown;
};

type RecruitmentTimelineRow = {
  id: string;
  advert_closing_date: string | null;
  shortlisting_dates: unknown;
  interview_schedule: unknown;
  start_date_needed: string | null;
};

const PAGE_SIZE = 12;

const CONTRACT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'seasonal', label: 'Seasonal' },
] as const;

function formatDateValue(iso: string | null | undefined, orgTz: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(
    'en-GB',
    mergeOrgTimeZoneIntoFormatOptions(orgTz, { day: 'numeric', month: 'short', year: 'numeric' }),
  );
}

function formatDateTimeValue(iso: string | null | undefined, orgTz: string | null | undefined): string {
  if (!iso) return 'Rolling';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Rolling';
  return d.toLocaleString(
    'en-GB',
    mergeOrgTimeZoneIntoFormatOptions(orgTz, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
}

function parseDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function toDateOnly(value: string): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDdMm(date: Date, withYear: boolean): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return withYear ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}`;
}

function formatMultiDateSummary(values: string[]): string {
  const sortedUnique = Array.from(
    new Set(
      values
        .map(toDateOnly)
        .filter((d): d is Date => Boolean(d))
        .map((d) => d.toISOString().slice(0, 10)),
    ),
  )
    .map((isoDay) => new Date(`${isoDay}T00:00:00.000Z`))
    .sort((a, b) => a.getTime() - b.getTime());

  if (sortedUnique.length === 0) return '';
  if (sortedUnique.length === 1) return formatDateDdMm(sortedUnique[0], true);

  const isConsecutive = sortedUnique
    .slice(1)
    .every((d, idx) => d.getTime() - sortedUnique[idx]!.getTime() === 24 * 60 * 60 * 1000);

  if (isConsecutive) {
    return `${formatDateDdMm(sortedUnique[0], false)} to ${formatDateDdMm(
      sortedUnique[sortedUnique.length - 1],
      true,
    )}`;
  }

  const prefix = sortedUnique
    .slice(0, -1)
    .map((d) => formatDateDdMm(d, false));
  const last = formatDateDdMm(sortedUnique[sortedUnique.length - 1], true);
  if (prefix.length === 1) return `${prefix[0]} and ${last}`;
  return `${prefix.slice(0, -1).join(', ')}, ${prefix[prefix.length - 1]} and ${last}`;
}

function parseInterviewDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (typeof row === 'string') return row.trim();
      const rec = row as { date?: unknown; interviewDate?: unknown; interview_date?: unknown } | null;
      return String(rec?.date ?? rec?.interviewDate ?? rec?.interview_date ?? '').trim();
    })
    .filter(Boolean);
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
        .select('name, logo_url, brand_preset_key, brand_tokens, brand_policy, timezone')
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
  const listingIds = rows.map((r) => r.job_listing_id);
  const orgTimeZone = String((orgLookup as { timezone?: string | null } | null)?.timezone ?? '').trim() || null;

  const timelineMap = new Map<string, PublicJobTimelineRow>();
  if (listingIds.length > 0) {
    const timelineWithNewCols = await supabase
      .from('job_listings')
      .select('id, recruitment_request_id, applications_close_at, start_date_needed, shortlisting_dates, interview_dates')
      .in('id', listingIds);
    const fallbackTimelineRows = timelineWithNewCols.error
      ? await supabase
          .from('job_listings')
          .select('id, recruitment_request_id')
          .in('id', listingIds)
      : null;
    const timelineRows = (fallbackTimelineRows?.data ?? timelineWithNewCols.data ?? []) as Array<Record<string, unknown>>;

    const requestIds = Array.from(
      new Set(
        timelineRows
          .map((row) => String(row.recruitment_request_id ?? '').trim())
          .filter(Boolean),
      ),
    );
    const requestMap = new Map<string, RecruitmentTimelineRow>();
    if (requestIds.length > 0) {
      const { data: reqRows } = await supabase
        .from('recruitment_requests')
        .select('id, advert_closing_date, shortlisting_dates, interview_schedule, start_date_needed')
        .in('id', requestIds);
      for (const req of (reqRows ?? []) as RecruitmentTimelineRow[]) {
        requestMap.set(String(req.id), req);
      }
    }

    for (const row of timelineRows) {
      const reqId = String(row.recruitment_request_id ?? '').trim();
      const req = reqId ? requestMap.get(reqId) : undefined;
      const jobShortlisting = parseDateList(row.shortlisting_dates);
      const jobInterviewDates = parseDateList(row.interview_dates);
      timelineMap.set(String(row.id), {
        id: String(row.id ?? ''),
        recruitment_request_id: reqId || null,
        applications_close_at:
          String(row.applications_close_at ?? '').trim() ||
          advertClosingDateToApplicationsCloseAtIso(req?.advert_closing_date ?? null, orgTimeZone),
        start_date_needed:
          String(row.start_date_needed ?? '').trim() ||
          String(req?.start_date_needed ?? '').trim() ||
          null,
        shortlisting_dates: jobShortlisting.length > 0 ? jobShortlisting : (req?.shortlisting_dates ?? []),
        interview_dates: jobInterviewDates.length > 0 ? jobInterviewDates : parseInterviewDateList(req?.interview_schedule),
      });
    }
  }

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
      ? 'No open roles at the moment  check back soon for new opportunities.'
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
  const departmentOptions = Array.from(new Set(rows.map((job) => job.department_name).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <div
      className="font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
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

        <section className="mt-6 rounded-3xl border p-6 sm:p-8" style={{ borderColor: 'var(--org-brand-border)', background: 'linear-gradient(135deg, color-mix(in oklab, var(--org-brand-primary) 8%, var(--org-brand-bg)) 0%, var(--org-brand-bg) 72%)' }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--org-brand-muted)' }}>
                Careers portal
              </p>
              <h1 className="mt-1 font-authSerif text-[2rem] leading-tight tracking-[-0.03em] text-[#121212]">
                Find your next role at {orgName}
              </h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
                {heroDescription}
              </p>
            </div>
            <div className="grid w-full max-w-[360px] grid-cols-2 gap-2.5">
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}>
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>Open roles</p>
                <p className="mt-1 text-[22px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>{liveCount}</p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}>
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>Teams hiring</p>
                <p className="mt-1 text-[22px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>{deptCount}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside>
            <form method="get" action="/jobs" className="sticky top-6 rounded-2xl border p-4" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}>
              {orgQuery}
              <div className="mb-4 flex items-center justify-between">
                <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  Filters
                </p>
                {(q || dept || contract) ? (
                  <Link
                    href={buildPublicJobsHref(orgSlug, host, {})}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium hover:opacity-80"
                    style={{ color: 'var(--org-brand-muted)' }}
                  >
                    <FilterX className="h-3.5 w-3.5" aria-hidden />
                    Reset
                  </Link>
                ) : null}
              </div>
              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>
                  Keywords
                </span>
                <div className="flex h-10 items-center gap-2 rounded-xl border px-3" style={{ borderColor: 'var(--org-brand-border)' }}>
                  <Search className="h-4 w-4 opacity-60" aria-hidden />
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Role, skill, team"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:opacity-50"
                    autoComplete="off"
                  />
                </div>
              </label>
              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>
                  Department
                </span>
                <select
                  name="dept"
                  defaultValue={dept}
                  className="h-10 w-full rounded-xl border px-3 text-[13px] outline-none"
                  style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
                >
                  <option value="">All departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>
                  Contract type
                </span>
                <select
                  name="contract"
                  defaultValue={contract}
                  className="h-10 w-full rounded-xl border px-3 text-[13px] outline-none"
                  style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
                >
                  <option value="">All contracts</option>
                  {CONTRACT_OPTIONS.filter((option) => option.value !== '').map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
              >
                Apply filters
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--org-brand-border)' }}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--org-brand-muted)' }}>
                  Quick contract filters
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CONTRACT_OPTIONS.map((opt) => {
                    const isOn = opt.value === '' ? contract === '' : contract === opt.value;
                    const nextContract = opt.value === '' ? '' : contract === opt.value ? '' : opt.value;
                    return (
                      <Link
                        key={opt.value || 'all'}
                        href={buildPublicJobsHref(orgSlug, host, { q, dept, contract: nextContract, page: 1 })}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                        style={isOn ? pillActive : pillIdle}
                      >
                        {opt.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </form>
          </aside>

          <div>
            <div
              className="flex items-center justify-between rounded-xl border px-4 py-3"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              <p className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--org-brand-text)' }}>
                <BriefcaseBusiness className="h-4 w-4" aria-hidden />
                {(q || dept || contract) ? 'Filtered roles' : 'All open roles'}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
                {rows.length} {rows.length === 1 ? 'result' : 'results'}
              </p>
            </div>

            {rows.length === 0 ? (
              <section className="mt-4 rounded-2xl border px-6 py-14 text-center" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}>
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
              <ul className="mt-4 space-y-3">
                {rows.map((job) => {
                  const href = tenantJobListingRelativePath(job.slug, orgSlug, host);
                  const timeline = timelineMap.get(job.job_listing_id);
                  const shortlistingDates = parseDateList(timeline?.shortlisting_dates);
                  const interviewDates = parseDateList(timeline?.interview_dates);
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
                      : new Date(job.published_at!).toLocaleDateString(
                          'en-GB',
                          mergeOrgTimeZoneIntoFormatOptions(orgTimeZone, {
                            month: 'short',
                            year: 'numeric',
                          }),
                        );

                  return (
                    <li key={job.job_listing_id}>
                      <Link
                        href={href}
                        className="group block rounded-2xl border p-5 transition-all hover:shadow-md"
                        style={{
                          borderColor: 'var(--org-brand-border)',
                          background: 'var(--org-brand-surface)',
                        }}
                      >
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_250px]">
                          <div>
                            <h2
                              className="text-[20px] font-semibold leading-snug tracking-[-0.01em]"
                              style={{ color: 'var(--org-brand-text)' }}
                            >
                              {job.title}
                            </h2>
                            <div className="mt-2 flex flex-wrap gap-1.5">
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
                            <dl className="mt-4 grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
                              <div>
                                <dt className="font-medium" style={{ color: 'var(--org-brand-text)' }}>Closing</dt>
                                <dd style={{ color: 'var(--org-brand-muted)' }}>{formatDateTimeValue(timeline?.applications_close_at, orgTimeZone)}</dd>
                              </div>
                              <div>
                                <dt className="font-medium" style={{ color: 'var(--org-brand-text)' }}>Start date</dt>
                                <dd style={{ color: 'var(--org-brand-muted)' }}>{formatDateValue(timeline?.start_date_needed, orgTimeZone)}</dd>
                              </div>
                              <div>
                                <dt className="font-medium" style={{ color: 'var(--org-brand-text)' }}>Shortlisting</dt>
                                <dd style={{ color: 'var(--org-brand-muted)' }}>{formatMultiDateSummary(shortlistingDates)}</dd>
                              </div>
                              <div>
                                <dt className="font-medium" style={{ color: 'var(--org-brand-text)' }}>Interviews</dt>
                                <dd style={{ color: 'var(--org-brand-muted)' }}>{formatMultiDateSummary(interviewDates)}</dd>
                              </div>
                            </dl>
                          </div>
                          <div className="flex flex-col justify-between rounded-xl border p-3" style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-bg)' }}>
                            <div className="space-y-1.5 text-[11.5px]" style={{ color: 'var(--org-brand-muted)' }}>
                              <p>{postedLabel ? `Posted ${postedLabel}` : 'Recently posted'}</p>
                              <p>{jobApplicationModeLabel(job.application_mode)}</p>
                            </div>
                            <span
                              className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold transition-transform group-hover:translate-x-0.5"
                              style={{ color: 'var(--org-brand-primary)' }}
                            >
                              View role
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

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
              <span className="inline-flex items-center gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Previous
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[12px] tabular-nums" style={{ color: 'var(--org-brand-muted)' }}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Page {page}
            </span>
            <Link
              aria-disabled={!hasNext}
              className={`rounded-xl border px-4 py-2 text-[13px] font-medium transition-opacity ${hasNext ? 'hover:opacity-80' : 'cursor-not-allowed opacity-30'}`}
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)', color: 'var(--org-brand-text)' }}
              href={hasNext ? buildPublicJobsHref(orgSlug, host, { q, dept, contract, page: page + 1 }) : '#'}
            >
              <span className="inline-flex items-center gap-1.5">
              Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
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
