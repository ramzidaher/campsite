import { AuthFloaters } from '@/app/(public)/jobs/AuthFloaters';
import { CandidateForgotPasswordForm } from '@/app/(public)/jobs/forgot-password/CandidateForgotPasswordForm';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { tenantJobsSubrouteRelativePath } from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';

function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  return words.length >= 2
    ? `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default async function CandidateForgotPasswordPage({
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
  const initials = getInitials(displayName);
  const loginHref = tenantJobsSubrouteRelativePath('login', orgSlug, host);

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
        {/* Org identity + badge */}
        <div className="mb-4 flex items-center gap-2.5">
          {orgLogoUrl ? (
            <img
              src={orgLogoUrl}
              alt=""
              aria-hidden
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
              style={{
                background: 'var(--org-brand-surface)',
                border: '1px solid var(--org-brand-border)',
              }}
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
              style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary, #fff)' }}
              aria-hidden
            >
              {initials}
            </div>
          )}
          <span className="text-[14px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
            {displayName}
          </span>
          <span
            className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{
              background: 'color-mix(in oklab, var(--org-brand-primary) 12%, var(--org-brand-surface))',
              color: 'var(--org-brand-primary)',
            }}
          >
            Candidate portal
          </span>
        </div>

        {/* Headline */}
        <h1
          className="font-authSerif text-[2.25rem] leading-[1.15] tracking-[-0.025em]"
          style={{ color: 'var(--org-brand-text)' }}
        >
          Reset your
          <br />
          <em style={{ color: 'var(--org-brand-primary)', fontStyle: 'italic' }}>password.</em>
        </h1>
        <p className="mt-2 mb-5 text-[13.5px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
          Enter your email and we will send a reset link.
        </p>

        <CandidateForgotPasswordForm orgSlug={orgSlug} hostHeader={host} />

      </div>
    </div>
  );
}
