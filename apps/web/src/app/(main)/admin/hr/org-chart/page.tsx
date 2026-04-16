import { OrgChartClient } from '@/components/admin/hr/OrgChartClient';
import type { HRDirectoryRow } from '@/components/admin/hr/HRDirectoryClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function HROrgChartPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/hr/org-chart',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [permissionKeys, rowsRes, orgRes] = await Promise.all([
    withServerPerf('/admin/hr/org-chart', 'get_my_permissions', getMyPermissions(orgId), 300),
    withServerPerf('/admin/hr/org-chart', 'hr_directory_list', supabase.rpc('hr_directory_list'), 450),
    withServerPerf(
      '/admin/hr/org-chart',
      'org_name_lookup',
      supabase.from('organisations').select('name').eq('id', orgId).maybeSingle(),
      300
    ),
  ]);
  const rows = rowsRes.data;
  const org = orgRes.data;

  if (!permissionKeys.includes('hr.view_records')) redirect('/admin');
  const chartTitle = `${org?.name?.trim() || 'Organisation'} Chart`;

  const view = (
    <div style={{ height: 'calc(100dvh - 60px)', background: '#0a0a0c' }}>
      <OrgChartClient rows={(rows ?? []) as HRDirectoryRow[]} chartTitle={chartTitle} />
    </div>
  );
  warnIfSlowServerPath('/admin/hr/org-chart', pathStartedAtMs);
  return view;
}
