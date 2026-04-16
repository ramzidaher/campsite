import { BradfordReportClient } from '@/components/admin/hr/BradfordReportClient';
import type { BradfordReportRow } from '@/components/admin/hr/BradfordReportClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
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
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const permissionKeys = await getMyPermissions(orgId);
  const canViewAll =
    permissionKeys.includes('hr.view_records') || permissionKeys.includes('leave.manage_org');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const asOf = new Date().toISOString().slice(0, 10);
  const [{ data: reportData, error }, { data: settings }, { data: trendData }, { data: highAbsenceData }] = await Promise.all([
    supabase.rpc('hr_bradford_report', { p_on: asOf }),
    supabase.from('org_leave_settings').select('bradford_window_days').eq('org_id', orgId).maybeSingle(),
    supabase.rpc('hr_leave_usage_trends', { p_on: asOf }),
    supabase.rpc('hr_high_absence_triggers', { p_on: asOf }),
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">
        <p className="text-[13px] text-[#b91c1c]">Could not load absence report: {error.message}</p>
      </div>
    );
  }

  const bradfordWindowDays = Number(settings?.bradford_window_days ?? 365) || 365;

  return (
    <BradfordReportClient
      initialRows={mapReportRows(reportData)}
      initialAsOf={asOf}
      bradfordWindowDays={bradfordWindowDays}
      canViewAll={canViewAll}
      initialTrends={mapTrendRows(trendData)}
      initialHighAbsence={mapHighAbsenceRows(highAbsenceData)}
    />
  );
}
