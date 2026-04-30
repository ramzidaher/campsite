'use client';

import { currentLeaveYearKey } from '@/lib/datetime';
import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Member = { id: string; full_name: string; email: string | null };
type HolidayPeriod = {
  id: string;
  name: string;
  holiday_kind: 'bank_holiday' | 'public_holiday' | 'org_break' | 'custom';
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const ISO_WEEKDAY_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export function OrgLeaveAdminClient({
  orgId,
  members,
  initialSettings,
}: {
  orgId: string;
  members: Member[];
  initialSettings: {
    bradford_window_days: number;
    leave_year_start_month: number;
    leave_year_start_day: number;
    approved_request_change_window_hours: number;
    default_annual_entitlement_days: number | null;
    leave_use_working_days: boolean;
    non_working_iso_dows: number[];
    use_uk_weekly_paid_leave_formula: boolean;
    statutory_weeks_annual_leave: number;
    ssp_flat_weekly_rate_gbp: number;
    ssp_lel_weekly_gbp: number | null;
    ssp_waiting_qualifying_days: number;
    ssp_reform_percent_of_earnings: number;
    carry_over_enabled: boolean;
    carry_over_requires_approval: boolean;
    carry_over_max_days: number;
    encashment_enabled: boolean;
    encashment_requires_approval: boolean;
    encashment_max_days: number;
    leave_accrual_enabled: boolean;
    leave_accrual_frequency: string;
    leave_law_country_code: string;
    leave_law_profile: string;
  } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [year, setYear] = useState(() =>
    currentLeaveYearKey(
      new Date(),
      initialSettings?.leave_year_start_month ?? 1,
      initialSettings?.leave_year_start_day ?? 1,
    ),
  );
  const [targetId, setTargetId] = useState(members[0]?.id ?? '');
  const [annual, setAnnual] = useState('25');
  const [toil, setToil] = useState('0');
  const [bradfordDays, setBradfordDays] = useState(String(initialSettings?.bradford_window_days ?? 365));
  const [lyM, setLyM] = useState(String(initialSettings?.leave_year_start_month ?? 1));
  const [lyD, setLyD] = useState(String(initialSettings?.leave_year_start_day ?? 1));
  const [changeWindowHours, setChangeWindowHours] = useState(String(initialSettings?.approved_request_change_window_hours ?? 48));
  const [defaultOrgAnnual, setDefaultOrgAnnual] = useState(
    initialSettings?.default_annual_entitlement_days != null
      ? String(initialSettings.default_annual_entitlement_days)
      : '',
  );
  const [removeOrgDefaultAnnual, setRemoveOrgDefaultAnnual] = useState(false);
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [leaveUseWorkingDays, setLeaveUseWorkingDays] = useState(
    initialSettings?.leave_use_working_days ?? false,
  );
  const [nonWorkingDows, setNonWorkingDows] = useState<number[]>(
    initialSettings?.non_working_iso_dows?.length
      ? [...initialSettings.non_working_iso_dows].sort((a, b) => a - b)
      : [6, 7],
  );
  const [useUkWeeklyPaid, setUseUkWeeklyPaid] = useState(
    initialSettings?.use_uk_weekly_paid_leave_formula ?? false,
  );
  const [statutoryWeeks, setStatutoryWeeks] = useState(
    String(initialSettings?.statutory_weeks_annual_leave ?? 5.6),
  );
  const [sspFlat, setSspFlat] = useState(String(initialSettings?.ssp_flat_weekly_rate_gbp ?? 123.25));
  const [sspLel, setSspLel] = useState(
    initialSettings?.ssp_lel_weekly_gbp != null ? String(initialSettings.ssp_lel_weekly_gbp) : '',
  );
  const [clearSspLel, setClearSspLel] = useState(false);
  const [sspWaiting, setSspWaiting] = useState(String(initialSettings?.ssp_waiting_qualifying_days ?? 0));
  const [sspPct, setSspPct] = useState(String(initialSettings?.ssp_reform_percent_of_earnings ?? 0.8));
  const [carryOverEnabled, setCarryOverEnabled] = useState(initialSettings?.carry_over_enabled ?? false);
  const [carryOverRequiresApproval, setCarryOverRequiresApproval] = useState(initialSettings?.carry_over_requires_approval ?? true);
  const [carryOverMaxDays, setCarryOverMaxDays] = useState(String(initialSettings?.carry_over_max_days ?? 0));
  const [encashmentEnabled, setEncashmentEnabled] = useState(initialSettings?.encashment_enabled ?? false);
  const [encashmentRequiresApproval, setEncashmentRequiresApproval] = useState(initialSettings?.encashment_requires_approval ?? true);
  const [encashmentMaxDays, setEncashmentMaxDays] = useState(String(initialSettings?.encashment_max_days ?? 0));
  const [leaveAccrualEnabled, setLeaveAccrualEnabled] = useState(initialSettings?.leave_accrual_enabled ?? false);
  const [leaveAccrualFrequency, setLeaveAccrualFrequency] = useState(initialSettings?.leave_accrual_frequency ?? 'monthly');
  const [leaveLawCountryCode, setLeaveLawCountryCode] = useState(initialSettings?.leave_law_country_code ?? 'GB');
  const [leaveLawProfile, setLeaveLawProfile] = useState(initialSettings?.leave_law_profile ?? 'uk');
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<'ok' | 'err'>('ok');
  const [busy, setBusy] = useState(false);
  const [holidayPeriods, setHolidayPeriods] = useState<HolidayPeriod[]>([]);
  const [holidayName, setHolidayName] = useState('');
  const [holidayKind, setHolidayKind] = useState<HolidayPeriod['holiday_kind']>('custom');
  const [holidayStart, setHolidayStart] = useState('');
  const [holidayEnd, setHolidayEnd] = useState('');

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const base = [cy - 1, cy, cy + 1];
    const yNum = Number(year);
    if (Number.isFinite(yNum) && !base.includes(yNum)) {
      base.push(yNum);
      base.sort((a, b) => a - b);
    }
    return base.map(String);
  }, [year]);

  const loadRow = useCallback(async () => {
    if (!targetId) return;
    const { data } = await supabase
      .from('leave_allowances')
      .select('annual_entitlement_days, toil_balance_days')
      .eq('org_id', orgId)
      .eq('user_id', targetId)
      .eq('leave_year', year)
      .maybeSingle();
    if (data) {
      setAnnual(String(data.annual_entitlement_days ?? 0));
      setToil(String(data.toil_balance_days ?? 0));
    } else {
      setAnnual('0');
      setToil('0');
    }
  }, [supabase, orgId, targetId, year]);

  const loadHolidayPeriods = useCallback(async () => {
    const { data } = await supabase
      .from('org_leave_holiday_periods')
      .select('id, name, holiday_kind, start_date, end_date, is_active')
      .eq('org_id', orgId)
      .order('start_date', { ascending: true })
      .limit(200);
    setHolidayPeriods((data ?? []) as HolidayPeriod[]);
  }, [supabase, orgId]);

  useEffect(() => { void loadRow(); }, [loadRow]);
  useEffect(() => { void loadHolidayPeriods(); }, [loadHolidayPeriods]);
  useShellRefresh(() => {
    void loadRow();
    void loadHolidayPeriods();
  });

  function flash(text: string, kind: 'ok' | 'err' = 'ok') {
    setMsg(text);
    setMsgKind(kind);
  }

  const invalidateLeaveAttendanceCaches = useCallback(async () => {
    await invalidateClientCaches({ scopes: ['leave-attendance'] });
  }, []);

  async function saveAllowance(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('leave_allowance_upsert', {
      p_target_user_id: targetId,
      p_leave_year: year,
      p_annual_entitlement_days: Number(annual),
      p_toil_balance_days: Number(toil),
    });
    setBusy(false);
    if (error) flash(error.message, 'err');
    else {
      await invalidateLeaveAttendanceCaches().catch(() => null);
      flash('Allowance saved.');
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (leaveUseWorkingDays && nonWorkingDows.length >= 7) {
      flash('At least one weekday must count as a working day (not all seven can be non-working).', 'err');
      return;
    }
    setBusy(true);
    setMsg(null);
    const payload: {
      p_bradford_window_days: number;
      p_leave_year_start_month: number;
      p_leave_year_start_day: number;
      p_approved_request_change_window_hours: number;
      p_default_annual_entitlement_days?: number;
      p_clear_default_annual_entitlement?: boolean;
      p_leave_use_working_days: boolean;
      p_non_working_iso_dows: number[];
      p_use_uk_weekly_paid_leave_formula: boolean;
      p_statutory_weeks_annual_leave: number;
      p_ssp_flat_weekly_rate_gbp: number;
      p_ssp_lel_weekly_gbp?: number | null;
      p_clear_ssp_lel?: boolean;
      p_ssp_waiting_qualifying_days: number;
      p_ssp_reform_percent_of_earnings: number;
      p_carry_over_enabled: boolean;
      p_carry_over_requires_approval: boolean;
      p_carry_over_max_days: number;
      p_encashment_enabled: boolean;
      p_encashment_requires_approval: boolean;
      p_encashment_max_days: number;
      p_leave_accrual_enabled: boolean;
      p_leave_accrual_frequency: string;
      p_leave_law_country_code: string;
      p_leave_law_profile: string;
    } = {
      p_bradford_window_days: Number(bradfordDays),
      p_leave_year_start_month: Number(lyM),
      p_leave_year_start_day: Number(lyD),
      p_approved_request_change_window_hours: Number(changeWindowHours),
      p_leave_use_working_days: leaveUseWorkingDays,
      p_non_working_iso_dows: nonWorkingDows,
      p_use_uk_weekly_paid_leave_formula: useUkWeeklyPaid,
      p_statutory_weeks_annual_leave: Number(statutoryWeeks),
      p_ssp_flat_weekly_rate_gbp: Number(sspFlat),
      p_ssp_waiting_qualifying_days: Number(sspWaiting),
      p_ssp_reform_percent_of_earnings: Number(sspPct),
      p_carry_over_enabled: carryOverEnabled,
      p_carry_over_requires_approval: carryOverRequiresApproval,
      p_carry_over_max_days: Number(carryOverMaxDays),
      p_encashment_enabled: encashmentEnabled,
      p_encashment_requires_approval: encashmentRequiresApproval,
      p_encashment_max_days: Number(encashmentMaxDays),
      p_leave_accrual_enabled: leaveAccrualEnabled,
      p_leave_accrual_frequency: leaveAccrualFrequency,
      p_leave_law_country_code: leaveLawCountryCode.trim().toUpperCase(),
      p_leave_law_profile: leaveLawProfile,
    };
    if (clearSspLel) {
      payload.p_clear_ssp_lel = true;
    } else if (sspLel.trim() !== '') {
      payload.p_ssp_lel_weekly_gbp = Number(sspLel);
    }
    if (removeOrgDefaultAnnual) {
      payload.p_clear_default_annual_entitlement = true;
    } else if (defaultOrgAnnual.trim() !== '') {
      payload.p_default_annual_entitlement_days = Number(defaultOrgAnnual);
    }
    const { error } = await supabase.rpc('org_leave_settings_upsert', payload);
    setBusy(false);
    if (error) flash(error.message, 'err');
    else {
      await invalidateLeaveAttendanceCaches().catch(() => null);
      if (removeOrgDefaultAnnual) {
        setDefaultOrgAnnual('');
        setRemoveOrgDefaultAnnual(false);
      }
      flash('Settings saved.');
    }
  }

  async function bulkApplyOrgDefault() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('leave_allowance_bulk_apply_org_default', {
      p_leave_year: year,
      p_overwrite_existing: bulkOverwrite,
    });
    setBusy(false);
    if (error) flash(error.message, 'err');
    else {
      await invalidateLeaveAttendanceCaches().catch(() => null);
      flash(`Applied default to ${typeof data === 'number' ? data : 0} people for ${year}.`);
    }
  }

  async function addHolidayPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!holidayName.trim() || !holidayStart || !holidayEnd) return;
    if (holidayEnd < holidayStart) {
      flash('Holiday end date must be on or after start date.', 'err');
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('org_leave_holiday_periods').insert({
      org_id: orgId,
      name: holidayName.trim(),
      holiday_kind: holidayKind,
      start_date: holidayStart,
      end_date: holidayEnd,
      is_active: true,
    });
    setBusy(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    setHolidayName('');
    setHolidayKind('custom');
    setHolidayStart('');
    setHolidayEnd('');
    await loadHolidayPeriods();
    await invalidateLeaveAttendanceCaches().catch(() => null);
    flash('Holiday period added.');
  }

  async function toggleHolidayPeriod(id: string, nextActive: boolean) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('org_leave_holiday_periods')
      .update({ is_active: nextActive })
      .eq('org_id', orgId)
      .eq('id', id);
    setBusy(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    await loadHolidayPeriods();
    await invalidateLeaveAttendanceCaches().catch(() => null);
    flash(nextActive ? 'Holiday period enabled.' : 'Holiday period disabled.');
  }

  async function deleteHolidayPeriod(id: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('org_leave_holiday_periods')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id);
    setBusy(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    await loadHolidayPeriods();
    await invalidateLeaveAttendanceCaches().catch(() => null);
    flash('Holiday period removed.');
  }

  const selectedMember = members.find((m) => m.id === targetId);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <Link href="/leave" className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          ← Back to time off
        </Link>
        <h1 className="mt-3 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Leave settings
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Set each person&apos;s leave allowance and configure organisation-wide leave rules.
        </p>
      </div>

      {msg ? (
        <p className={`mb-4 rounded-lg border px-3 py-2 text-[13px] ${msgKind === 'err' ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]' : 'border-[#d8d8d8] bg-[#f5f4f1] text-[#121212]'}`}>
          {msg}
        </p>
      ) : null}

      {/* Allowances */}
      <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">Leave allowances</h2>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          Set how many days of annual leave and time off in lieu (TOIL) each person gets for a given year.
        </p>
        <form className="mt-4 space-y-4" onSubmit={(e) => void saveAllowance(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Team member
              <select
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}{m.email ? ` — ${m.email}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Leave year
              <select
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>

          {selectedMember ? (
            <p className="text-[12px] text-[#6b6b6b]">
              Setting allowance for <strong>{selectedMember.full_name}</strong> in <strong>{year}</strong>.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Annual leave entitlement (days)
              <input
                type="number"
                min={0}
                step="0.5"
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
              />
              <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">
                Enter full-year entitlement (e.g. 25). Save auto pro-rates by employment start date and leave-year settings.
                {leaveUseWorkingDays ? ' Entitlement is in working days (same as booking).' : ''}
              </span>
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Time off in lieu (TOIL) balance (days)
              <input
                type="number"
                min={0}
                step="0.5"
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={toil}
                onChange={(e) => setToil(e.target.value)}
              />
              <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">Decreases when TOIL leave is approved</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || !targetId}
            className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save allowance'}
          </button>
        </form>
      </section>

      {/* Org settings */}
      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">Organisation settings</h2>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          These settings apply to everyone in your organisation.
        </p>
        <form className="mt-4 space-y-5" onSubmit={(e) => void saveSettings(e)}>
          <div>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Sickness look-back period (days)
              <input
                type="number"
                min={1}
                max={3660}
                className="mt-1 w-full max-w-[200px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={bradfordDays}
                onChange={(e) => setBradfordDays(e.target.value)}
              />
            </label>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              How many days back to count when calculating sickness absence scores. 365 = last 12 months (recommended).
            </p>
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Approved request change window (hours)
              <input
                type="number"
                min={1}
                max={720}
                className="mt-1 w-full max-w-[240px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={changeWindowHours}
                onChange={(e) => setChangeWindowHours(e.target.value)}
              />
            </label>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              How long after approval a user can request an edit or cancellation that still requires manager approval.
            </p>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={leaveUseWorkingDays}
                onChange={(e) => setLeaveUseWorkingDays(e.target.checked)}
              />
              <span>
                Count annual leave and TOIL using working days only
                <span className="mt-1 block text-[11px] font-normal text-[#9b9b9b]">
                  Weekends and any weekday you mark below do not deduct from leave. Typical for UK-style &quot;days per year&quot; entitlement.
                </span>
              </span>
            </label>
            {leaveUseWorkingDays ? (
              <div className="mt-3">
                <p className="text-[11.5px] font-medium text-[#6b6b6b]">Non-working weekdays (no leave deduction)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([1, 2, 3, 4, 5, 6, 7] as const).map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() =>
                        setNonWorkingDows((prev) =>
                          prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso].sort((a, b) => a - b),
                        )
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium ${
                        nonWorkingDows.includes(iso)
                          ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
                          : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:border-[#121212]'
                      }`}
                    >
                      {ISO_WEEKDAY_SHORT[iso]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-[#9b9b9b]">Highlighted = excluded from leave (default Sat–Sun).</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">Public / bank holiday calendar</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Add organisation-specific holiday timelines (for example longer university Christmas breaks). These dates are auto-excluded from leave day deduction.
            </p>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void addHolidayPeriod(e)}>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                Name
                <input
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="e.g. Christmas closure"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Type
                <select
                  value={holidayKind}
                  onChange={(e) => setHolidayKind(e.target.value as HolidayPeriod['holiday_kind'])}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                >
                  <option value="bank_holiday">Bank holiday</option>
                  <option value="public_holiday">Public holiday</option>
                  <option value="org_break">Organisation break</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <div />
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Start date
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={holidayStart}
                  onChange={(e) => setHolidayStart(e.target.value)}
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                End date
                <input
                  type="date"
                  required
                  min={holidayStart || undefined}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={holidayEnd}
                  onChange={(e) => setHolidayEnd(e.target.value)}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy || !holidayName.trim() || !holidayStart || !holidayEnd}
                  className="rounded-lg border border-[#121212] bg-white px-4 py-2 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1] disabled:opacity-50"
                >
                  {busy ? 'Adding…' : 'Add holiday period'}
                </button>
              </div>
            </form>
            <div className="mt-4 space-y-2">
              {holidayPeriods.length === 0 ? (
                <p className="text-[11px] text-[#9b9b9b]">No holiday periods configured yet.</p>
              ) : (
                holidayPeriods.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2">
                    <div>
                      <p className="text-[12.5px] font-medium text-[#121212]">{h.name}</p>
                      <p className="text-[11px] text-[#6b6b6b]">
                        {h.holiday_kind.replace('_', ' ')} · {h.start_date} to {h.end_date} · {h.is_active ? 'Active' : 'Disabled'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleHolidayPeriod(h.id, !h.is_active)}
                        className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] text-[#6b6b6b] hover:bg-[#f5f4f1] disabled:opacity-50"
                      >
                        {h.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteHolidayPeriod(h.id)}
                        className="rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-[12px] text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">Carry-over requests</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Allow staff to request carry-over of unused annual leave into next leave year. Requests are reviewed case by case.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={carryOverEnabled}
                onChange={(e) => setCarryOverEnabled(e.target.checked)}
              />
              <span>Enable carry-over requests</span>
            </label>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={carryOverRequiresApproval}
                disabled={!carryOverEnabled}
                onChange={(e) => setCarryOverRequiresApproval(e.target.checked)}
              />
              <span>Require manager/admin approval for each request</span>
            </label>
            <label className="mt-3 block text-[12.5px] font-medium text-[#6b6b6b]">
              Max carry-over per request (days)
              <input
                type="number"
                min={0}
                step="0.5"
                disabled={!carryOverEnabled}
                className="mt-1 w-full max-w-[180px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] disabled:opacity-50"
                value={carryOverMaxDays}
                onChange={(e) => setCarryOverMaxDays(e.target.value)}
              />
            </label>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">Leave encashment (unused leave payout)</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Allow staff to request encashment of unused annual leave. Requests are processed case by case.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={encashmentEnabled}
                onChange={(e) => setEncashmentEnabled(e.target.checked)}
              />
              <span>Enable leave encashment requests</span>
            </label>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={encashmentRequiresApproval}
                disabled={!encashmentEnabled}
                onChange={(e) => setEncashmentRequiresApproval(e.target.checked)}
              />
              <span>Require manager/admin approval for each encashment</span>
            </label>
            <label className="mt-3 block text-[12.5px] font-medium text-[#6b6b6b]">
              Max encashment per request (days)
              <input
                type="number"
                min={0}
                step="0.5"
                disabled={!encashmentEnabled}
                className="mt-1 w-full max-w-[180px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] disabled:opacity-50"
                value={encashmentMaxDays}
                onChange={(e) => setEncashmentMaxDays(e.target.value)}
              />
            </label>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">UK weekly paid — statutory annual leave</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              When enabled, people with pay frequency &quot;weekly&quot; on their HR record use statutory weeks × contracted working days per week as the full-year entitlement (before employment-start pro-rating).
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={useUkWeeklyPaid}
                onChange={(e) => setUseUkWeeklyPaid(e.target.checked)}
              />
              <span>Use statutory formula for weekly paid staff</span>
            </label>
            <label className="mt-3 block text-[12.5px] font-medium text-[#6b6b6b]">
              Statutory weeks (default 5.6)
              <input
                type="number"
                min={1}
                max={10}
                step="0.1"
                className="mt-1 w-full max-w-[160px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                value={statutoryWeeks}
                onChange={(e) => setStatutoryWeeks(e.target.value)}
              />
            </label>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">Statutory Sick Pay (SSP) — estimates</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Rates feed the SSP summary on the time-off hub. April 2026 reform: min(flat, % of AWE), no LEL by default. Set LEL only for legacy payroll comparisons.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Flat weekly SSP (£)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={sspFlat}
                  onChange={(e) => setSspFlat(e.target.value)}
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                % of AWE (reform)
                <input
                  type="number"
                  min={0.1}
                  max={1}
                  step="0.05"
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={sspPct}
                  onChange={(e) => setSspPct(e.target.value)}
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Waiting qualifying days (0 = reform)
                <input
                  type="number"
                  min={0}
                  max={7}
                  step={1}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={sspWaiting}
                  onChange={(e) => setSspWaiting(e.target.value)}
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Lower Earnings Limit (£/wk, optional)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={clearSspLel}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] disabled:opacity-50"
                  value={sspLel}
                  onChange={(e) => {
                    setSspLel(e.target.value);
                    setClearSspLel(false);
                  }}
                  placeholder="Leave empty for no LEL check"
                />
              </label>
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#6b6b6b]">
              <input
                type="checkbox"
                checked={clearSspLel}
                onChange={(e) => {
                  setClearSspLel(e.target.checked);
                  if (e.target.checked) setSspLel('');
                }}
                className="rounded border-[#d8d8d8]"
              />
              Clear saved LEL (recommended for 2026 reform)
            </label>
          </div>

          <div>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Default full-year annual leave (days)
              <input
                type="number"
                min={0}
                step="0.5"
                disabled={removeOrgDefaultAnnual}
                className="mt-1 w-full max-w-[200px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] disabled:opacity-50"
                value={defaultOrgAnnual}
                onChange={(e) => {
                  setDefaultOrgAnnual(e.target.value);
                  setRemoveOrgDefaultAnnual(false);
                }}
                placeholder="e.g. 20 or 30"
              />
            </label>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#6b6b6b]">
              <input
                type="checkbox"
                checked={removeOrgDefaultAnnual}
                onChange={(e) => setRemoveOrgDefaultAnnual(e.target.checked)}
                className="rounded border-[#d8d8d8]"
              />
              Remove saved organisation default
            </label>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Each SU (organisation) can set its own policy — e.g. 20 days or 30 days. Save here, then use “Apply to everyone” below to populate allowances; employment start dates still pro-rate the year someone joins.
            </p>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">International leave law profile</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Configure leave policy baseline beyond UK. Keep using your organisation defaults and override values case-by-case as needed.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Country code (ISO-2)
                <input
                  type="text"
                  maxLength={2}
                  value={leaveLawCountryCode}
                  onChange={(e) => setLeaveLawCountryCode(e.target.value.toUpperCase())}
                  className="mt-1 w-full max-w-[120px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder="GB"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Policy profile
                <select
                  value={leaveLawProfile}
                  onChange={(e) => setLeaveLawProfile(e.target.value)}
                  className="mt-1 w-full max-w-[220px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                >
                  <option value="uk">UK</option>
                  <option value="eu_general">EU (general)</option>
                  <option value="us_general">US (general)</option>
                  <option value="ca_general">Canada (general)</option>
                  <option value="au_general">Australia (general)</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">Annual leave accrual</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              When enabled, annual leave accrues month by month through the leave year instead of granting the full prorated allowance upfront.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#121212]">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[#d8d8d8]"
                checked={leaveAccrualEnabled}
                onChange={(e) => setLeaveAccrualEnabled(e.target.checked)}
              />
              <span>Enable accrual by months worked</span>
            </label>
            <label className="mt-3 block text-[12.5px] font-medium text-[#6b6b6b]">
              Accrual frequency
              <select
                value={leaveAccrualFrequency}
                onChange={(e) => setLeaveAccrualFrequency(e.target.value)}
                disabled={!leaveAccrualEnabled}
                className="mt-1 w-full max-w-[180px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] disabled:opacity-50"
              >
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-[#e8e8e8] bg-[#fafaf8] p-4">
            <p className="text-[12.5px] font-medium text-[#121212]">Apply organisation default to everyone</p>
            <p className="mt-1 text-[11px] text-[#9b9b9b]">
              Uses the saved default above (full-year days) and writes each person&apos;s allowance for the selected leave year, pro-rated by their employment start date. TOIL balances are kept. By default only fills people who don&apos;t already have a row for that year; enable overwrite to recalculate everyone.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Leave year
                <select
                  className="mt-1 block w-full min-w-[120px] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#6b6b6b] sm:pb-2">
                <input
                  type="checkbox"
                  checked={bulkOverwrite}
                  onChange={(e) => setBulkOverwrite(e.target.checked)}
                  className="rounded border-[#d8d8d8]"
                />
                Overwrite existing allowances for this year
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void bulkApplyOrgDefault()}
                className="rounded-lg border border-[#121212] bg-white px-4 py-2 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1] disabled:opacity-50"
              >
                {busy ? 'Applying…' : 'Apply default to all'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[12.5px] font-medium text-[#6b6b6b]">Leave year start date</p>
            <p className="mt-0.5 text-[11px] text-[#9b9b9b] mb-2">
              When does your leave year begin? e.g. April 1 = month 4, day 1. January 1 = month 1, day 1.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Month (1–12)
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="mt-1 w-20 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-2 text-[13px]"
                  value={lyM}
                  onChange={(e) => setLyM(e.target.value)}
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Day (1–31)
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="mt-1 w-20 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-2 text-[13px]"
                  value={lyD}
                  onChange={(e) => setLyD(e.target.value)}
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </section>
    </div>
  );
}
