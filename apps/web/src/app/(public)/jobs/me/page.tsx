import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { CareersSectionNav } from '@/app/(public)/jobs/CareersSectionNav';
import { getOrganisationDisplayName } from '@/app/(public)/jobs/getOrganisationDisplayName';
import { CandidateApplicationStageBadge } from '@/app/(public)/jobs/me/CandidateApplicationStageBadge';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { createClient } from '@/lib/supabase/server';
import { tenantJobMeApplicationRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

type CandidateApplicationRow = {
  application_id: string;
  portal_token: string;
  org_name: string;
  job_title: string;
  stage: string;
  submitted_at: string;
};

export default async function CandidateApplicationsPage() {
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
        nextPath: '/jobs/me',
      })
    );
  }

  const jobsIndexHref = tenantPublicJobsIndexRelativePath(orgSlug, host);

  const { data, error } = await supabase.rpc('get_my_candidate_applications');
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data as CandidateApplicationRow[] | null) ?? [];
  const orgResolved = await getOrganisationDisplayName(supabase, orgSlug);
  const orgDisplay = orgResolved?.trim() || rows[0]?.org_name?.trim() || 'Organisation';

  return (
    <div className="min-h-screen bg-[#faf9f6] font-sans text-[#121212] antialiased">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="space-y-5">
          <CareersProductStrip />
          <CareersOrgLine orgName={orgDisplay} />
        </div>
        <CareersSectionNav orgSlug={orgSlug} hostHeader={host} current="applications" />

        <header className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9b9b9b]">Applications</p>
          <h1 className="mt-1 font-authSerif text-[clamp(1.5rem,3.5vw,2rem)] tracking-[-0.02em] text-[#121212]">My applications</h1>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">
            Track status, open your private tracker link, or view full detail while signed in.
          </p>
        </header>

        {rows.length === 0 ? (
          <section className="mt-10 rounded-2xl border border-[#e8e6e3] bg-[#f5f4f1] px-6 py-12 text-center shadow-sm shadow-[#121212]/[0.03]">
            <h2 className="font-authSerif text-[1.375rem] text-[#121212]">No applications yet</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-[#6b6b6b]">
              Browse live roles and submit your first application.
            </p>
            <Link
              href={jobsIndexHref}
              className="mt-6 inline-flex rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-semibold text-[#faf9f6] hover:opacity-90"
            >
              Browse jobs
            </Link>
          </section>
        ) : (
          <ul className="mt-10 space-y-4">
            {rows.map((row) => {
              const detailHref = tenantJobMeApplicationRelativePath(row.application_id, orgSlug, host);
              return (
                <li
                  key={row.application_id}
                  className="rounded-2xl border border-[#e8e6e3] bg-[#f5f4f1] p-5 shadow-sm shadow-[#121212]/[0.03]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{row.org_name}</p>
                      <h2 className="mt-1 font-authSerif text-[24px] leading-tight">{row.job_title}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CandidateApplicationStageBadge stage={row.stage} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      <Link
                        href={detailHref}
                        className="inline-flex justify-center rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-[#faf9f6] hover:opacity-90"
                      >
                        View detail
                      </Link>
                      <Link
                        href={`/jobs/status/${encodeURIComponent(row.portal_token)}`}
                        className="inline-flex justify-center rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] hover:bg-[#f5f4f1]"
                      >
                        Open tracker
                      </Link>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] text-[#9b9b9b]">
                    Applied{' '}
                    {new Date(row.submitted_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
