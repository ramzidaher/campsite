import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { CandidateRegisterForm } from '@/app/(public)/jobs/register/CandidateRegisterForm';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

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

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
      <div className="mx-auto w-full max-w-md">
        <div className="space-y-5">
          <CareersProductStrip />
          {orgName ? <CareersOrgLine orgName={orgName} /> : null}
        </div>
        <CandidateRegisterForm orgSlug={orgSlug} hostHeader={host} />
      </div>
    </div>
  );
}
