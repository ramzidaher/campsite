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
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [targetId, setTargetId] = useState(members[0]?.id ?? '');
  const [annual, setAnnual] = useState('25');
  const [toil, setToil] = useState('0');
  const [bradfordDays, setBradfordDays] = useState(String(initialSettings?.bradford_window_days ?? 365));
  const [lyM, setLyM] = useState(String(initialSettings?.leave_year_start_month ?? 1));
  const [lyD, setLyD] = useState(String(initialSettings?.leave_year_start_day ?? 1));
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<'ok' | 'err'>('ok');
  const [busy, setBusy] = useState(false);

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(String);

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
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('org_leave_settings_upsert', {
      p_bradford_window_days: Number(bradfordDays),
      p_leave_year_start_month: Number(lyM) as unknown as number,
      p_leave_year_start_day: Number(lyD) as unknown as number,
    });
    setBusy(false);
    if (error) flash(error.message, 'err');
    else flash('Settings saved.');
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
