import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { createClient } from '@/lib/supabase/server';
import { tenantJobApplyRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

type PublicJobRow = {
  job_listing_id: string;
  org_name: string;
  title: string;
  advert_copy: string;
  requirements: string;
  benefits: string;
  grade_level: string;
  salary_band: string;
  contract_type: string;
  department_name: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  allow_application_questions: boolean;
  published_at: string;
};

type PublicJobDetailsRow = {
  recruitment_request_id: string | null;
  applications_close_at: string | null;
  start_date_needed: string | null;
  shortlisting_dates: unknown;
  interview_dates: unknown;
  role_profile_link: string | null;
  hide_posted_date: boolean | null;
  scheduled_publish_at: string | null;
};

type RecruitmentTimelineRow = {
  id: string;
  advert_release_date: string | null;
  advert_closing_date: string | null;
  shortlisting_dates: unknown;
  interview_schedule: unknown;
  start_date_needed: string | null;
  role_profile_link: string | null;
};

function formatSalary(raw: string): string {
  const t = raw?.trim() ?? '';
  if (!t) return '—';
  return t.startsWith('£') ? t : `£${t}`;
}

function ProseSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-authSerif text-[1.4rem] leading-tight tracking-[-0.02em] sm:text-[1.5rem]" style={{ color: 'var(--org-brand-text)' }}>
        {title}
      </h2>
      <div className="mt-4 text-[15px] leading-[1.8]" style={{ color: 'var(--org-brand-text)', opacity: 0.85 }}>
        {children}
      </div>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--org-brand-border)' }}>
      <span className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>{label}</span>
      <span className="text-right text-[13px] font-medium" style={{ color: 'var(--org-brand-text)' }}>{value}</span>
    </div>
  );
}

function formatDateValue(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTimeValue(iso: string | null | undefined): string {
  if (!iso) return 'Rolling — apply while listed';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Rolling — apply while listed';
  return d.toLocaleString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  if (sortedUnique.length === 0) return '—';
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

export default async function PublicJobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const jobSlug = rawSlug?.trim();
  if (!jobSlug) notFound();

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = h.get('x-campsite-org-slug')?.trim();
  if (!orgSlug) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('public_job_listing_by_slug', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) notFound();

  const job = data[0] as PublicJobRow;

  const jobDetailsWithNewCols = await supabase
    .from('job_listings')
    .select(
      'recruitment_request_id, applications_close_at, start_date_needed, shortlisting_dates, interview_dates, role_profile_link, hide_posted_date, scheduled_publish_at'
    )
    .eq('id', job.job_listing_id)
    .maybeSingle();
  const fallbackJobDetails = jobDetailsWithNewCols.error
    ? await supabase
        .from('job_listings')
        .select('recruitment_request_id')
        .eq('id', job.job_listing_id)
        .maybeSingle()
    : null;

  const detailsRaw = fallbackJobDetails?.data ?? jobDetailsWithNewCols.data;
  const recruitmentRequestId = String((detailsRaw as { recruitment_request_id?: string | null } | null)?.recruitment_request_id ?? '').trim() || null;

  let reqTimeline: RecruitmentTimelineRow | null = null;
  if (recruitmentRequestId) {
    const reqResult = await supabase
      .from('recruitment_requests')
      .select(
        'id, advert_release_date, advert_closing_date, shortlisting_dates, interview_schedule, start_date_needed, role_profile_link'
      )
      .eq('id', recruitmentRequestId)
      .maybeSingle();
    reqTimeline = (reqResult.data ?? null) as RecruitmentTimelineRow | null;
  }

  const jobDetails = ({
    recruitment_request_id: recruitmentRequestId,
    applications_close_at:
      String((detailsRaw as { applications_close_at?: unknown } | null)?.applications_close_at ?? '').trim() ||
      (reqTimeline?.advert_closing_date ? `${String(reqTimeline.advert_closing_date)}T23:59:00.000Z` : null),
    start_date_needed:
      String((detailsRaw as { start_date_needed?: unknown } | null)?.start_date_needed ?? '').trim() ||
      String(reqTimeline?.start_date_needed ?? '').trim() ||
      null,
    shortlisting_dates:
      parseDateList((detailsRaw as { shortlisting_dates?: unknown } | null)?.shortlisting_dates).length > 0
        ? parseDateList((detailsRaw as { shortlisting_dates?: unknown } | null)?.shortlisting_dates)
        : (reqTimeline?.shortlisting_dates ?? []),
    interview_dates:
      parseDateList((detailsRaw as { interview_dates?: unknown } | null)?.interview_dates).length > 0
        ? parseDateList((detailsRaw as { interview_dates?: unknown } | null)?.interview_dates)
        : parseInterviewDateList(reqTimeline?.interview_schedule),
    role_profile_link:
      String((detailsRaw as { role_profile_link?: unknown } | null)?.role_profile_link ?? '').trim() ||
      String(reqTimeline?.role_profile_link ?? '').trim() ||
      null,
    hide_posted_date: Boolean((detailsRaw as { hide_posted_date?: unknown } | null)?.hide_posted_date),
    scheduled_publish_at:
      String((detailsRaw as { scheduled_publish_at?: unknown } | null)?.scheduled_publish_at ?? '').trim() ||
      (reqTimeline?.advert_release_date ? `${String(reqTimeline.advert_release_date)}T09:00:00.000Z` : null),
  } satisfies PublicJobDetailsRow);

  const { data: orgBrand } = await supabase
    .from('organisations')
    .select('name, logo_url, brand_preset_key, brand_tokens, brand_policy')
    .eq('slug', orgSlug)
    .maybeSingle();

  const resolvedBranding = resolveOrgBranding({
    presetKey: orgBrand?.brand_preset_key,
    customTokens: orgBrand?.brand_tokens,
    policy: orgBrand?.brand_policy,
    effectiveMode: 'off',
  });
  const jobsVars = {
    ...orgBrandingCssVars(resolvedBranding.tokens),
    ['--jobs-on-primary' as string]: onColorFor(resolvedBranding.tokens.primary),
  };

  await supabase.rpc('track_public_job_metric', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
    p_event_type: 'impression',
  });

  const orgName = (orgBrand?.name as string | undefined)?.trim() || job.org_name;
  const orgLogoUrl = (orgBrand as { logo_url?: string | null } | null)?.logo_url ?? null;

  const applyBits: string[] = [];
  if (job.allow_cv) applyBits.push(jobApplicationModeLabel('cv'));
  if (job.allow_loom) applyBits.push(jobApplicationModeLabel('loom'));
  if (job.allow_staffsavvy) applyBits.push(jobApplicationModeLabel('staffsavvy'));
  if (job.allow_application_questions) applyBits.push('Role application questions');
  const applySummary =
    applyBits.length > 0 ? applyBits.join(', ') : jobApplicationModeLabel(job.application_mode);

  const applyHref = tenantJobApplyRelativePath(jobSlug, orgSlug, host);
  const jobsIndexHref = tenantPublicJobsIndexRelativePath(orgSlug, host);

  const postedLong = job.published_at
    ? new Date(job.published_at).toLocaleDateString('en-GB', { timeZone: 'UTC', 
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const shortlistingDates = parseDateList(jobDetails.shortlisting_dates);
  const interviewDates = parseDateList(jobDetails.interview_dates);
  const otherKeyDates: Array<{ label: string; value: string }> = [];
  if (shortlistingDates.length > 0) {
    otherKeyDates.push({
      label: 'Shortlisting',
      value: formatMultiDateSummary(shortlistingDates),
    });
  }
  if (interviewDates.length > 0) {
    otherKeyDates.push({
      label: 'Interviews',
      value: formatMultiDateSummary(interviewDates),
    });
  }
  if (jobDetails.start_date_needed) {
    otherKeyDates.push({
      label: 'Start date',
      value: formatDateValue(jobDetails.start_date_needed),
    });
  }
  if (jobDetails.scheduled_publish_at && !jobDetails.hide_posted_date) {
    otherKeyDates.push({
      label: 'Posted',
      value: formatDateValue(jobDetails.scheduled_publish_at),
    });
  }

  return (
    <div
      className="font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <CareersHeader
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
        />

        {/* ── Job title block ── */}
        <div className="mt-8">
          <Link
            href={jobsIndexHref}
            className="inline-flex items-center gap-1 text-[12px] font-medium underline underline-offset-2 hover:opacity-70"
            style={{ color: 'var(--org-brand-muted)' }}
          >
            {orgName}
          </Link>
          <h1
            className="mt-2 font-authSerif text-[clamp(1.875rem,5vw,2.75rem)] leading-[1.1] tracking-[-0.03em]"
            style={{ color: 'var(--org-brand-text)' }}
          >
            {job.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              job.department_name,
              recruitmentContractLabel(job.contract_type),
              formatSalary(job.salary_band),
            ].map((label, i) => (
              <span
                key={i}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: i === 0
                    ? 'color-mix(in oklab, var(--org-brand-primary) 14%, var(--org-brand-surface))'
                    : 'var(--org-brand-surface)',
                  color: 'var(--org-brand-text)',
                  boxShadow: 'inset 0 0 0 1px var(--org-brand-border)',
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-14">
          {/* Content */}
          <div className="min-w-0 space-y-12">
            <ProseSection title="About the role">
              <p className="whitespace-pre-wrap">
                {job.advert_copy?.trim() || 'More detail will be added for this role shortly.'}
              </p>
            </ProseSection>

            {job.requirements?.trim() ? (
              <ProseSection title="Job description">
                <p className="whitespace-pre-wrap">{job.requirements}</p>
              </ProseSection>
            ) : null}

            {job.benefits?.trim() ? (
              <ProseSection title="About the organisation">
                <p className="whitespace-pre-wrap">{job.benefits}</p>
              </ProseSection>
            ) : null}

            {String(jobDetails.role_profile_link ?? '').trim() ? (
              <ProseSection title="Job profile / description link">
                <a
                  href={String(jobDetails.role_profile_link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-70"
                  style={{ color: 'var(--org-brand-text)' }}
                >
                  {String(jobDetails.role_profile_link)}
                </a>
              </ProseSection>
            ) : null}

            {/* Mobile apply CTA */}
            <div className="lg:hidden">
              <Link
                href={applyHref}
                className="flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-[15px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
              >
                Apply for this role
              </Link>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:-mt-10 lg:sticky lg:top-0 lg:block">
            <div
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              {/* Apply button */}
              <div className="p-5">
                <Link
                  href={applyHref}
                  className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
                >
                  Apply now
                </Link>
                <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
                  Submit online — accepts {applySummary}. You will receive a private link to track your application.
                </p>
              </div>

              {/* Key facts */}
              <div
                className="border-t px-5 pb-5 pt-4"
                style={{ borderColor: 'var(--org-brand-border)' }}
              >
                <p
                  className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--org-brand-muted)' }}
                >
                  Key facts
                </p>
                <MetaRow label="Team" value={job.department_name} />
                <MetaRow label="Contract" value={recruitmentContractLabel(job.contract_type)} />
                <MetaRow label="Salary" value={formatSalary(job.salary_band)} />
                {job.grade_level?.trim() ? (
                  <MetaRow label="Grade / level" value={job.grade_level} />
                ) : null}
                <MetaRow label="Closing" value={formatDateTimeValue(jobDetails.applications_close_at)} />
                {otherKeyDates.length > 0 ? (
                  <div className="pt-2">
                    <p
                      className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: 'var(--org-brand-muted)' }}
                    >
                      Other key dates
                    </p>
                    {otherKeyDates.map((item) => (
                      <MetaRow key={item.label} label={item.label} value={item.value} />
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Posted date */}
              {postedLong ? (
                <p
                  className="border-t px-5 py-3 text-center text-[11px]"
                  style={{ borderColor: 'var(--org-brand-border)', color: 'var(--org-brand-muted)' }}
                >
                  First listed {postedLong}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
