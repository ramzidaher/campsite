import { AdminJobsListClient } from '@/components/admin/AdminJobsListClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminJobsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('jobs.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: orgRow }, { data: jobRows }, { data: deptRows }] = await Promise.all([
    supabase.from('organisations').select('slug').eq('id', orgId).single(),
    supabase
      .from('job_listings')
      .select(
        'id, title, slug, status, grade_level, salary_band, contract_type, published_at, posted_year, department_id, departments(name)'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase.from('departments').select('id, name').eq('org_id', orgId).order('name'),
  ]);

  const orgSlug = (orgRow?.slug as string | undefined)?.trim() ?? '';

  return (
    <AdminJobsListClient
      rows={(jobRows ?? []) as Parameters<typeof AdminJobsListClient>[0]['rows']}
      departments={(deptRows ?? []) as Parameters<typeof AdminJobsListClient>[0]['departments']}
      orgSlug={orgSlug}
    />
  );
}
