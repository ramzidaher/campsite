import { HrOneOnOneComplianceClient } from '@/components/one-on-one/HrOneOnOneComplianceClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HrOneOnOnesPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/one-on-ones',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const supabase = await createClient();
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
