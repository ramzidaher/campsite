import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { ApplicationStageTimeline } from '@/app/(public)/jobs/me/ApplicationStageTimeline';
import { CandidateApplicationMessages } from '@/app/(public)/jobs/me/CandidateApplicationMessages';
import { CandidateApplicationStageBadge } from '@/app/(public)/jobs/me/CandidateApplicationStageBadge';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import {
  tenantJobListingRelativePath,
  tenantJobMeApplicationRelativePath,
} from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PortalMessage = { body: string; created_at: string };

type DetailRow = {
  org_name: string;
  org_slug: string;
  job_title: string;
  job_slug: string;
  stage: string;
  submitted_at: string;
  interview_joining_instructions: string | null;
  messages: PortalMessage[] | null;
};

export default async function CandidateApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId: rawId } = await params;
  const applicationId = rawId?.trim() ?? '';
  if (!UUID_RE.test(applicationId)) notFound();

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = h.get('x-campsite-org-slug')?.trim() ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      buildCandidateJobsLoginRedirectUrl({
        hostHeader: host,
        orgSlug,
        nextPath: tenantJobMeApplicationRelativePath(applicationId, orgSlug, host),
      })
    );
  }

  const { data, error } = await supabase.rpc('get_my_candidate_application_detail', {
    p_application_id: applicationId,
  });

  if (error || !data?.length) notFound();

  const row = data[0] as DetailRow;
  const messages = Array.isArray(row.messages) ? row.messages : [];

  const { data: orgBrand } = await supabase
    .from('organisations')
    .select('logo_url, brand_preset_key, brand_tokens, brand_policy')
    .eq('slug', orgSlug ?? '')
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
  const orgLogoUrl = (orgBrand as { logo_url?: string | null } | null)?.logo_url ?? null;

  const listingHref = tenantJobListingRelativePath(row.job_slug, row.org_slug, host);
  const trackerHref = `/jobs/status/new/${encodeURIComponent(applicationId)}`;

  const submittedLabel = row.submitted_at
    ? new Date(row.submitted_at).toLocaleString('en-GB', { timeZone: 'UTC', 
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <CareersHeader
          orgName={row.org_name}
          orgLogoUrl={orgLogoUrl}
          orgSlug={orgSlug}
          hostHeader={host}
          current="applications"
          actions={
            user.email ? (
              <span
                className="hidden max-w-[200px] truncate text-[12px] sm:block"
                style={{ color: 'var(--org-brand-muted)' }}
                title={user.email}
              >
                {user.email}
              </span>
            ) : undefined
          }
        />

        {/* ── Job + stage overview ── */}
        <div
          className="mt-8 rounded-2xl border p-6"
          style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
        >
          <h1
            className="mt-3 font-authSerif text-[clamp(1.4rem,3.5vw,1.875rem)] leading-tight tracking-[-0.02em]"
            style={{ color: 'var(--org-brand-text)' }}
          >
            {row.job_title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CandidateApplicationStageBadge stage={row.stage} />
            <span className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
              Applied {submittedLabel}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={listingHref}
              className="rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--org-brand-border)', color: 'var(--org-brand-text)', background: 'var(--org-brand-bg)' }}
            >
              View job listing
            </Link>
            <Link
              href={trackerHref}
              className="rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--org-brand-border)', color: 'var(--org-brand-text)', background: 'var(--org-brand-bg)' }}
            >
              Open shareable tracker
            </Link>
          </div>
        </div>

        {/* ── Stage timeline ── */}
        <section
          className="mt-4 rounded-2xl border p-6"
          style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
        >
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--org-brand-muted)' }}
          >
            Progress
          </h2>
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--org-brand-muted)' }}>
            Stages update as your application moves through review.
          </p>
          <div className="mt-5">
            <ApplicationStageTimeline stage={row.stage} />
          </div>
        </section>

        {/* ── Messages ── */}
        {messages.length > 0 ? (
          <div className="mt-4">
            <CandidateApplicationMessages messages={messages} />
          </div>
        ) : null}

        {/* ── Interview instructions ── */}
        {row.interview_joining_instructions ? (
          <section className="mt-4 rounded-2xl border border-[#dbeafe] bg-[#f0f6ff] p-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1e40af]">
              Interview joining instructions
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1f2937]">
              {row.interview_joining_instructions}
            </p>
          </section>
        ) : null}

        <p
          className="mt-10 text-center text-[11px]"
          style={{ color: 'var(--org-brand-muted)' }}
        >
          You can also bookmark your private tracker link from the confirmation email  no sign-in required.
        </p>
      </div>
    </div>
  );
}
