'use client';

import { currentLeaveYearKey } from '@/lib/datetime';
import { useShellRefresh } from '@/hooks/useShellRefresh';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Member = { id: string; full_name: string; email: string | null };

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
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<'ok' | 'err'>('ok');
  const [busy, setBusy] = useState(false);

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

  useEffect(() => { void loadRow(); }, [loadRow]);
  useShellRefresh(() => void loadRow());

  function flash(text: string, kind: 'ok' | 'err' = 'ok') {
    setMsg(text);
    setMsgKind(kind);
  }

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
    else flash('Allowance saved.');
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
    } = {
      p_bradford_window_days: Number(bradfordDays),
      p_leave_year_start_month: Number(lyM),
      p_leave_year_start_day: Number(lyD),
      p_approved_request_change_window_hours: Number(changeWindowHours),
      p_leave_use_working_days: leaveUseWorkingDays,
      p_non_working_iso_dows: nonWorkingDows,
    };
    if (removeOrgDefaultAnnual) {
      payload.p_clear_default_annual_entitlement = true;
    } else if (defaultOrgAnnual.trim() !== '') {
      payload.p_default_annual_entitlement_days = Number(defaultOrgAnnual);
    }
    const { error } = await supabase.rpc('org_leave_settings_upsert', payload);
    setBusy(false);
    if (error) flash(error.message, 'err');
    else {
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
    else flash(`Applied default to ${typeof data === 'number' ? data : 0} people for ${year}.`);
  }

  const selectedMember = members.find((m) => m.id === targetId);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
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
