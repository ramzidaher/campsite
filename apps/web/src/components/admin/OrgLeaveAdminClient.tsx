'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Member = { id: string; full_name: string; email: string | null };

export function OrgLeaveAdminClient({
  orgId,
  members,
  initialSettings,
}: {
  orgId: string;
  members: Member[];
  initialSettings: { bradford_window_days: number; leave_year_start_month: number; leave_year_start_day: number } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [targetId, setTargetId] = useState(members[0]?.id ?? '');
  const [annual, setAnnual] = useState('25');
  const [toil, setToil] = useState('0');
  const [bradfordDays, setBradfordDays] = useState(String(initialSettings?.bradford_window_days ?? 365));
  const [lyM, setLyM] = useState(String(initialSettings?.leave_year_start_month ?? 1));
  const [lyD, setLyD] = useState(String(initialSettings?.leave_year_start_day ?? 1));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    void loadRow();
  }, [loadRow]);

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
    if (error) setMsg(error.message);
    else setMsg('Saved allowance.');
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('org_leave_settings_upsert', {
      p_bradford_window_days: Number(bradfordDays),
      p_leave_year_start_month: Number(lyM) as unknown as number,
      p_leave_year_start_day: Number(lyD) as unknown as number,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else setMsg('Saved org leave settings.');
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <Link href="/leave" className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          ← Back to Leave
        </Link>
        <h1 className="mt-3 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Leave administration
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Set annual entitlement and TOIL balance per person and year. Annual usage is driven by approved and pending
          requests (no separate “used” counter). TOIL balance decreases when TOIL leave is approved.
        </p>
      </div>

      {msg ? <p className="mb-4 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-2 text-[13px] text-[#121212]">{msg}</p> : null}

      <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">Org settings</h2>
        <form className="mt-4 space-y-3" onSubmit={(e) => void saveSettings(e)}>
          <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
            Rolling window for sickness absence score (days)
            <input
              type="number"
              min={1}
              max={3660}
              className="mt-1 w-full max-w-[200px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
              value={bradfordDays}
              onChange={(e) => setBradfordDays(e.target.value)}
              aria-describedby="leave-score-window-hint"
            />
          </label>
          <p id="leave-score-window-hint" className="text-[11px] text-[#9b9b9b]">
            How far back from today we include logged sickness when calculating each person&apos;s sickness absence
            score (separate absences squared × total days). Leave year start (below) is reserved for future holiday-year
            accrual;
            allowance rows still use calendar years for now.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Start month
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
              Start day
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
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            Save settings
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">Allowances</h2>
        <form className="mt-4 space-y-3" onSubmit={(e) => void saveAllowance(e)}>
          <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
            Member
            <select
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                  {m.email ? ` (${m.email})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
            Leave year
            <input
              type="text"
              className="mt-1 w-full max-w-[120px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
              value={year}
              onChange={(e) => setYear(e.target.value.trim() || String(new Date().getFullYear()))}
            />
          </label>
          <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
            Annual entitlement (days)
            <input
              type="number"
              min={0}
              step="0.5"
              className="mt-1 w-full max-w-[200px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
              value={annual}
              onChange={(e) => setAnnual(e.target.value)}
            />
          </label>
          <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
            TOIL balance (days)
            <input
              type="number"
              min={0}
              step="0.5"
              className="mt-1 w-full max-w-[200px] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
              value={toil}
              onChange={(e) => setToil(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !targetId}
            className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            Save allowance
          </button>
        </form>
      </section>
    </div>
  );
}
