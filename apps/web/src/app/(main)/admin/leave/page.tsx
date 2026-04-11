import { OrgLeaveAdminClient } from '@/components/admin/OrgLeaveAdminClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminLeavePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'leave.manage_org',
    p_context: {},
  });
  if (!allowed) redirect('/admin');

  const [{ data: members }, { data: settings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name'),
    supabase
      .from('org_leave_settings')
      .select(
        'bradford_window_days, leave_year_start_month, leave_year_start_day, approved_request_change_window_hours, default_annual_entitlement_days, leave_use_working_days, non_working_iso_dows, use_uk_weekly_paid_leave_formula, statutory_weeks_annual_leave, ssp_flat_weekly_rate_gbp, ssp_lel_weekly_gbp, ssp_waiting_qualifying_days, ssp_reform_percent_of_earnings',
      )
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);

  return (
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
            }
          : null
      }
    />
  );
}
