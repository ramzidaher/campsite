import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { createClient } from '@/lib/supabase/server';
import { tenantJobApplyRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <header className="border-b border-[#ececec] bg-white px-5 py-4">
        <Link
          href={jobsIndexHref}
          className="mb-3 inline-flex text-[12px] font-medium text-[#6b6b6b] hover:text-[#121212]"
        >
          ← Back to open roles
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{job.org_name}</p>
        <h1 className="font-authSerif text-[24px] tracking-tight text-[#121212]">{job.title}</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          {job.department_name}
          {' · '}
          {job.grade_level}
          {' · '}
          {recruitmentContractLabel(job.contract_type)}
          {' · '}
          {job.salary_band}
        </p>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">About the role</h2>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#242424]">
            {job.advert_copy?.trim() || 'Details coming soon.'}
          </div>
        </section>

        {job.requirements?.trim() ? (
          <section className="mt-5 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Requirements</h2>
            <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">
              {job.requirements}
            </div>
          </section>
        ) : null}

        {job.benefits?.trim() ? (
          <section className="mt-5 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Benefits</h2>
            <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">
              {job.benefits}
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-xl border border-[#d8ece5] bg-[#f0fdf9] p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#0f5132]">How to apply</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#14532d]">
            Apply online — this vacancy accepts: {applySummary}. After you submit, you’ll get a private link to track your
            status.
          </p>
          <Link
            href={applyHref}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[#008B60] px-4 text-[13px] font-medium text-white hover:bg-[#007a54]"
          >
            Apply now
          </Link>
        </section>

        <p className="mt-8 text-center text-[11px] text-[#9b9b9b]">
          Posted on{' '}
          {job.published_at
            ? new Date(job.published_at).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : '—'}
        </p>
      </main>
    </div>
  );
}
