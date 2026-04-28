import { OrgChartClient } from '@/components/admin/hr/OrgChartClient';
import type { HRDirectoryRow } from '@/components/admin/hr/HRDirectoryClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function AccessMessage({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-120px)] max-w-2xl items-center justify-center px-5 py-10">
      <div className="w-full rounded-2xl border border-[#e8e8e8] bg-white p-6 text-center">
        <h1 className="text-[20px] font-semibold text-[#121212]">You do not have access</h1>
        <p className="mt-2 text-[14px] text-[#6b6b6b]">{message}</p>
      </div>
    </div>
  );
}

export default async function HROrgChartPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/org-chart',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');

  const supabase = await createClient();
  if (shellBundleProfileStatus(bundle) !== 'active') {
    return <AccessMessage message="Your account needs an active organisation membership to view the org chart." />;
  }

  const [rowsRes, orgRes] = await Promise.all([
    withServerPerf('/admin/hr/org-chart', 'org_chart_directory_list', supabase.rpc('org_chart_directory_list'), 450),
    withServerPerf(
      '/admin/hr/org-chart',
      'org_name_lookup',
      supabase.from('organisations').select('name').eq('id', orgId).maybeSingle(),
      300
    ),
  ]);
  const rows = rowsRes.data;
  const org = orgRes.data;
  if (rowsRes.error) {
    return <AccessMessage message="You do not have access to this org chart right now." />;
  }
  const chartTitle = `${org?.name?.trim() || 'Organisation'} Chart`;

  const view = (
    <div style={{ height: 'calc(100dvh - 60px)', background: '#0a0a0c' }}>
      <OrgChartClient rows={(rows ?? []) as HRDirectoryRow[]} chartTitle={chartTitle} />
    </div>
  );
  warnIfSlowServerPath('/admin/hr/org-chart', pathStartedAtMs);
  return view;
}
