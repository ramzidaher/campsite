import { CandidatePortalNav } from '@/app/(public)/jobs/CandidatePortalNav';
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

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
      <main className="mx-auto w-full max-w-3xl">
        <CandidatePortalNav orgSlug={orgSlug} hostHeader={host} current="applications" />

        <header className="mb-6 rounded-xl border border-[#e8e8e8] bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Candidate portal</p>
          <h1 className="mt-1 font-authSerif text-[34px]">My applications</h1>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">
            Track status, open your private tracker link, or view full detail while signed in.
          </p>
        </header>

        {rows.length === 0 ? (
          <section className="rounded-xl border border-[#e8e8e8] bg-white p-8 text-center">
            <h2 className="font-authSerif text-[28px]">No applications yet</h2>
            <p className="mt-2 text-[14px] text-[#6b6b6b]">Browse live roles and submit your first application.</p>
            <Link
              href={jobsIndexHref}
              className="mt-4 inline-flex rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] hover:opacity-90"
            >
              Browse jobs
            </Link>
          </section>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const detailHref = tenantJobMeApplicationRelativePath(row.application_id, orgSlug, host);
              return (
                <li key={row.application_id} className="rounded-xl border border-[#e8e8e8] bg-white p-5">
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
      </main>
    </div>
  );
}
