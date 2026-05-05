import { OrgChartClient } from '@/components/admin/hr/OrgChartClient';
import type { HRDirectoryRow } from '@/components/admin/hr/HRDirectoryClient';
import { getCachedOrgChartPageData } from '@/lib/hr/getCachedOrgChartPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { shellBundleOrgId, shellBundleOrgName, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
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
  if (shellBundleProfileStatus(bundle) !== 'active') {
    return <AccessMessage message="Your account needs an active organisation membership to view the org chart." />;
  }

  let pageData;
  try {
    pageData = await withServerPerf(
      '/admin/hr/org-chart',
      'org_chart_bundle_cached',
      getCachedOrgChartPageData(orgId),
      500
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    return (
      <AccessMessage message={`Could not load org chart data (${detail}). Try refreshing the page, or confirm you are signed in with access to this organisation.`} />
    );
  }
  const chartTitle = `${shellBundleOrgName(bundle) ?? 'Organisation'} Chart`;

  const view = (
    <div className="h-[calc(100dvh-60px)] bg-[#faf9f6] font-sans text-[#121212]">
      <OrgChartClient
        key={orgId}
        rows={(pageData.rows ?? []) as HRDirectoryRow[]}
        chartTitle={chartTitle}
      />
    </div>
  );
  warnIfSlowServerPath('/admin/hr/org-chart', pathStartedAtMs);
  return view;
}
