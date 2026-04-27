import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  allow_application_questions: boolean | null;
};

export default async function HiringApplicationFormsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const [canViewJobs, canViewApplications] = await Promise.all([
    viewerHasPermission('jobs.view'),
    viewerHasPermission('applications.view'),
  ]);
  if (!canViewJobs && !canViewApplications) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: jobs }, { data: questionRows }] = await Promise.all([
    supabase
      .from('job_listings')
      .select('id, title, status, allow_application_questions')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('job_listing_screening_questions')
      .select('job_listing_id')
      .eq('org_id', orgId),
  ]);

  const questionCountByJob = new Map<string, number>();
  for (const row of questionRows ?? []) {
    const jobId = String((row as { job_listing_id?: string | null }).job_listing_id ?? '');
    if (!jobId) continue;
    questionCountByJob.set(jobId, (questionCountByJob.get(jobId) ?? 0) + 1);
  }

  const rows = (jobs ?? []) as JobRow[];

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <HideInHiringHub>
        <div className="mb-5">
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Application forms</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Configure role-specific application forms before publishing each advert.
          </p>
        </div>
      </HideInHiringHub>

      <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-[#ececec] bg-[#f7fbf8] text-[11px] font-semibold uppercase tracking-wide text-[#6a6a6a]">
            <tr>
              <th className="px-4 py-3">Job advert</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Form setup</th>
              <th className="px-4 py-3">Questions</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#9b9b9b]">
                  No job adverts yet.
                </td>
              </tr>
            ) : (
              rows.map((job) => {
                const title = (job.title ?? '').trim() || 'Untitled job';
                const status = (job.status ?? '').trim() || '-';
                const questionCount = questionCountByJob.get(job.id) ?? 0;
                return (
                  <tr key={job.id} className="align-top hover:bg-[#faf9f6]">
                    <td className="px-4 py-3 font-medium text-[#121212]">{title}</td>
                    <td className="px-4 py-3 text-[#505050]">{status}</td>
                    <td className="px-4 py-3 text-[#505050]">
                      {job.allow_application_questions ? 'Enabled' : 'Disabled'}
                    </td>
                    <td className="px-4 py-3 text-[#505050]">{questionCount}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/hr/jobs/${job.id}/edit`}
                        prefetch={false}
                        className="inline-flex h-8 items-center rounded-md border border-[#d8d8d8] bg-white px-3 text-[12px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
                      >
                        Edit form
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
