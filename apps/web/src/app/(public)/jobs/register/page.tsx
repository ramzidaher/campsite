import { AuthFloaters } from '@/app/(public)/jobs/AuthFloaters';
import { CandidateAuthCard } from '@/app/(public)/jobs/CandidateAuthCard';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function CandidateRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = (sp.org?.trim() || h.get('x-campsite-org-slug')?.trim() || '') as string;

  const supabase = await createClient();
  const orgName = await getOrganisationDisplayName(supabase, orgSlug);

  const { data: orgBrand } = await supabase
    .from('organisations')
    .select('logo_url, brand_preset_key, brand_tokens, brand_policy')
    .eq('slug', orgSlug || '')
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

  const displayName = orgName?.trim() || 'Organisation';
  const orgLogoUrl = (orgBrand as { logo_url?: string | null } | null)?.logo_url ?? null;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12 font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <AuthFloaters />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, var(--org-brand-primary) 13%, transparent), transparent)',
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <Suspense
          fallback={
            <div
              className="h-[420px] animate-pulse rounded-2xl"
              style={{ background: 'var(--org-brand-surface)' }}
            />
          }
        >
          <CandidateAuthCard
            orgSlug={orgSlug}
            hostHeader={host}
            orgName={displayName}
            orgLogoUrl={orgLogoUrl}
            defaultTab="register"
          />
        </Suspense>
      </div>
    </div>
  );
}
