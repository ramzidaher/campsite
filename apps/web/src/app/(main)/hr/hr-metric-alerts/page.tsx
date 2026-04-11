import { HrMetricAlertsSettingsClient } from '@/components/hr/HrMetricAlertsSettingsClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function HrMetricAlertsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('hr.view_records'))) redirect('/broadcasts');

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
