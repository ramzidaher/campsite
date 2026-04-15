import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { CandidateProfileForm } from '@/app/(public)/jobs/me/profile/CandidateProfileForm';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function CandidateProfilePage() {
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
        nextPath: '/jobs/me/profile',
      })
    );
  }

  const { data: profile } = await supabase
    .from('candidate_profiles')
    .select('full_name, phone, location, linkedin_url, portfolio_url')
    .eq('id', user.id)
    .maybeSingle();

  const orgResolved = await getOrganisationDisplayName(supabase, orgSlug);
  const orgDisplay = orgResolved?.trim() || 'Organisation';

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
          current="profile"
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
            Your profile
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--org-brand-muted)' }}>
            Details saved here pre-fill future applications. Your sign-in email is from your registered account.
          </p>
        </div>

        {/* ── Profile form ── */}
        <div
          className="mt-8 max-w-xl rounded-2xl border p-6"
          style={{
            borderColor: 'var(--org-brand-border)',
            background: 'var(--org-brand-surface)',
          }}
        >
          <CandidateProfileForm
            profile={{
              full_name: profile?.full_name ?? null,
              phone: profile?.phone ?? null,
              location: profile?.location ?? null,
              linkedin_url: profile?.linkedin_url ?? null,
              portfolio_url: profile?.portfolio_url ?? null,
            }}
          />
        </div>
      </div>
    </div>
  );
}
