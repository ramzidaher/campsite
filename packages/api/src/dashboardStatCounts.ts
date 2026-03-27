import type { SupabaseClient } from '@supabase/supabase-js';
import { dashboardAggregateScope } from '@campsite/types';

export type DashboardStatCounts = {
  broadcastTotal: number;
  memberActiveTotal: number;
  /** Labels: org-wide vs department-scoped KPIs */
  statScope: 'org' | 'dept';
};

async function deptIdsForDashboardStats(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  role: string
): Promise<string[]> {
  const r = role.trim();
  const candidates = new Set<string>();

  const { data: udRows } = await supabase.from('user_departments').select('dept_id').eq('user_id', userId);
  for (const row of udRows ?? []) {
    const d = row.dept_id as string | undefined;
    if (d) candidates.add(d);
  }

  if (r === 'manager') {
    const { data: dmRows } = await supabase.from('dept_managers').select('dept_id').eq('user_id', userId);
    for (const row of dmRows ?? []) {
      const d = row.dept_id as string | undefined;
      if (d) candidates.add(d);
    }
  }

  const raw = [...candidates];
  if (!raw.length) return [];

  const { data: inOrg } = await supabase.from('departments').select('id').eq('org_id', orgId).in('id', raw);

  return (inOrg ?? []).map((row) => row.id as string);
}

/**
 * Broadcast + active-member counts for the main dashboard, respecting v2 scope (org vs dept vs hidden).
 * Returns null when the role should not see KPI tiles. Uses RLS on the caller's Supabase client.
 */
export async function fetchDashboardStatCounts(
  supabase: SupabaseClient,
  args: { userId: string; orgId: string; role: string }
): Promise<DashboardStatCounts | null> {
  const scope = dashboardAggregateScope(args.role.trim());
  if (scope === 'none') return null;

  const { orgId, userId } = args;

  if (scope === 'org') {
    const [bc, mc] = await Promise.all([
      supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'sent'),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'active'),
    ]);
    return {
      broadcastTotal: bc.count ?? 0,
      memberActiveTotal: mc.count ?? 0,
      statScope: 'org',
    };
  }

  const deptIds = await deptIdsForDashboardStats(supabase, userId, orgId, args.role);
  if (deptIds.length === 0) {
    return { broadcastTotal: 0, memberActiveTotal: 0, statScope: 'dept' };
  }

  const { count: broadcastTotal } = await supabase
    .from('broadcasts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'sent')
    .in('dept_id', deptIds);

  const { data: memberRows } = await supabase.from('user_departments').select('user_id').in('dept_id', deptIds);

  const memberUserIds = [...new Set((memberRows ?? []).map((row) => row.user_id as string))];
  if (memberUserIds.length === 0) {
    return {
      broadcastTotal: broadcastTotal ?? 0,
      memberActiveTotal: 0,
      statScope: 'dept',
    };
  }

  const { count: memberActiveTotal } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('id', memberUserIds);

  return {
    broadcastTotal: broadcastTotal ?? 0,
    memberActiveTotal: memberActiveTotal ?? 0,
    statScope: 'dept',
  };
}
