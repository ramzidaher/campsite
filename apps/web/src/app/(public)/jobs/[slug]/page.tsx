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
  published_at: string;
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
  const applySummary =
    applyBits.length > 0 ? applyBits.join(', ') : jobApplicationModeLabel(job.application_mode);

  const applyHref = tenantJobApplyRelativePath(jobSlug, orgSlug, host);
  const jobsIndexHref = tenantPublicJobsIndexRelativePath(orgSlug, host);

  const postedLong = job.published_at
    ? new Date(job.published_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

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
          actions={
            <Link
              href={jobsIndexHref}
              className="rounded-lg px-3 py-1.5 text-[13px] transition-colors hover:bg-black/[0.06]"
              style={{ color: 'var(--org-brand-text)' }}
            >
              ← All open roles
            </Link>
          }
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
              <ProseSection title="Requirements">
                <p className="whitespace-pre-wrap">{job.requirements}</p>
              </ProseSection>
            ) : null}

            {job.benefits?.trim() ? (
              <ProseSection title="Benefits">
                <p className="whitespace-pre-wrap">{job.benefits}</p>
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
          <aside className="hidden lg:sticky lg:top-8 lg:block">
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
                <div className="py-2.5">
                  <span className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>Closing</span>
                  <p className="mt-0.5 text-[13px] font-medium" style={{ color: 'var(--org-brand-text)' }}>
                    Rolling — apply while listed
                  </p>
                </div>
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
