import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

type Timesheet = {
  user_id: string;
  week_start_date: string;
  approved_total_minutes: number | null;
  reported_total_minutes: number | null;
};

type WagesheetLine = {
  user_id: string;
  week_start_date: string;
  line_type: string;
  amount_gbp: number;
};

type Adjustment = {
  user_id: string;
  week_start_date: string;
  amount_gbp: number;
};

type HrPayProfile = {
  user_id: string;
  pay_frequency: 'weekly' | 'monthly' | 'four_weekly' | null;
  contract_type: 'zero_hours' | 'part_time' | 'full_time' | null;
};

type Review = {
  user_id: string;
  week_start_date: string;
  review_status: 'pending_manager' | 'pending_finance' | 'manager_approved' | 'finance_approved' | 'paid';
  manager_approved_by: string | null;
  finance_approved_by: string | null;
  paid_by: string | null;
  manager_approved_at: string | null;
  finance_approved_at: string | null;
  paid_at: string | null;
};

type Policy = {
  hourly_holiday_pay_percent: number;
  allow_bi_weekly: boolean;
  ssp_override_enabled: boolean;
  ssp_override_weekly_rate_gbp: number | null;
};

function monthRange(month: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return null;
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  }
  const orgId = profile.org_id as string;

  const { data: canView } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'payroll.view',
    p_context: {},
  });
  const { data: canManage } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'payroll.manage',
    p_context: {},
  });
  if (!canView && !canManage) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const weekStart = request.nextUrl.searchParams.get('weekStart')?.trim() ?? '';
  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const range = month ? monthRange(month) : null;
  if (month && !range) return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });

  let tsQuery = supabase
    .from('weekly_timesheets')
    .select('user_id, week_start_date, approved_total_minutes, reported_total_minutes')
    .eq('org_id', orgId)
    .in('status', ['submitted', 'approved'])
    .order('week_start_date', { ascending: false })
    .limit(1200);
  let wagesQuery = supabase
    .from('wagesheet_lines')
    .select('user_id, week_start_date, line_type, amount_gbp')
    .eq('org_id', orgId)
    .order('week_start_date', { ascending: false })
    .limit(2000);
  let adjustmentQuery = supabase
    .from('payroll_manual_adjustments')
    .select('user_id, week_start_date, amount_gbp')
    .eq('org_id', orgId)
    .order('week_start_date', { ascending: false })
    .limit(1200);

  if (weekStart) {
    tsQuery = tsQuery.eq('week_start_date', weekStart);
    wagesQuery = wagesQuery.eq('week_start_date', weekStart);
    adjustmentQuery = adjustmentQuery.eq('week_start_date', weekStart);
  } else if (range) {
    tsQuery = tsQuery.gte('week_start_date', range.from).lte('week_start_date', range.to);
    wagesQuery = wagesQuery.gte('week_start_date', range.from).lte('week_start_date', range.to);
    adjustmentQuery = adjustmentQuery.gte('week_start_date', range.from).lte('week_start_date', range.to);
  }

  const [tsRes, wagesRes, adjustmentsRes, reviewsRes, policyRes] = await Promise.all([
    tsQuery,
    wagesQuery,
    adjustmentQuery,
    supabase.from('payroll_wagesheet_reviews').select('user_id, week_start_date, review_status, manager_approved_by, finance_approved_by, paid_by, manager_approved_at, finance_approved_at, paid_at').eq('org_id', orgId),
    supabase.from('payroll_policy_settings').select('hourly_holiday_pay_percent, allow_bi_weekly, ssp_override_enabled, ssp_override_weekly_rate_gbp').eq('org_id', orgId).maybeSingle(),
  ]);
  if (tsRes.error) return NextResponse.json({ error: tsRes.error.message }, { status: 400 });
  if (wagesRes.error) return NextResponse.json({ error: wagesRes.error.message }, { status: 400 });
  if (adjustmentsRes.error) return NextResponse.json({ error: adjustmentsRes.error.message }, { status: 400 });
  if (reviewsRes.error) return NextResponse.json({ error: reviewsRes.error.message }, { status: 400 });

  const timesheets = (tsRes.data ?? []) as Timesheet[];
  const wages = (wagesRes.data ?? []) as WagesheetLine[];
  const adjustments = (adjustmentsRes.data ?? []) as Adjustment[];
  const reviews = (reviewsRes.data ?? []) as Review[];
  const policy = (policyRes.data as Policy | null) ?? null;

  const ids = [...new Set(timesheets.map((t) => t.user_id))];
  const { data: people } = ids.length
    ? await supabase.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] };
  const { data: hrPayProfiles } = ids.length
    ? await supabase.from('employee_hr_records').select('user_id, pay_frequency, contract_type').eq('org_id', orgId).in('user_id', ids)
    : { data: [] as HrPayProfile[] };
  const nameById = new Map((people ?? []).map((p) => [p.id as string, p.full_name ?? p.id]));
  const payFrequencyById = new Map<string, 'weekly' | 'monthly' | 'four_weekly'>();
  const contractById = new Map<string, 'zero_hours' | 'part_time' | 'full_time'>();
  for (const h of (hrPayProfiles ?? []) as HrPayProfile[]) {
    if (h.pay_frequency === 'weekly' || h.pay_frequency === 'monthly' || h.pay_frequency === 'four_weekly') {
      payFrequencyById.set(h.user_id, h.pay_frequency);
    }
    if (h.contract_type === 'zero_hours' || h.contract_type === 'part_time' || h.contract_type === 'full_time') {
      contractById.set(h.user_id, h.contract_type);
    }
  }

  const dataRows = timesheets.map((t) => {
    const review = reviews.find((r) => r.user_id === t.user_id && r.week_start_date === t.week_start_date);
    const actualHours = Number(t.approved_total_minutes ?? t.reported_total_minutes ?? 0) / 60;
    const overtimeHours = Math.max(0, actualHours - 40);
    const contract = contractById.get(t.user_id) ?? 'part_time';
    let basePay = wages
      .filter((w) => w.user_id === t.user_id && w.week_start_date === t.week_start_date && w.line_type === 'basic_pay')
      .reduce((sum, w) => sum + Number(w.amount_gbp ?? 0), 0);
    if (basePay === 0 && contract !== 'full_time') {
      const fallbackRate = 0;
      basePay = actualHours * fallbackRate;
    }
    if (policy?.hourly_holiday_pay_percent && contract !== 'full_time') {
      basePay += basePay * (policy.hourly_holiday_pay_percent / 100);
    }
    let ssp = wages
      .filter((w) => w.user_id === t.user_id && w.week_start_date === t.week_start_date && w.line_type === 'ssp')
      .reduce((sum, w) => sum + Number(w.amount_gbp ?? 0), 0);
    if (policy?.ssp_override_enabled && policy.ssp_override_weekly_rate_gbp != null) {
      ssp = Number(policy.ssp_override_weekly_rate_gbp);
    }
    const manualAdjustments = adjustments
      .filter((a) => a.user_id === t.user_id && a.week_start_date === t.week_start_date)
      .reduce((sum, a) => sum + Number(a.amount_gbp ?? 0), 0);
    let payFrequency = payFrequencyById.get(t.user_id) ?? 'weekly';
    if (contract === 'full_time') payFrequency = 'monthly';
    if (contract === 'part_time' && payFrequency === 'monthly') payFrequency = 'weekly';
    if (payFrequency === 'four_weekly' && policy && !policy.allow_bi_weekly) payFrequency = 'weekly';
    return {
      employee: nameById.get(t.user_id) ?? t.user_id,
      pay_frequency: payFrequency,
      contract_type: contract,
      review_status: review?.review_status ?? 'pending_manager',
      week_start: t.week_start_date,
      actual_hours: Number(actualHours.toFixed(2)),
      overtime_hours: Number(overtimeHours.toFixed(2)),
      base_pay_gbp: Number(basePay.toFixed(2)),
      ssp_gbp: Number(ssp.toFixed(2)),
      manual_adjustment_gbp: Number(manualAdjustments.toFixed(2)),
      projected_gross_gbp: Number((basePay + ssp + manualAdjustments).toFixed(2)),
      manager_approved_by: review?.manager_approved_by ?? '',
      finance_approved_by: review?.finance_approved_by ?? '',
      paid_by: review?.paid_by ?? '',
      manager_approved_at: review?.manager_approved_at ?? '',
      finance_approved_at: review?.finance_approved_at ?? '',
      paid_at: review?.paid_at ?? '',
    };
  });

  const weeklySummaryByWeek = new Map<
    string,
    { actualHours: number; overtimeHours: number; basePay: number; ssp: number; manualAdjustments: number; gross: number }
  >();
  for (const row of dataRows) {
    const cur = weeklySummaryByWeek.get(row.week_start) ?? {
      actualHours: 0,
      overtimeHours: 0,
      basePay: 0,
      ssp: 0,
      manualAdjustments: 0,
      gross: 0,
    };
    cur.actualHours += row.actual_hours;
    cur.overtimeHours += row.overtime_hours;
    cur.basePay += row.base_pay_gbp;
    cur.ssp += row.ssp_gbp;
    cur.manualAdjustments += row.manual_adjustment_gbp;
    cur.gross += row.projected_gross_gbp;
    weeklySummaryByWeek.set(row.week_start, cur);
  }

  const weeklySummaryRows = [...weeklySummaryByWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, v]) => ({
      week_start: weekStart,
      total_actual_hours: Number(v.actualHours.toFixed(2)),
      total_overtime_hours: Number(v.overtimeHours.toFixed(2)),
      total_base_pay_gbp: Number(v.basePay.toFixed(2)),
      total_ssp_gbp: Number(v.ssp.toFixed(2)),
      total_manual_adjustment_gbp: Number(v.manualAdjustments.toFixed(2)),
      total_projected_gross_gbp: Number(v.gross.toFixed(2)),
    }));

  const frequencyTotals = new Map<
    string,
    { basePay: number; ssp: number; manualAdjustments: number; gross: number; overtimeHours: number }
  >();
  for (const row of dataRows) {
    const key = row.pay_frequency;
    const cur = frequencyTotals.get(key) ?? { basePay: 0, ssp: 0, manualAdjustments: 0, gross: 0, overtimeHours: 0 };
    cur.basePay += row.base_pay_gbp;
    cur.ssp += row.ssp_gbp;
    cur.manualAdjustments += row.manual_adjustment_gbp;
    cur.gross += row.projected_gross_gbp;
    cur.overtimeHours += row.overtime_hours;
    frequencyTotals.set(key, cur);
  }
  const frequencyRows = [...frequencyTotals.entries()].map(([payFrequency, v]) => ({
    pay_frequency: payFrequency,
    total_base_pay_gbp: Number(v.basePay.toFixed(2)),
    total_ssp_gbp: Number(v.ssp.toFixed(2)),
    total_manual_adjustment_gbp: Number(v.manualAdjustments.toFixed(2)),
    total_overtime_hours: Number(v.overtimeHours.toFixed(2)),
    total_projected_gross_gbp: Number(v.gross.toFixed(2)),
  }));

  const ws = XLSX.utils.json_to_sheet(dataRows);
  const weeklyWs = XLSX.utils.json_to_sheet(weeklySummaryRows);
  const frequencyWs = XLSX.utils.json_to_sheet(frequencyRows);
  const auditWs = XLSX.utils.json_to_sheet(
    dataRows.map((r) => ({
      employee: r.employee,
      week_start: r.week_start,
      review_status: r.review_status,
      manager_approved_by: r.manager_approved_by,
      manager_approved_at: r.manager_approved_at,
      finance_approved_by: r.finance_approved_by,
      finance_approved_at: r.finance_approved_at,
      paid_by: r.paid_by,
      paid_at: r.paid_at,
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Wage Sheets');
  XLSX.utils.book_append_sheet(wb, weeklyWs, 'Weekly Summary');
  XLSX.utils.book_append_sheet(wb, frequencyWs, 'Frequency Summary');
  XLSX.utils.book_append_sheet(wb, auditWs, 'Approvals Audit');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(out, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="wage-sheets-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store, private',
      Pragma: 'no-cache',
    },
  });
}
