import { ManagerDashboardClient } from '@/components/admin/ManagerDashboardClient';
import { endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ManagerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') {
    redirect('/broadcasts');
  }
  const [{ data: canViewDepartments }, { data: canCreateRecruitment }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'departments.view',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'recruitment.create_request',
      p_context: {},
    }),
  ]);
  if (!canViewDepartments && !canCreateRecruitment) redirect('/broadcasts');

  if (!canCreateRecruitment) {
    redirect('/manager/teams');
  }

  const { data: managed } = await supabase.from('dept_managers').select('dept_id').eq('user_id', user.id);
  const deptIds = (managed ?? []).map((m) => m.dept_id as string);

  let pendingUsers = 0;
  let pendingBroadcasts = 0;
  let shiftsWeek = 0;

  if (deptIds.length) {
    const { data: udRows } = await supabase.from('user_departments').select('user_id').in('dept_id', deptIds);
    const memberIds = [...new Set((udRows ?? []).map((r) => r.user_id as string))];
    if (memberIds.length) {
      const { data: pu } = await supabase
        .from('profiles')
        .select('id')
        .eq('org_id', profile.org_id)
        .eq('status', 'pending')
        .in('id', memberIds);
      pendingUsers = pu?.length ?? 0;
    }

    const { count: bc } = await supabase
      .from('broadcasts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .eq('status', 'pending_approval')
      .in('dept_id', deptIds);
    pendingBroadcasts = bc ?? 0;

    const weekStart = startOfWeekMonday(new Date());
    const weekEnd = endOfWeekExclusive(weekStart);

    const { count: sh } = await supabase
      .from('rota_shifts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .in('dept_id', deptIds)
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString());
    shiftsWeek = sh ?? 0;
  }

  return (
    <ManagerDashboardClient
      stats={{ pendingUsers, pendingBroadcasts, shiftsWeek }}
      hasDepartments={deptIds.length > 0}
    />
  );
}
