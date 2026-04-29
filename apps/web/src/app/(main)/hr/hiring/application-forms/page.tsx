import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { HiringApplicationFormsTableClient } from '@/components/admin/HiringApplicationFormsTableClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

type FormRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  updated_at: string | null;
  job_title: string | null;
  grade_level: string | null;
  department_id: string | null;
  departments: { name: string } | { name: string }[] | null;
};

type JobRow = {
  id: string;
  title: string | null;
  grade_level: string | null;
  status: string | null;
  application_question_set_id: string | null;
  departments: { name: string } | { name: string }[] | null;
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
      .select('id, name, created_at, updated_at, job_title, grade_level, department_id, departments(name)')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('job_listings')
      .select('id, title, grade_level, status, application_question_set_id, departments(name)')
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

  const tableRows = rows.map((form) => {
    const linkedJobs = linkedJobsBySet.get(form.id) ?? [];
    const jobsWithDepartment = linkedJobs.map((job) => ({
      id: job.id,
      title: (job.title ?? '').trim(),
      grade: (job.grade_level ?? '').trim() || null,
      status: job.status,
      department: (Array.isArray(job.departments) ? job.departments[0]?.name : job.departments?.name) ?? null,
    }));
    return {
      id: form.id,
      name: form.name,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
      formJobTitle: (form.job_title ?? '').trim() || null,
      formGrade: (form.grade_level ?? '').trim() || null,
      formDepartment:
        (Array.isArray(form.departments) ? form.departments[0]?.name : form.departments?.name) ?? null,
      questionCount: questionCountBySet.get(form.id) ?? 0,
      linkedJobs: jobsWithDepartment,
    };
  });

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

      <HiringApplicationFormsTableClient rows={tableRows} />
    </div>
  );
}
