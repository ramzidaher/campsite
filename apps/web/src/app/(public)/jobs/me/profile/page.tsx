import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { CandidatePortalNav } from '@/app/(public)/jobs/CandidatePortalNav';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { CandidateProfileForm } from '@/app/(public)/jobs/me/profile/CandidateProfileForm';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
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

  const orgName = await getOrganisationDisplayName(supabase, orgSlug);

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
      <main className="mx-auto w-full max-w-xl">
        <div className="space-y-5">
          <CareersProductStrip />
          {orgName ? <CareersOrgLine orgName={orgName} /> : null}
        </div>
        <div className="mt-8">
          <CandidatePortalNav orgSlug={orgSlug} hostHeader={host} current="profile" />
        </div>

        <header className="mb-6 rounded-xl border border-[#e8e8e8] bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Your profile</p>
          <h1 className="mt-1 font-authSerif text-[34px]">Profile</h1>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">
            Details you save here can support future applications. Your sign-in email comes from the account you registered with.
          </p>
        </header>

        <section className="rounded-xl border border-[#e8e8e8] bg-white p-6">
          <CandidateProfileForm
            profile={{
              full_name: profile?.full_name ?? null,
              phone: profile?.phone ?? null,
              location: profile?.location ?? null,
              linkedin_url: profile?.linkedin_url ?? null,
              portfolio_url: profile?.portfolio_url ?? null,
            }}
          />
        </section>
      </main>
    </div>
  );
}
