import { CareersHeader } from '@/app/(public)/jobs/CareersBranding';
import { CandidateApplicationMessages } from '@/app/(public)/jobs/me/CandidateApplicationMessages';
import { CandidateApplicationStageBadge } from '@/app/(public)/jobs/me/CandidateApplicationStageBadge';
import { onColorFor, orgBrandingCssVars, resolveOrgBranding } from '@/lib/orgBranding';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function CandidatePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken?.trim();
  if (!token) notFound();

  const supabase = await createClient();
  const h = await headers();
  const actorKey = `${(h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'anon'}:candidate-status`;
  const { data: rateAllowed } = await supabase.rpc('record_public_token_attempt', {
    p_channel: 'candidate_status_view',
    p_actor_key: actorKey,
  });
  if (!rateAllowed) notFound();

  const { data, error } = await supabase.rpc('get_candidate_application_portal', {
    p_portal_token: token,
  });
  if (error || !data?.length) notFound();

  const row = data[0] as {
    org_name: string;
    job_title: string;
    stage: string;
    submitted_at: string;
    interview_joining_instructions: string | null;
    messages: { body: string; created_at: string }[] | null;
  };
  const messages = Array.isArray(row.messages) ? row.messages : [];

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

  const submittedLabel = row.submitted_at
    ? new Date(row.submitted_at).toLocaleString('en-GB', { timeZone: 'UTC', 
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ ...jobsVars, background: 'var(--org-brand-bg)', color: 'var(--org-brand-text)' }}
    >
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-5">
        {/* ── Header ── */}
        <CareersHeader orgName={row.org_name} orgLogoUrl={orgLogoUrl} />

        {/* ── Application overview ── */}
        <div
          className="mt-6 rounded-2xl border p-6"
          style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--org-brand-muted)' }}
          >
            Application tracker
          </p>
          <h1
            className="mt-2 font-authSerif text-[1.375rem] leading-tight tracking-[-0.02em]"
            style={{ color: 'var(--org-brand-text)' }}
          >
            {row.job_title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <CandidateApplicationStageBadge stage={row.stage} />
            <span className="text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
              Applied {submittedLabel}
            </span>
          </div>
        </div>

        {/* ── Info banner ── */}
        <div
          className="mt-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
        >
          <p className="text-[13px]" style={{ color: 'var(--org-brand-muted)' }}>
            This tracker shows your application stage and any messages from the team. Applications are read-only after submission.
          </p>
        </div>

        {/* ── Messages ── */}
        {messages.length > 0 ? (
          <div className="mt-3">
            <CandidateApplicationMessages messages={messages} />
          </div>
        ) : null}

        {/* ── Interview instructions ── */}
        {row.interview_joining_instructions ? (
          <section className="mt-3 rounded-2xl border border-[#dbeafe] bg-[#f0f6ff] p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1e40af]">
              Interview joining instructions
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1f2937]">
              {row.interview_joining_instructions}
            </p>
          </section>
        ) : null}

        <p
          className="mt-8 text-center text-[11px]"
          style={{ color: 'var(--org-brand-muted)' }}
        >
          This page is private to you — keep the link safe.
        </p>
      </div>
    </div>
  );
}
