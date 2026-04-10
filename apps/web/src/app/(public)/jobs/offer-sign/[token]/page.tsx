import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { OfferSignClient } from '@/app/(public)/jobs/offer-sign/[token]/OfferSignClient';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function OfferSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw?.trim();
  if (!token) notFound();

  const supabase = await createClient();
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
