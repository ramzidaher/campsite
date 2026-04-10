import { jobApplicationModeLabel } from '@/lib/jobs/labels';
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

function formatSalaryDisplay(raw: string): string {
  const t = raw?.trim() ?? '';
  if (!t) return '—';
  if (t.startsWith('£')) return t;
  return `£${t}`;
}

function ProseBlock({ children }: { children: ReactNode }) {
  return <div className="text-[15px] leading-[1.75] text-[#2a2a2a] [&_strong]:font-semibold [&_strong]:text-[#121212]">{children}</div>;
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

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    notFound();
  }

  const job = data[0] as PublicJobRow;
  await supabase.rpc('track_public_job_metric', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
    p_event_type: 'impression',
  });

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

  const pillClass =
    'inline-flex items-center rounded-full border border-[#e0ddd8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] shadow-sm shadow-[#121212]/[0.04]';

  return (
    <div className="bg-[#faf9f6] font-sans text-[#121212] antialiased">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <Link
          href={jobsIndexHref}
          className="inline-flex text-[13px] font-medium text-[#6b6b6b] transition-colors hover:text-[#121212]"
        >
          <span className="mr-1.5" aria-hidden>
            ←
          </span>
          All open roles
        </Link>

        {/* Hero */}
        <header className="mt-6 overflow-hidden rounded-2xl border border-[#e8e6e3] bg-[#f5f4f1] shadow-[0_1px_0_0_rgba(18,18,18,0.04)]">
          <div className="border-b border-[#e0ddd8] bg-gradient-to-br from-white/90 to-[#f5f4f1] px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6b6b6b]">{job.org_name}</p>
            <h1 className="mt-3 max-w-4xl font-authSerif text-[clamp(1.875rem,4.5vw,2.75rem)] leading-[1.12] tracking-[-0.03em] text-[#121212]">
              {job.title}
            </h1>
            <div className="mt-8 flex flex-wrap gap-2">
              <span className={pillClass}>
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9b9b9b]">Team</span>
                {job.department_name}
              </span>
              <span className={pillClass}>
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9b9b9b]">Contract</span>
                {recruitmentContractLabel(job.contract_type)}
              </span>
              <span className={pillClass}>
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9b9b9b]">Salary</span>
                {formatSalaryDisplay(job.salary_band)}
              </span>
              <span className={pillClass}>
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9b9b9b]">Headcount</span>
                1 opening
              </span>
            </div>
          </div>
        </header>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start lg:gap-14">
          {/* Main column — second on mobile so apply card can lead on small screens */}
          <div className="order-2 min-w-0 space-y-12 lg:order-1">
            <section>
              <h2 className="font-authSerif text-[1.5rem] leading-tight tracking-[-0.02em] text-[#121212] sm:text-[1.625rem]">
                About the role
              </h2>
              <ProseBlock>
                <p className="mt-5 whitespace-pre-wrap">
                  {job.advert_copy?.trim() || 'We will add more detail for this role shortly.'}
                </p>
              </ProseBlock>
            </section>

            {job.requirements?.trim() ? (
              <section>
                <h2 className="font-authSerif text-[1.5rem] leading-tight tracking-[-0.02em] text-[#121212] sm:text-[1.625rem]">
                  Requirements
                </h2>
                <ProseBlock>
                  <p className="mt-5 whitespace-pre-wrap">{job.requirements}</p>
                </ProseBlock>
              </section>
            ) : null}

            {job.benefits?.trim() ? (
              <section>
                <h2 className="font-authSerif text-[1.5rem] leading-tight tracking-[-0.02em] text-[#121212] sm:text-[1.625rem]">
                  Benefits
                </h2>
                <ProseBlock>
                  <p className="mt-5 whitespace-pre-wrap">{job.benefits}</p>
                </ProseBlock>
              </section>
            ) : null}
          </div>

          {/* Sticky apply card — first on mobile */}
          <aside className="order-1 lg:sticky lg:order-2 lg:top-8">
            <div className="rounded-2xl border border-[#e8e6e3] bg-[#f5f4f1] p-6 shadow-[0_2px_12px_rgba(18,18,18,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b6b6b]">Apply</p>
              <Link
                href={applyHref}
                className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#121212] px-4 py-3.5 text-[15px] font-semibold text-[#faf9f6] transition-opacity hover:opacity-90"
              >
                Apply now
              </Link>
              <p className="mt-4 text-[13px] leading-relaxed text-[#6b6b6b]">
                Submit online — this vacancy accepts {applySummary}. You will receive a private link to track your
                application.
              </p>

              <div className="mt-6 border-t border-[#e0ddd8] pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9b9b9b]">Key facts</p>
                <dl className="mt-3 space-y-3 text-[13px]">
                  <div className="flex justify-between gap-4 border-b border-[#eceae6] pb-3">
                    <dt className="text-[#6b6b6b]">Grade / level</dt>
                    <dd className="text-right font-medium text-[#121212]">{job.grade_level}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[#eceae6] pb-3">
                    <dt className="text-[#6b6b6b]">Contract</dt>
                    <dd className="text-right font-medium text-[#121212]">{recruitmentContractLabel(job.contract_type)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[#eceae6] pb-3">
                    <dt className="text-[#6b6b6b]">Salary</dt>
                    <dd className="text-right font-medium text-[#121212]">{formatSalaryDisplay(job.salary_band)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6b6b6b]">Team</dt>
                    <dd className="text-right font-medium text-[#121212]">{job.department_name}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6 rounded-xl border border-[#e0ddd8] bg-white/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9b9b9b]">Closing</p>
                <p className="mt-1 text-[14px] font-medium text-[#121212]">Rolling — apply while listed</p>
                <p className="mt-2 text-[12px] leading-snug text-[#6b6b6b]">
                  We do not show a fixed deadline for this vacancy; apply before the role is filled or archived.
                </p>
              </div>

              {postedLong ? (
                <p className="mt-5 text-center text-[12px] text-[#9b9b9b]">First listed {postedLong}</p>
              ) : (
                <p className="mt-5 text-center text-[12px] text-[#9b9b9b]">Recently published</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
