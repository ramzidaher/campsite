import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { OfferSignClient } from '@/app/(public)/jobs/offer-sign/[token]/OfferSignClient';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { sanitizeOfferHtml } from '@/lib/security/htmlSanitizer';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function OfferSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw?.trim();
  if (!token) notFound();

  const supabase = await createClient();
  const h = await headers();
  const actorKey = `${(h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'anon'}:offer-sign-view`;
  const { data: rateAllowed } = await supabase.rpc('record_public_token_attempt', {
    p_channel: 'offer_sign_view',
    p_actor_key: actorKey,
  });
  if (!rateAllowed) notFound();

  const { data, error } = await supabase.rpc('get_application_offer_for_signing', {
    p_portal_token: token,
  });
  if (error || !data?.length) notFound();

  const row = data[0] as {
    body_html: string;
    status: string;
    org_name: string;
    candidate_name: string;
    job_title: string;
  };
  row.body_html = sanitizeOfferHtml(row.body_html);

  const orgSlug = h.get('x-campsite-org-slug')?.trim() ?? '';
  const { data: orgBrand } = await supabase
    .from('organisations')
    .select('logo_url, brand_preset_key, brand_tokens, brand_policy')
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
  const orgLogoUrl = (orgBrand as { logo_url?: string | null } | null)?.logo_url ?? null;

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* ── Header ── */}
        <CareersHeader orgName={row.org_name} orgLogoUrl={orgLogoUrl} />

        {/* ── Offer context ── */}
        <div className="mt-6 mb-4">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--org-brand-muted)' }}
          >
            Offer letter
          </p>
          <h1
            className="mt-1.5 font-authSerif text-[clamp(1.5rem,4vw,2rem)] leading-tight tracking-[-0.02em]"
            style={{ color: 'var(--org-brand-text)' }}
          >
            {row.job_title}
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--org-brand-muted)' }}>
            Review and sign securely below.
          </p>
        </div>
      </div>

      <OfferSignClient token={token} initial={row} />
    </div>
  );
}
