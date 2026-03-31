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

  return <OfferSignClient token={token} initial={row} />;
}
