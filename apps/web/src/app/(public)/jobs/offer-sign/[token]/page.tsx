import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { OfferSignClient } from '@/app/(public)/jobs/offer-sign/[token]/OfferSignClient';
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

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <div className="mx-auto max-w-3xl px-5 pt-8 sm:px-6">
        <div className="space-y-5">
          <CareersProductStrip />
          <CareersOrgLine orgName={row.org_name} />
        </div>
      </div>
      <OfferSignClient token={token} initial={row} />
    </div>
  );
}
