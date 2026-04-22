'use client';

import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Timesheet = {
  user_id: string;
  week_start_date: string;
  approved_total_minutes: number | null;
  reported_total_minutes: number | null;
  status: string;
};

type WagesheetLine = {
  user_id: string;
  week_start_date: string;
  line_type: string;
  amount_gbp: number;
  hours: number | null;
};

type Adjustment = {
  user_id: string;
  week_start_date: string;
  amount_gbp: number;
  note: string | null;
};

type Rate = {
  role_code: 'csa' | 'dm';
  effective_from: string;
  hourly_rate_gbp: number;
};

type PayProfile = {
  user_id: string;
  pay_role: 'csa' | 'dm';
};

type Person = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type HrPayProfile = {
  user_id: string;
  pay_frequency: 'weekly' | 'monthly' | 'four_weekly' | null;
};

type FinanceRow = {
  userId: string;
  name: string;
  payFrequency: 'weekly' | 'monthly' | 'four_weekly';
  weekStart: string;
  actualHours: number;
  scheduledHours: number;
  holidayDays: number;
  sicknessDays: number;
  overtimeHours: number;
  basePay: number;
  ssp: number;
  adjustments: number;
  projectedGross: number;
  varianceVsSchedule: number;
};

function weekBounds(weekStart: string): { startIso: string; endIso: string } {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function FinanceHubClient({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [weekFilter, setWeekFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [profiles, setProfiles] = useState<Record<string, 'csa' | 'dm'>>({});
  const [rates, setRates] = useState<Record<'csa' | 'dm', number>>({ csa: 0, dm: 0 });
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustWeek, setAdjustWeek] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [rateInputs, setRateInputs] = useState<{ csa: string; dm: string; effectiveFrom: string }>({
    csa: '',
    dm: '',
    effectiveFrom: '',
  });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data: peopleData } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name');
    const allPeople = (peopleData as Person[] | null) ?? [];
    setPeople(allPeople);

    let timesheetQuery = supabase
      .from('weekly_timesheets')
      .select('user_id, week_start_date, approved_total_minutes, reported_total_minutes, status')
      .eq('org_id', orgId)
      .in('status', ['submitted', 'approved'])
      .order('week_start_date', { ascending: false })
      .limit(350);
    if (weekFilter) timesheetQuery = timesheetQuery.eq('week_start_date', weekFilter);
    const { data: tsData, error: tsError } = await timesheetQuery;
    if (tsError) {
      setErr(tsError.message);
      return;
    }

    let wagesQuery = supabase
      .from('wagesheet_lines')
      .select('user_id, week_start_date, line_type, amount_gbp, hours')
      .eq('org_id', orgId)
      .order('week_start_date', { ascending: false })
      .limit(1000);
    if (weekFilter) wagesQuery = wagesQuery.eq('week_start_date', weekFilter);

    let adjustmentsQuery = supabase
      .from('payroll_manual_adjustments')
      .select('user_id, week_start_date, amount_gbp, note')
      .eq('org_id', orgId)
      .order('week_start_date', { ascending: false })
      .limit(600);
    if (weekFilter) adjustmentsQuery = adjustmentsQuery.eq('week_start_date', weekFilter);

    const [wagesRes, adjustmentsRes, ratesRes, payProfilesRes] = await Promise.all([
      wagesQuery,
      adjustmentsQuery,
      supabase.from('payroll_role_hourly_rates').select('role_code, effective_from, hourly_rate_gbp').eq('org_id', orgId).order('effective_from', { ascending: false }),
      supabase.from('payroll_employee_pay_profiles').select('user_id, pay_role').eq('org_id', orgId),
    ]);
    const { data: hrPayProfiles } = await supabase
      .from('employee_hr_records')
      .select('user_id, pay_frequency')
      .eq('org_id', orgId)
      .in('user_id', allPeople.map((p) => p.id));

    const timesheets = (tsData as Timesheet[] | null) ?? [];
    const wages = (wagesRes.data as WagesheetLine[] | null) ?? [];
    const adjustments = (adjustmentsRes.data as Adjustment[] | null) ?? [];
    const payProfiles = (payProfilesRes.data as PayProfile[] | null) ?? [];
    const ratesData = (ratesRes.data as Rate[] | null) ?? [];

    const profileMap: Record<string, 'csa' | 'dm'> = {};
    for (const pp of payProfiles) profileMap[pp.user_id] = pp.pay_role;
    setProfiles(profileMap);
    const payFrequencyMap: Record<string, 'weekly' | 'monthly' | 'four_weekly'> = {};
    for (const h of (hrPayProfiles as HrPayProfile[] | null) ?? []) {
      if (h.pay_frequency === 'monthly' || h.pay_frequency === 'four_weekly' || h.pay_frequency === 'weekly') {
        payFrequencyMap[h.user_id] = h.pay_frequency;
      }
    }

    const latestRate: Record<'csa' | 'dm', number> = { csa: 0, dm: 0 };
    for (const role of ['csa', 'dm'] as const) {
      const found = ratesData.find((r) => r.role_code === role);
      if (found) latestRate[role] = Number(found.hourly_rate_gbp);
    }
    setRates(latestRate);

    const tsKeys = new Set(timesheets.map((t) => `${t.user_id}:${t.week_start_date}`));
    const combinedKeys = new Set<string>(tsKeys);
    for (const w of wages) combinedKeys.add(`${w.user_id}:${w.week_start_date}`);

    const weekToUsers = new Map<string, Set<string>>();
    for (const key of combinedKeys) {
      const [userId, weekStart] = key.split(':');
      if (!weekToUsers.has(weekStart)) weekToUsers.set(weekStart, new Set());
      weekToUsers.get(weekStart)!.add(userId);
    }

    const scheduledMap = new Map<string, number>();
    const holidayDaysMap = new Map<string, number>();
    const sicknessDaysMap = new Map<string, number>();

    for (const [weekStart, users] of weekToUsers) {
      const userIds = [...users];
      if (!userIds.length) continue;
      const { startIso, endIso } = weekBounds(weekStart);
      const [rotaRes, leaveRes, sickRes] = await Promise.all([
        supabase
          .from('rota_shifts')
          .select('user_id, start_time, end_time')
          .eq('org_id', orgId)
          .in('user_id', userIds)
          .lt('start_time', endIso)
          .gt('end_time', startIso),
        supabase
          .from('leave_requests')
          .select('requester_id, days_approved')
          .eq('org_id', orgId)
          .eq('status', 'approved')
          .in('requester_id', userIds)
          .lte('start_date', endIso.slice(0, 10))
          .gte('end_date', startIso.slice(0, 10)),
        supabase
          .from('sickness_absences')
          .select('user_id, start_date, end_date')
          .eq('org_id', orgId)
          .in('user_id', userIds)
          .is('voided_at', null)
          .lte('start_date', endIso.slice(0, 10))
          .gte('end_date', startIso.slice(0, 10)),
      ]);

      for (const shift of (rotaRes.data as { user_id: string | null; start_time: string; end_time: string }[] | null) ?? []) {
        if (!shift.user_id) continue;
        const mins = Math.max(0, (new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) / 60000);
        const key = `${shift.user_id}:${weekStart}`;
        scheduledMap.set(key, (scheduledMap.get(key) ?? 0) + mins / 60);
      }
      for (const l of (leaveRes.data as { requester_id: string | null; days_approved: number | null }[] | null) ?? []) {
        if (!l.requester_id) continue;
        const key = `${l.requester_id}:${weekStart}`;
        holidayDaysMap.set(key, (holidayDaysMap.get(key) ?? 0) + Number(l.days_approved ?? 0));
      }
      for (const s of (sickRes.data as { user_id: string; start_date: string; end_date: string }[] | null) ?? []) {
        const start = new Date(`${s.start_date}T00:00:00Z`);
        const end = new Date(`${s.end_date}T00:00:00Z`);
        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        const key = `${s.user_id}:${weekStart}`;
        sicknessDaysMap.set(key, (sicknessDaysMap.get(key) ?? 0) + days);
      }
    }

    const nameById = new Map(allPeople.map((p) => [p.id, p.full_name ?? p.id]));
    const rowList: FinanceRow[] = [...combinedKeys].map((key) => {
      const [userId, weekStart] = key.split(':');
      const ts = timesheets.find((t) => t.user_id === userId && t.week_start_date === weekStart);
      const lineItems = wages.filter((w) => w.user_id === userId && w.week_start_date === weekStart);
      const basePay = lineItems.filter((w) => w.line_type === 'basic_pay').reduce((sum, w) => sum + Number(w.amount_gbp ?? 0), 0);
      const ssp = lineItems.filter((w) => w.line_type === 'ssp').reduce((sum, w) => sum + Number(w.amount_gbp ?? 0), 0);
      const adjustment = adjustments
        .filter((a) => a.user_id === userId && a.week_start_date === weekStart)
        .reduce((sum, a) => sum + Number(a.amount_gbp ?? 0), 0);
      const actualMinutes = Number(ts?.approved_total_minutes ?? ts?.reported_total_minutes ?? 0);
      const actualHours = actualMinutes / 60;
      const scheduledHours = Number((scheduledMap.get(key) ?? 0).toFixed(2));
      const overtimeHours = Math.max(0, actualHours - 40);
      const varianceVsSchedule = actualHours - scheduledHours;
      const payRole = profileMap[userId] ?? (nameById.get(userId)?.toLowerCase().includes('manager') ? 'dm' : 'csa');
      const projectedGross = basePay > 0 ? basePay + ssp + adjustment : actualHours * (latestRate[payRole] ?? 0) + ssp + adjustment;
      const payFrequency = payFrequencyMap[userId] ?? 'weekly';
      return {
        userId,
        name: nameById.get(userId) ?? userId,
        payFrequency,
        weekStart,
        actualHours,
        scheduledHours,
        holidayDays: holidayDaysMap.get(key) ?? 0,
        sicknessDays: sicknessDaysMap.get(key) ?? 0,
        overtimeHours,
        basePay,
        ssp,
        adjustments: adjustment,
        projectedGross,
        varianceVsSchedule,
      };
    });

    rowList.sort((a, b) => (a.weekStart === b.weekStart ? a.name.localeCompare(b.name) : b.weekStart.localeCompare(a.weekStart)));
    setRows(rowList);
  }, [orgId, supabase, weekFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`finance-live-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_timesheets', filter: `org_id=eq.${orgId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagesheet_lines', filter: `org_id=eq.${orgId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_manual_adjustments', filter: `org_id=eq.${orgId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, orgId, supabase]);

  async function saveRate(role: 'csa' | 'dm') {
    const value = Number(role === 'csa' ? rateInputs.csa : rateInputs.dm);
    if (!Number.isFinite(value) || value < 0 || !rateInputs.effectiveFrom) {
      setErr('Enter a valid rate and effective date.');
      return;
    }
    setErr(null);
    const { error } = await supabase.from('payroll_role_hourly_rates').insert({
      org_id: orgId,
      role_code: role,
      effective_from: rateInputs.effectiveFrom,
      hourly_rate_gbp: value,
      created_by: null,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  }

  async function saveAdjustment() {
    if (!adjustUserId || !adjustWeek || adjustAmount.trim() === '') {
      setErr('Choose employee, week start, and override amount.');
      return;
    }
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount)) {
      setErr('Override amount must be a number.');
      return;
    }
    const { error } = await supabase.from('payroll_manual_adjustments').upsert(
      {
        org_id: orgId,
        user_id: adjustUserId,
        week_start_date: adjustWeek,
        adjustment_code: 'manual_override',
        amount_gbp: amount,
        note: adjustNote.trim() || null,
        is_override: true,
      },
      { onConflict: 'org_id,user_id,week_start_date,adjustment_code' },
    );
    if (error) {
      setErr(error.message);
      return;
    }
    setAdjustAmount('');
    setAdjustNote('');
    await load();
  }

  async function setPayRole(userId: string, payRole: 'csa' | 'dm') {
    const { error } = await supabase.from('payroll_employee_pay_profiles').upsert(
      {
        org_id: orgId,
        user_id: userId,
        pay_role: payRole,
      },
      { onConflict: 'org_id,user_id' },
    );
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  }

  function exportCsv() {
    const header = [
      'employee',
      'week_start',
      'actual_hours',
      'scheduled_hours',
      'holiday_days',
      'sickness_days',
      'overtime_hours',
      'base_pay_gbp',
      'ssp_gbp',
      'manual_adjustment_gbp',
      'projected_gross_gbp',
      'variance_vs_schedule_hours',
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const body = rows.map((r) =>
      [
        r.name,
        r.weekStart,
        r.actualHours.toFixed(2),
        r.scheduledHours.toFixed(2),
        r.holidayDays,
        r.sicknessDays,
        r.overtimeHours.toFixed(2),
        r.basePay.toFixed(2),
        r.ssp.toFixed(2),
        r.adjustments.toFixed(2),
        r.projectedGross.toFixed(2),
        r.varianceVsSchedule.toFixed(2),
      ]
        .map(esc)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-wagesheets-${orgId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportXlsx() {
    const params = new URLSearchParams();
    if (weekFilter) params.set('weekStart', weekFilter);
    if (monthFilter) params.set('month', monthFilter);
    const res = await fetch(`/api/payroll/wagesheets/export-xlsx?${params.toString()}`, { method: 'GET' });
    if (!res.ok) {
      setErr('Excel export failed.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-wagesheets-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visibleRows = useMemo(() => {
    if (!monthFilter) return rows;
    const [yearStr, monthStr] = monthFilter.split('-');
    const y = Number(yearStr);
    const m = Number(monthStr);
    if (!y || !m) return rows;
    return rows.filter((r) => {
      const d = new Date(`${r.weekStart}T00:00:00Z`);
      return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m;
    });
  }, [monthFilter, rows]);

  const monthlyTotals = useMemo(() => {
    return visibleRows.reduce(
      (acc, r) => {
        acc.gross += r.projectedGross;
        acc.ssp += r.ssp;
        acc.overrides += r.adjustments;
        return acc;
      },
      { gross: 0, ssp: 0, overrides: 0 },
    );
  }, [visibleRows]);

  const weeklyTotals = useMemo(() => {
    return visibleRows.reduce(
      (acc, r) => {
        acc.gross += r.projectedGross;
        acc.ssp += r.ssp;
        acc.overrides += r.adjustments;
        acc.overtimeHours += r.overtimeHours;
        return acc;
      },
      { gross: 0, ssp: 0, overrides: 0, overtimeHours: 0 },
    );
  }, [visibleRows]);

  const frequencyTotals = useMemo(() => {
    const initial = {
      weekly: { gross: 0, ssp: 0, overrides: 0, overtimeHours: 0 },
      four_weekly: { gross: 0, ssp: 0, overrides: 0, overtimeHours: 0 },
      monthly: { gross: 0, ssp: 0, overrides: 0, overtimeHours: 0 },
    };
    for (const r of visibleRows) {
      const bucket = initial[r.payFrequency];
      bucket.gross += r.projectedGross;
      bucket.ssp += r.ssp;
      bucket.overrides += r.adjustments;
      bucket.overtimeHours += r.overtimeHours;
    }
    return initial;
  }, [visibleRows]);

  return (
    <div className="space-y-8 font-sans text-[#121212]">
      {err ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">{err}</p> : null}

      <section className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <label className="text-[12px] font-semibold text-[#6b6b6b]">
            Week start
            <input
              type="date"
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] lg:mt-0 lg:min-w-[12rem]"
            />
          </label>
          <label className="text-[12px] font-semibold text-[#6b6b6b]">
            Month
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] lg:mt-0 lg:min-w-[10rem]"
            />
          </label>
          <button type="button" onClick={() => void load()} className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[12.5px] sm:w-auto">
            Refresh
          </button>
          <button type="button" onClick={exportCsv} className="w-full rounded-lg bg-[#121212] px-3 py-2 text-[12.5px] text-white sm:w-auto">
            Export CSV
          </button>
          <button type="button" onClick={() => void exportXlsx()} className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[12.5px] sm:w-auto">
            Export Excel
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-[#6b6b6b]">
          Live wage sheet uses timesheets, rota, leave, sickness, SSP, and manual overrides so finance can review total pay at a glance.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Total gross</p>
          <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">£{monthlyTotals.gross.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">SSP total</p>
          <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">£{monthlyTotals.ssp.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Overrides total</p>
          <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">£{monthlyTotals.overrides.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Overtime hours</p>
          <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">{weeklyTotals.overtimeHours.toFixed(2)}</p>
        </div>
      </section>

      <section className="rounded-xl border border-[#e8e8e8] bg-white p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Pay frequency totals</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[#d8d8d8] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Weekly payroll</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums">£{frequencyTotals.weekly.gross.toFixed(2)}</p>
            <p className="mt-1 text-[12px] text-[#6b6b6b]">SSP £{frequencyTotals.weekly.ssp.toFixed(2)} · Overrides £{frequencyTotals.weekly.overrides.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-[#d8d8d8] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Four-weekly payroll</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums">£{frequencyTotals.four_weekly.gross.toFixed(2)}</p>
            <p className="mt-1 text-[12px] text-[#6b6b6b]">SSP £{frequencyTotals.four_weekly.ssp.toFixed(2)} · Overrides £{frequencyTotals.four_weekly.overrides.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-[#d8d8d8] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Monthly payroll</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums">£{frequencyTotals.monthly.gross.toFixed(2)}</p>
            <p className="mt-1 text-[12px] text-[#6b6b6b]">SSP £{frequencyTotals.monthly.ssp.toFixed(2)} · Overrides £{frequencyTotals.monthly.overrides.toFixed(2)}</p>
          </div>
        </div>
      </section>

      {weekFilter ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Weekly gross</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">£{weeklyTotals.gross.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Weekly SSP</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">£{weeklyTotals.ssp.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Weekly overrides</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">£{weeklyTotals.overrides.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Weekly overtime hours</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums text-[#121212] sm:text-[30px]">{weeklyTotals.overtimeHours.toFixed(2)}</p>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Pay elements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              CSA hourly rate
              <input
                type="number"
                min={0}
                step="0.01"
                value={rateInputs.csa}
                onChange={(e) => setRateInputs((prev) => ({ ...prev, csa: e.target.value }))}
                placeholder={rates.csa ? String(rates.csa) : '0.00'}
                className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]"
              />
            </label>
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              Duty Manager hourly rate
              <input
                type="number"
                min={0}
                step="0.01"
                value={rateInputs.dm}
                onChange={(e) => setRateInputs((prev) => ({ ...prev, dm: e.target.value }))}
                placeholder={rates.dm ? String(rates.dm) : '0.00'}
                className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]"
              />
            </label>
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              Effective from
              <input
                type="date"
                value={rateInputs.effectiveFrom}
                onChange={(e) => setRateInputs((prev) => ({ ...prev, effectiveFrom: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]"
              />
            </label>
          </div>
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <button type="button" onClick={() => void saveRate('csa')} className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[12.5px] sm:w-auto">
              Save CSA rate version
            </button>
            <button type="button" onClick={() => void saveRate('dm')} className="w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[12.5px] sm:w-auto">
              Save DM rate version
            </button>
          </div>
          <p className="mt-2 text-[12px] text-[#6b6b6b]">Rate versions are timestamped by effective date, so historical periods remain intact.</p>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-4 sm:p-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Manual overrides</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              Employee
              <select value={adjustUserId} onChange={(e) => setAdjustUserId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#d8d8d8] bg-white px-3 py-2 text-[14px]">
                <option value="">Select</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              Week start
              <input type="date" value={adjustWeek} onChange={(e) => setAdjustWeek(e.target.value)} className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]" />
            </label>
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              Override amount (GBP)
              <input type="number" step="0.01" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]" />
            </label>
            <label className="text-[12px] font-semibold text-[#6b6b6b]">
              Reason
              <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]" />
            </label>
          </div>
          <button type="button" onClick={() => void saveAdjustment()} className="mt-3 w-full rounded-lg bg-[#121212] px-3 py-2 text-[12.5px] text-white sm:w-auto">
            Save override
          </button>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="grid gap-3 sm:hidden">
          {visibleRows.length === 0 ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-6 text-center text-[13px] text-[#6b6b6b]">
              No finance rows yet. Approve timesheets or clear week filter.
            </div>
          ) : (
            visibleRows.map((r) => {
              const role = profiles[r.userId] ?? 'csa';
              return (
                <article key={`${r.userId}:${r.weekStart}`} className="rounded-xl border border-[#e8e8e8] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-[#121212]">{r.name}</p>
                      <p className="mt-1 text-[12px] text-[#6b6b6b]">{r.weekStart}</p>
                    </div>
                    {canManage ? (
                      <select
                        value={role}
                        onChange={(e) => void setPayRole(r.userId, e.target.value as 'csa' | 'dm')}
                        className="rounded border border-[#d8d8d8] bg-white px-2 py-1 text-[12px]"
                      >
                        <option value="csa">CSA</option>
                        <option value="dm">DM</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-[#f4f4f4] px-2 py-1 text-[11px] uppercase tracking-wide text-[#6b6b6b]">{role}</span>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                    <div>
                      <dt className="text-[#9b9b9b]">Actual hrs</dt>
                      <dd className="font-medium tabular-nums">{r.actualHours.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">Scheduled hrs</dt>
                      <dd className="font-medium tabular-nums">{r.scheduledHours.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">Holiday days</dt>
                      <dd className="font-medium tabular-nums">{r.holidayDays.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">Absence days</dt>
                      <dd className="font-medium tabular-nums">{r.sicknessDays.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">Overtime hrs</dt>
                      <dd className="font-medium tabular-nums">{r.overtimeHours.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">Base pay</dt>
                      <dd className="font-medium tabular-nums">£{r.basePay.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">SSP</dt>
                      <dd className="font-medium tabular-nums">£{r.ssp.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#9b9b9b]">Manual adj</dt>
                      <dd className="font-medium tabular-nums">£{r.adjustments.toFixed(2)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 border-t border-[#f0f0f0] pt-2 text-[13px] font-semibold tabular-nums text-[#121212]">
                    Projected gross: £{r.projectedGross.toFixed(2)}
                  </p>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white sm:block">
          <table className="w-full min-w-[1280px] text-left text-[13px]">
            <thead className="border-b border-[#e8e4dc] bg-[#faf9f6] text-[11px] uppercase tracking-wide text-[#9b9b9b]">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Pay freq</th>
                <th className="px-3 py-2">Pay role</th>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Actual hrs</th>
                <th className="px-3 py-2">Scheduled hrs</th>
                <th className="px-3 py-2">Holiday days</th>
                <th className="px-3 py-2">Absence days</th>
                <th className="px-3 py-2">Overtime hrs</th>
                <th className="px-3 py-2">Base pay</th>
                <th className="px-3 py-2">SSP</th>
                <th className="px-3 py-2">Manual adj</th>
                <th className="px-3 py-2">Projected gross</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-[#6b6b6b]">
                    No finance rows yet. Approve timesheets or clear week filter.
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => {
                  const role = profiles[r.userId] ?? 'csa';
                  return (
                    <tr key={`${r.userId}:${r.weekStart}`} className="border-b border-[#f0f0f0]">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 capitalize">{r.payFrequency.replace('_', ' ')}</td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <select
                            value={role}
                            onChange={(e) => void setPayRole(r.userId, e.target.value as 'csa' | 'dm')}
                            className="rounded border border-[#d8d8d8] bg-white px-2 py-1 text-[12px]"
                          >
                            <option value="csa">CSA</option>
                            <option value="dm">DM</option>
                          </select>
                        ) : (
                          <span className="uppercase">{role}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.weekStart}</td>
                      <td className="px-3 py-2 tabular-nums">{r.actualHours.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.scheduledHours.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.holidayDays.toFixed(1)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.sicknessDays.toFixed(1)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.overtimeHours.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">£{r.basePay.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">£{r.ssp.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">£{r.adjustments.toFixed(2)}</td>
                      <td className="px-3 py-2 font-medium tabular-nums">£{r.projectedGross.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
