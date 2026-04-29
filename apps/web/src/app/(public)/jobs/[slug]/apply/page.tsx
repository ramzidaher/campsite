import { ApplyJobFormClient } from '@/app/(public)/jobs/[slug]/apply/ApplyJobFormClient';
import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { tenantJobListingRelativePath } from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type PublicJobRow = {
  job_listing_id: string;
  org_name: string;
  title: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  allow_application_questions: boolean;
};

export default async function ApplyJobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const jobSlug = rawSlug?.trim();
  if (!jobSlug) notFound();

  const h = await headers();
  const orgSlug = h.get('x-campsite-org-slug')?.trim();
  if (!orgSlug) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';

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

  const orgName = (orgBrand?.name as string | undefined)?.trim() || job.org_name;
  const orgLogoUrl = (orgBrand as { logo_url?: string | null } | null)?.logo_url ?? null;

  const [{ data: eqJson }, { data: screeningRows, error: screeningErr }] = await Promise.all([
    supabase.rpc('public_org_eq_monitoring_codes', {
      p_org_slug: orgSlug,
    }),
    supabase.rpc('public_job_listing_screening_questions', {
      p_org_slug: orgSlug,
      p_job_slug: jobSlug,
    }),
  ]);
  let eqCategories: { code: string; label: string }[] = [];
  if (Array.isArray(eqJson)) {
    eqCategories = eqJson
      .map((e: unknown) => ({
        code: String((e as { code?: string }).code ?? '').trim(),
        label: String((e as { label?: string }).label ?? '').trim(),
      }))
      .filter((e) => e.code && e.label);
  }

  await supabase.rpc('track_public_job_metric', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
    p_event_type: 'apply_start',
  });

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6">
        {/* ── Header ── */}
        <CareersHeader
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          actions={
            <Link
              href={tenantJobListingRelativePath(jobSlug, orgSlug, host)}
              className="rounded-lg px-3 py-1.5 text-[13px] transition-colors hover:bg-black/[0.06]"
              style={{ color: 'var(--org-brand-text)' }}
            >
              ← Back to role
            </Link>
          }
        />

        {/* ── Job context ── */}
        <div className="mt-8 mb-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--org-brand-muted)' }}
          >
            Applying for
          </p>
          <h1
            className="mt-1.5 font-authSerif text-[clamp(1.5rem,4vw,2rem)] leading-tight tracking-[-0.02em]"
            style={{ color: 'var(--org-brand-text)' }}
          >
            {job.title}
          </h1>
        </div>

        <ApplyJobFormClient
          jobSlug={jobSlug}
          listing={job}
          orgSlug={orgSlug}
          hostHeader={host}
          defaultEmail={user?.email ?? null}
          isAuthenticated={Boolean(user)}
          eqCategories={eqCategories}
          screeningQuestions={
            screeningErr || !Array.isArray(screeningRows)
              ? []
              : (screeningRows as {
                  id: string;
                  question_type: string;
                  prompt: string;
                  help_text: string | null;
                  required: boolean;
                    is_page_break?: boolean | null;
                    scoring_enabled?: boolean | null;
                    initially_hidden?: boolean | null;
                    locked?: boolean | null;
                  options: unknown;
                  max_length: number | null;
                  sort_order: number;
                }[])
          }
        />
      </div>
    </div>
  );
}
