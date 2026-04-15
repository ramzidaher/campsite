import { ApplyJobFormClient } from '@/app/(public)/jobs/[slug]/apply/ApplyJobFormClient';
import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

type PublicJobRow = {
  job_listing_id: string;
  org_name: string;
  title: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
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

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    notFound();
  }

  const job = data[0] as PublicJobRow;
  const { data: orgBrand } = await supabase
    .from('organisations')
    .select('brand_preset_key, brand_tokens, brand_policy')
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

  const { data: eqJson } = await supabase.rpc('public_org_eq_monitoring_codes', {
    p_org_slug: orgSlug,
  });
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
      <div className="mx-auto max-w-[660px] px-5 py-8">
        <div className="space-y-5">
          <CareersProductStrip />
          <CareersOrgLine orgName={job.org_name} />
        </div>
        <ApplyJobFormClient
          jobSlug={jobSlug}
          listing={job}
          orgSlug={orgSlug}
          hostHeader={host}
          defaultEmail={user?.email ?? null}
          isAuthenticated={Boolean(user)}
          eqCategories={eqCategories}
        />
      </div>
    </div>
  );
}
