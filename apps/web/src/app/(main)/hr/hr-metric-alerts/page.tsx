import { HrMetricAlertsSettingsClient } from '@/components/hr/HrMetricAlertsSettingsClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HrMetricAlertsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('hr.view_records')) redirect('/broadcasts');

  const supabase = await createClient();

  const { data: raw, error } = await supabase.rpc('org_hr_metric_settings_get');
  if (error) redirect('/broadcasts');

  const row = raw as Record<string, unknown> | null;
  const initial = row
    ? {
        bradford_alert_threshold: Number(row.bradford_alert_threshold ?? 200),
        working_hours_use_contract: row.working_hours_use_contract !== false,
        working_hours_absolute_max:
          row.working_hours_absolute_max != null ? Number(row.working_hours_absolute_max) : null,
        diversity_evaluation_window_days: Number(row.diversity_evaluation_window_days ?? 90),
        diversity_min_sample_size: Number(row.diversity_min_sample_size ?? 5),
        eq_category_codes: Array.isArray(row.eq_category_codes)
          ? (row.eq_category_codes as { code?: string; label?: string }[]).map((e) => ({
              code: String(e.code ?? ''),
              label: String(e.label ?? ''),
            }))
          : [],
        metrics_enabled:
          row.metrics_enabled && typeof row.metrics_enabled === 'object'
            ? (row.metrics_enabled as Record<string, boolean>)
            : {},
      }
    : null;

  return <HrMetricAlertsSettingsClient initial={initial} />;
}
