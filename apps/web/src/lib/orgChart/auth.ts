import { createSupabaseForApiRequest, getUserFromApiRequest } from '@/lib/supabase/apiRouteAuth';

const ORG_CHART_VIEW_PERMISSIONS = [
  'leave.approve_direct_reports',
  'leave.manage_org',
  'hr.view_records',
  'reports.view',
] as const;

export async function canViewOrgChartFromRequest(req: Request): Promise<boolean> {
  const user = await getUserFromApiRequest(req);
  if (!user) return false;
  const supabase = await createSupabaseForApiRequest(req);
  if (!supabase) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return false;

  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const keys = Array.isArray(perms)
    ? perms.map((row) => String((row as { permission_key?: string }).permission_key ?? ''))
    : [];
  return ORG_CHART_VIEW_PERMISSIONS.some((k) => keys.includes(k));
}
