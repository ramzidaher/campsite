import { AdminJobsListClient } from '@/components/admin/AdminJobsListClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminJobsPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/jobs',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, role, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('jobs.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [orgRes, jobsRes, deptsRes] = await Promise.all([
    withServerPerf('/admin/jobs', 'org_slug_lookup', supabase.from('organisations').select('slug').eq('id', orgId).single(), 300),
    withServerPerf(
      '/admin/jobs',
      'job_listings_lookup',
      supabase
        .from('job_listings')
        .select(
          'id, title, slug, status, grade_level, salary_band, contract_type, published_at, posted_year, department_id, departments(name)'
        )
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(300),
      500
    ),
    withServerPerf(
      '/admin/jobs',
      'departments_lookup',
      supabase.from('departments').select('id, name').eq('org_id', orgId).order('name'),
      350
    ),
  ]);
  const orgRow = orgRes.data;
  const jobRows = jobsRes.data;
  const deptRows = deptsRes.data;

  const orgSlug = (orgRow?.slug as string | undefined)?.trim() ?? '';

  const view = (
    <AdminJobsListClient
      rows={(jobRows ?? []) as Parameters<typeof AdminJobsListClient>[0]['rows']}
      departments={(deptRows ?? []) as Parameters<typeof AdminJobsListClient>[0]['departments']}
      orgSlug={orgSlug}
    />
  );
  warnIfSlowServerPath('/admin/jobs', pathStartedAtMs);
  return view;
}
