import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { CandidateApplicationStageBadge } from '@/app/(public)/jobs/me/CandidateApplicationStageBadge';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { tenantJobMeApplicationRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

type CandidateApplicationRow = {
  application_id: string;
  org_name: string;
  job_title: string;
  stage: string;
  submitted_at: string;
};

export default async function CandidateApplicationsPage() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = h.get('x-campsite-org-slug')?.trim() ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      buildCandidateJobsLoginRedirectUrl({ hostHeader: host, orgSlug, nextPath: '/jobs/me' })
    );
  }

  const { data, error } = await supabase.rpc('get_my_candidate_applications');
  if (error) throw new Error(error.message);

  const rows = (data as CandidateApplicationRow[] | null) ?? [];
  const orgResolved = await getOrganisationDisplayName(supabase, orgSlug);
  const orgDisplay = orgResolved?.trim() || rows[0]?.org_name?.trim() || 'Organisation';

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

  const jobsIndexHref = tenantPublicJobsIndexRelativePath(orgSlug, host);

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <CareersHeader
          orgName={orgDisplay}
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

        {/* ── Page heading ── */}
        <div className="mt-10">
          <h1
            className="font-authSerif text-[clamp(1.75rem,4vw,2.25rem)] tracking-[-0.02em]"
            style={{ color: 'var(--org-brand-text)' }}
          >
            My applications
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--org-brand-muted)' }}>
            Track status, view updates, and open your private tracker link.
          </p>
        </div>

        {rows.length === 0 ? (
          <section
            className="mt-8 rounded-2xl border px-6 py-14 text-center"
            style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
          >
            <p
              className="font-authSerif text-[1.375rem]"
              style={{ color: 'var(--org-brand-text)' }}
            >
              No applications yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
              Browse live roles and submit your first application.
            </p>
            <Link
              href={jobsIndexHref}
              className="mt-6 inline-flex rounded-xl px-5 py-2.5 text-[13px] font-semibold hover:opacity-90"
              style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
            >
              Browse open roles
            </Link>
          </section>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((row) => {
              const detailHref = tenantJobMeApplicationRelativePath(row.application_id, orgSlug, host);
              const submittedLabel = new Date(row.submitted_at).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
              return (
                <li
                  key={row.application_id}
                  className="rounded-2xl border p-5"
                  style={{
                    borderColor: 'var(--org-brand-border)',
                    background: 'var(--org-brand-surface)',
                  }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                        style={{ color: 'var(--org-brand-muted)' }}
                      >
                        {row.org_name}
                      </p>
                      <h2
                        className="mt-1 font-authSerif text-[1.25rem] leading-tight"
                        style={{ color: 'var(--org-brand-text)' }}
                      >
                        {row.job_title}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CandidateApplicationStageBadge stage={row.stage} />
                        <span className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
                          Applied {submittedLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                      <Link
                        href={detailHref}
                        className="rounded-xl px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90"
                        style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary)' }}
                      >
                        View detail
                      </Link>
                      <Link
                        href={`/jobs/status/new/${encodeURIComponent(row.application_id)}`}
                        className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-70"
                        style={{
                          borderColor: 'var(--org-brand-border)',
                          color: 'var(--org-brand-text)',
                          background: 'var(--org-brand-bg)',
                        }}
                      >
                        Open tracker link
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
