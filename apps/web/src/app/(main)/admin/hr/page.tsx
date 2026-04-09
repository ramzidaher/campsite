import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HRDirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: canViewAll }, { data: canViewTeam }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_records',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_direct_reports',
      p_context: {},
    }),
  ]);

  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const [canManage, canManagePerformanceCycles, rows, dashStats] = await Promise.all([
    supabase
      .rpc('has_permission', {
        p_user_id: user.id,
        p_org_id: orgId,
        p_permission_key: 'hr.manage_records',
        p_context: {},
      })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', {
        p_user_id: user.id,
        p_org_id: orgId,
        p_permission_key: 'performance.manage_cycles',
        p_context: {},
      })
      .then(({ data }) => !!data),
    supabase.rpc('hr_directory_list').then(({ data }) => data ?? []),
    canViewAll
      ? supabase.rpc('hr_dashboard_stats').then(({ data }) => data ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <HRDirectoryClient
      orgId={orgId}
      canManage={canManage}
      canManagePerformanceCycles={canManagePerformanceCycles}
      canViewAll={!!canViewAll}
      initialRows={(rows ?? []) as Parameters<typeof HRDirectoryClient>[0]['initialRows']}
      dashStats={(dashStats ?? null) as Record<string, unknown> | null}
    />
  );
}
