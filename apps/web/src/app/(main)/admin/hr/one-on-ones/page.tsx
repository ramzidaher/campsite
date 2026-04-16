import { HrOneOnOneComplianceClient } from '@/components/one-on-one/HrOneOnOneComplianceClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function HrOneOnOnesPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/hr/one-on-ones',
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

  const permissionKeys = await withServerPerf(
    '/admin/hr/one-on-ones',
    'get_my_permissions',
    getMyPermissions(orgId),
    300
  );
  if (!permissionKeys.includes('hr.view_records')) redirect('/broadcasts');

  const { data: rowsRaw, error } = await withServerPerf(
    '/admin/hr/one-on-ones',
    'hr_one_on_one_compliance_list',
    supabase.rpc('hr_one_on_one_compliance_list', {
      p_filter: 'all',
    }),
    450
  );
  if (error) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[#b91c1c]">{error.message}</p>
      </div>
    );
  }

  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as Array<{
    report_user_id: string;
    report_name: string;
    manager_user_id: string;
    manager_name: string;
    last_completed_at: string | null;
    next_due_on: string;
    cadence_days: number;
    status: string;
    days_overdue: number;
  }>;

  const view = <HrOneOnOneComplianceClient initialRows={rows} />;
  warnIfSlowServerPath('/admin/hr/one-on-ones', pathStartedAtMs);
  return view;
}
