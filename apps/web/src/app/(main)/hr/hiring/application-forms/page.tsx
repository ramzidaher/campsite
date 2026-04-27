import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type FormRow = {
  id: string;
  name: string | null;
  updated_at: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  application_question_set_id: string | null;
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

  const [{ data: forms }, { data: jobs }, { data: items }] = await Promise.all([
    supabase
      .from('org_application_question_sets')
      .select('id, name, updated_at')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('job_listings')
      .select('id, title, status, application_question_set_id')
      .eq('org_id', orgId),
    supabase
      .from('org_application_question_set_items')
      .select('set_id')
      .eq('org_id', orgId),
  ]);

  const questionCountBySet = new Map<string, number>();
  for (const row of items ?? []) {
    const setId = String((row as { set_id?: string | null }).set_id ?? '');
    if (!setId) continue;
    questionCountBySet.set(setId, (questionCountBySet.get(setId) ?? 0) + 1);
  }

  const linkedJobsBySet = new Map<string, JobRow[]>();
  for (const job of (jobs ?? []) as JobRow[]) {
    const setId = (job.application_question_set_id ?? '').trim();
    if (!setId) continue;
    const arr = linkedJobsBySet.get(setId) ?? [];
    arr.push(job);
    linkedJobsBySet.set(setId, arr);
  }

  const rows = (forms ?? []) as FormRow[];

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <HideInHiringHub>
        <div className="mb-5">
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Application forms</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Reusable forms you can attach to any role before making a job advert live.
          </p>
        </div>
      </HideInHiringHub>

      <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-[#ececec] bg-[#f7fbf8] text-[11px] font-semibold uppercase tracking-wide text-[#6a6a6a]">
            <tr>
              <th className="px-4 py-3">Application form</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Questions</th>
              <th className="px-4 py-3">Linked job adverts</th>
              <th className="px-4 py-3">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#9b9b9b]">
                  No application forms yet. Create one from a job&apos;s question editor.
                </td>
              </tr>
            ) : (
              rows.map((form, idx) => {
                const formName = (form.name ?? '').trim() || 'Untitled form';
                const questionCount = questionCountBySet.get(form.id) ?? 0;
                const linkedJobs = linkedJobsBySet.get(form.id) ?? [];
                const hasLiveLink = linkedJobs.some((j) => (j.status ?? '').trim() === 'live');
                return (
                  <tr key={form.id} className="align-top hover:bg-[#faf9f6]">
                    <td className="px-4 py-3 font-medium text-[#121212]">{formName}</td>
                    <td className="px-4 py-3 text-[#505050]">
                      <span
                        className={[
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                          hasLiveLink ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f3f4f6] text-[#4b5563]',
                        ].join(' ')}
                      >
                        {hasLiveLink ? 'Live' : 'Draft'}
                      </span>
                      <span className="ml-1 text-[11px] text-[#9b9b9b]">v{idx + 1}</span>
                    </td>
                    <td className="px-4 py-3 text-[#505050]">{questionCount}</td>
                    <td className="px-4 py-3">
                      {linkedJobs.length === 0 ? (
                        <span className="text-[#9b9b9b]">Not linked</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {linkedJobs.slice(0, 3).map((job) => (
                            <span
                              key={job.id}
                              className="inline-flex rounded-full border border-[#d8d8d8] bg-white px-2 py-0.5 text-[11px] text-[#505050]"
                            >
                              {(job.title ?? '').trim() || 'Untitled role'}
                            </span>
                          ))}
                          {linkedJobs.length > 3 ? (
                            <span className="inline-flex rounded-full border border-[#d8d8d8] bg-white px-2 py-0.5 text-[11px] text-[#505050]">
                              +{linkedJobs.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#505050]">
                      {form.updated_at ? new Date(form.updated_at).toLocaleString() : '-'}
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
