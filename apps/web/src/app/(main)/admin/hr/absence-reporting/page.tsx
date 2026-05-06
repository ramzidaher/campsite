import { BradfordReportClient } from '@/components/admin/hr/BradfordReportClient';
import type { BradfordReportRow } from '@/components/admin/hr/BradfordReportClient';
import { getCachedAbsenceReportingPageData } from '@/lib/hr/getCachedAbsenceReportingPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

function mapReportRows(raw: unknown): BradfordReportRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      user_id: String(o.user_id ?? ''),
      full_name: String(o.full_name ?? ''),
      preferred_name: (o.preferred_name as string | null) ?? null,
      reports_to_user_id: (o.reports_to_user_id as string | null) ?? null,
      reports_to_name: (o.reports_to_name as string | null) ?? null,
      spell_count: Number(o.spell_count ?? 0),
      total_days: Number(o.total_days ?? 0),
      bradford_score: Number(o.bradford_score ?? 0),
    };
  });
}

function mapTrendRows(raw: unknown): Array<{ month_key: string; leave_days: number; sickness_days: number; leave_request_count: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      month_key: String(o.month_key ?? ''),
      leave_days: Number(o.leave_days ?? 0),
      sickness_days: Number(o.sickness_days ?? 0),
      leave_request_count: Number(o.leave_request_count ?? 0),
    };
  });
}

function mapHighAbsenceRows(raw: unknown): Array<{
  user_id: string;
  full_name: string;
  preferred_name: string | null;
  reports_to_name: string | null;
  spell_count: number;
  total_days: number;
  bradford_score: number;
  trigger_reason: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      user_id: String(o.user_id ?? ''),
      full_name: String(o.full_name ?? ''),
      preferred_name: (o.preferred_name as string | null) ?? null,
      reports_to_name: (o.reports_to_name as string | null) ?? null,
      spell_count: Number(o.spell_count ?? 0),
      total_days: Number(o.total_days ?? 0),
      bradford_score: Number(o.bradford_score ?? 0),
      trigger_reason: String(o.trigger_reason ?? ''),
    };
  });
}

export default async function AbsenceReportingPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/absence-reporting',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewAll =
    permissionKeys.includes('hr.view_records') || permissionKeys.includes('leave.manage_org');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/forbidden');

  const asOf = new Date().toISOString().slice(0, 10);
  const pageData = await withServerPerf(
    '/admin/hr/absence-reporting',
    'cached_absence_reporting_page_data',
    getCachedAbsenceReportingPageData(orgId, asOf),
    650
  );

  if (pageData.reportErrorMessage) {
    return (
      <div className="w-full px-5 py-6 sm:px-[28px] sm:py-7">
        <p className="text-[13px] text-[#b91c1c]">Could not load absence report: {pageData.reportErrorMessage}</p>
      </div>
    );
  }

  const view = (
    <BradfordReportClient
      initialRows={mapReportRows(pageData.reportData)}
      initialAsOf={asOf}
      bradfordWindowDays={pageData.bradfordWindowDays}
      canViewAll={canViewAll}
      initialTrends={mapTrendRows(pageData.trendData)}
      initialHighAbsence={mapHighAbsenceRows(pageData.highAbsenceData)}
    />
  );
  warnIfSlowServerPath('/admin/hr/absence-reporting', pathStartedAtMs);
  return view;
}
