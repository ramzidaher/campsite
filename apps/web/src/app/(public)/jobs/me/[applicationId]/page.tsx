import { CandidatePortalNav } from '@/app/(public)/jobs/CandidatePortalNav';
import { ApplicationStageTimeline } from '@/app/(public)/jobs/me/ApplicationStageTimeline';
import { CandidateApplicationMessages } from '@/app/(public)/jobs/me/CandidateApplicationMessages';
import { CandidateApplicationStageBadge } from '@/app/(public)/jobs/me/CandidateApplicationStageBadge';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { createClient } from '@/lib/supabase/server';
import {
  tenantJobListingRelativePath,
  tenantJobMeApplicationRelativePath,
  tenantJobsSubrouteRelativePath,
} from '@/lib/tenant/adminUrl';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PortalMessage = { body: string; created_at: string };

type DetailRow = {
  org_name: string;
  org_slug: string;
  job_title: string;
  job_slug: string;
  stage: string;
  submitted_at: string;
  interview_joining_instructions: string | null;
  messages: PortalMessage[] | null;
  portal_token: string;
};

export default async function CandidateApplicationDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId: rawId } = await params;
  const applicationId = rawId?.trim() ?? '';
  if (!UUID_RE.test(applicationId)) notFound();

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
        nextPath: tenantJobMeApplicationRelativePath(applicationId, orgSlug, host),
      })
    );
  }

  const { data, error } = await supabase.rpc('get_my_candidate_application_detail', {
    p_application_id: applicationId,
  });

  if (error || !data?.length) notFound();

  const row = data[0] as DetailRow;
  const messages = Array.isArray(row.messages) ? row.messages : [];

  const listingHref = tenantJobListingRelativePath(row.job_slug, row.org_slug, host);
  const trackerHref = `/jobs/status/${encodeURIComponent(row.portal_token)}`;
  const backToListHref = tenantJobsSubrouteRelativePath('me', orgSlug, host);

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
      <main className="mx-auto w-full max-w-3xl">
        <CandidatePortalNav orgSlug={orgSlug} hostHeader={host} current="applications" />

        <header className="mb-6 rounded-xl border border-[#e8e8e8] bg-white p-6">
          <Link href={backToListHref} className="text-[12px] text-[#008B60] underline hover:text-[#006b4a]">
            ← Back to my applications
          </Link>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{row.org_name}</p>
          <h1 className="mt-1 font-authSerif text-[30px] leading-tight">{row.job_title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CandidateApplicationStageBadge stage={row.stage} />
            <span className="text-[12px] text-[#9b9b9b]">
              Applied{' '}
              {row.submitted_at
                ? new Date(row.submitted_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '—'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
            <Link href={listingHref} className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 hover:bg-[#f5f4f1]">
              View job listing
            </Link>
            <Link href={trackerHref} className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 hover:bg-[#f5f4f1]">
              Open shareable tracker link
            </Link>
          </div>
        </header>

        <section className="mb-4 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Progress</h2>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">
            Stages update as your application moves through review. This view is for your signed-in account only.
          </p>
          <div className="mt-4">
            <ApplicationStageTimeline stage={row.stage} />
          </div>
        </section>

        <div className="space-y-4">
          <CandidateApplicationMessages messages={messages} />
        </div>

        {row.interview_joining_instructions ? (
          <section className="mt-4 rounded-xl border border-[#dbeafe] bg-[#f8fbff] p-5 shadow-sm">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#1e40af]">Interview joining instructions</h2>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1f2937]">
              {row.interview_joining_instructions}
            </p>
          </section>
        ) : null}

        <p className="mt-8 text-center text-[11px] text-[#9b9b9b]">
          You can also bookmark your private tracker link from the email we sent — it does not require signing in.
        </p>
      </main>
    </div>
  );
}
