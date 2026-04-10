import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { CandidateLoginForm } from '@/app/(public)/jobs/login/CandidateLoginForm';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function CandidateLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = (sp.org?.trim() || h.get('x-campsite-org-slug')?.trim() || '') as string;
  const defaultNext = sp.next?.trim() || '/jobs/me';

  const supabase = await createClient();
  const orgName = await getOrganisationDisplayName(supabase, orgSlug);

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf9f6] p-8 text-[#6b6b6b]">Loading…</div>}>
      <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
        <div className="mx-auto w-full max-w-md">
          <div className="space-y-5">
            <CareersProductStrip />
            {orgName ? <CareersOrgLine orgName={orgName} /> : null}
          </div>
          <CandidateLoginForm orgSlug={orgSlug} hostHeader={host} defaultNext={defaultNext} />
        </div>
      </div>
    </Suspense>
  );
}
