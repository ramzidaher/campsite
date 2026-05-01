import { OrgLeaveAdminClient } from '@/components/admin/OrgLeaveAdminClient';
import { getCachedAdminLeavePageData } from '@/lib/admin/getCachedAdminLeavePageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminLeavePage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf('/admin/leave', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('leave.manage_org')) redirect('/admin');

  const pageData = await withServerPerf(
    '/admin/leave',
    'cached_admin_leave_page_data',
    getCachedAdminLeavePageData(orgId),
    650
  );
  const members = pageData.members;
  const settings = pageData.settings;

  const view = (
    <OrgLeaveAdminClient
      orgId={orgId}
      members={(members ?? []) as { id: string; full_name: string; email: string | null }[]}
      initialSettings={
        settings
          ? {
              bradford_window_days: Number(settings.bradford_window_days),
              leave_year_start_month: Number(settings.leave_year_start_month),
              leave_year_start_day: Number(settings.leave_year_start_day),
              approved_request_change_window_hours: Number(settings.approved_request_change_window_hours ?? 48),
              default_annual_entitlement_days:
                settings.default_annual_entitlement_days != null
                  ? Number(settings.default_annual_entitlement_days)
                  : null,
              leave_use_working_days: Boolean(settings.leave_use_working_days),
              non_working_iso_dows: Array.isArray(settings.non_working_iso_dows)
                ? (settings.non_working_iso_dows as number[]).map((n) => Number(n))
                : [6, 7],
              use_uk_weekly_paid_leave_formula: Boolean(settings.use_uk_weekly_paid_leave_formula),
              statutory_weeks_annual_leave: Number(settings.statutory_weeks_annual_leave ?? 5.6),
              ssp_flat_weekly_rate_gbp: Number(settings.ssp_flat_weekly_rate_gbp ?? 123.25),
              ssp_lel_weekly_gbp:
                settings.ssp_lel_weekly_gbp != null ? Number(settings.ssp_lel_weekly_gbp) : null,
              ssp_waiting_qualifying_days: Number(settings.ssp_waiting_qualifying_days ?? 0),
              ssp_reform_percent_of_earnings: Number(settings.ssp_reform_percent_of_earnings ?? 0.8),
              carry_over_enabled: Boolean(settings.carry_over_enabled),
              carry_over_requires_approval: Boolean(settings.carry_over_requires_approval ?? true),
              carry_over_max_days: Number(settings.carry_over_max_days ?? 0),
              encashment_enabled: Boolean(settings.encashment_enabled),
              encashment_requires_approval: Boolean(settings.encashment_requires_approval ?? true),
              encashment_max_days: Number(settings.encashment_max_days ?? 0),
              leave_accrual_enabled: Boolean((settings as { leave_accrual_enabled?: boolean }).leave_accrual_enabled),
              leave_accrual_frequency: String((settings as { leave_accrual_frequency?: string }).leave_accrual_frequency ?? 'monthly'),
              leave_law_country_code: String((settings as { leave_law_country_code?: string }).leave_law_country_code ?? 'GB'),
              leave_law_profile: String((settings as { leave_law_profile?: string }).leave_law_profile ?? 'uk'),
            }
          : null
      }
    />
  );
  warnIfSlowServerPath('/admin/leave', pathStartedAtMs);
  return view;
}
