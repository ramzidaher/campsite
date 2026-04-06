'use client';

import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type LeaveRequest = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  status: string;
  note: string | null;
  created_at: string;
  requester_id?: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

type SicknessRow = {
  id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
};

type AllowanceRow = {
  leave_year: string;
  annual_entitlement_days: number;
  toil_balance_days: number;
};

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function daysLabel(start: string, end: string): string {
  const n = daysBetween(start, end);
  return `${n} day${n === 1 ? '' : 's'}`;
}

function displayName(p: LeaveRequest): string {
  const raw = p.profiles;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.full_name?.trim() || 'Team member';
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:  { label: 'Awaiting approval', className: 'bg-[#fff7ed] text-[#c2410c]' },
    approved: { label: 'Approved',          className: 'bg-[#dcfce7] text-[#166534]' },
    rejected: { label: 'Declined',          className: 'bg-[#fef2f2] text-[#b91c1c]' },
    cancelled:{ label: 'Cancelled',         className: 'bg-[#f5f4f1] text-[#9b9b9b]' },
  };
  const { label, className } = map[status] ?? { label: status, className: 'bg-[#f5f4f1] text-[#6b6b6b]' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function KindLabel({ kind }: { kind: string }) {
  return kind === 'toil' ? 'Time off in lieu (TOIL)' : 'Annual leave';
}

export function LeaveHubClient({
  orgId,
  userId,
  canSubmit,
  canApprove,
  canManage,
  initialYear,
}: {
  orgId: string;
  userId: string;
  canSubmit: boolean;
  canApprove: boolean;
  canManage: boolean;
  initialYear: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [year, setYear] = useState(initialYear);
  const [allowance, setAllowance] = useState<AllowanceRow | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingForMe, setPendingForMe] = useState<LeaveRequest[]>([]);
  const [sickness, setSickness] = useState<SicknessRow[]>([]);
  const [absenceScore, setAbsenceScore] = useState<{
    spell_count: number;
    total_days: number;
    bradford_score: number;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [formKind, setFormKind] = useState<'annual' | 'toil'>('annual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formNote, setFormNote] = useState('');

  const [sickStart, setSickStart] = useState('');
  const [sickEnd, setSickEnd] = useState('');
  const [sickNotes, setSickNotes] = useState('');

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(String);

  const load = useCallback(async () => {
    setMsg(null);
    const [{ data: al }, { data: mine }, { data: sick }, { data: bf }] = await Promise.all([
      supabase
        .from('leave_allowances')
        .select('leave_year, annual_entitlement_days, toil_balance_days')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('leave_year', year)
        .maybeSingle(),
      supabase
        .from('leave_requests')
        .select('id, kind, start_date, end_date, status, note, created_at')
        .eq('org_id', orgId)
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('sickness_absences')
        .select('id, start_date, end_date, notes')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
        .limit(80),
      supabase.rpc('bradford_factor_for_user', { p_user_id: userId, p_on: new Date().toISOString().slice(0, 10) }),
    ]);

    setAllowance(
      al
        ? {
            leave_year: String(al.leave_year),
            annual_entitlement_days: Number(al.annual_entitlement_days ?? 0),
            toil_balance_days: Number(al.toil_balance_days ?? 0),
          }
        : { leave_year: year, annual_entitlement_days: 0, toil_balance_days: 0 },
    );
    setMyRequests((mine ?? []) as LeaveRequest[]);
    setSickness((sick ?? []) as SicknessRow[]);

    const b0 = Array.isArray(bf) ? bf[0] : bf;
    if (b0 && typeof b0 === 'object' && 'spell_count' in b0) {
      setAbsenceScore({
        spell_count: Number((b0 as { spell_count: number }).spell_count),
        total_days: Number((b0 as { total_days: number }).total_days),
        bradford_score: Number((b0 as { bradford_score: number }).bradford_score),
      });
    } else {
      setAbsenceScore(null);
    }

    if (canApprove || canManage) {
      let pend: LeaveRequest[] = [];
      if (canManage) {
        const { data } = await supabase
          .from('leave_requests')
          .select('id, requester_id, kind, start_date, end_date, status, note, created_at')
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        pend = (data ?? []) as LeaveRequest[];
      } else {
        const { data: reportIds } = await supabase
          .from('profiles')
          .select('id')
          .eq('org_id', orgId)
          .eq('reports_to_user_id', userId);
        const ids = (reportIds ?? []).map((r) => r.id as string).filter(Boolean);
        if (ids.length) {
          const { data } = await supabase
            .from('leave_requests')
            .select('id, requester_id, kind, start_date, end_date, status, note, created_at')
            .eq('org_id', orgId)
            .eq('status', 'pending')
            .in('requester_id', ids)
            .order('created_at', { ascending: false });
          pend = (data ?? []) as LeaveRequest[];
        }
      }
      const nameIds = [...new Set(pend.map((r) => r.requester_id as string))];
      const names: Record<string, string> = {};
      if (nameIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', nameIds);
        for (const p of profs ?? []) names[p.id as string] = (p.full_name as string) ?? '';
      }
      setPendingForMe(
        pend.map((r) => ({
          ...r,
          profiles: { full_name: names[r.requester_id as string] ?? '' },
        })),
      );
    } else {
      setPendingForMe([]);
    }
  }, [supabase, orgId, userId, year, canApprove, canManage]);

  useEffect(() => { void load(); }, [load]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !formStart || !formEnd) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('leave_request_submit', {
      p_kind: formKind,
      p_start: formStart,
      p_end: formEnd,
      p_note: formNote.trim() || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setFormStart(''); setFormEnd(''); setFormNote('');
    await load();
  }

  async function submitSickness(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !sickStart || !sickEnd) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('sickness_absence_create', {
      p_user_id: userId,
      p_start: sickStart,
      p_end: sickEnd,
      p_notes: sickNotes.trim() || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setSickStart(''); setSickEnd(''); setSickNotes('');
    await load();
  }

  async function cancelRequest(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_cancel', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message);
    else await load();
  }

  async function decideRequest(id: string, approve: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_decide', {
      p_request_id: id,
      p_approve: approve,
      p_note: null,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else await load();
  }

  const usedAnnual = useMemo(() => {
    return myRequests
      .filter((r) => r.kind === 'annual' && (r.status === 'approved' || r.status === 'pending'))
      .filter((r) => r.start_date.startsWith(year) || r.end_date.startsWith(year))
      .reduce((acc, r) => acc + daysBetween(r.start_date, r.end_date), 0);
  }, [myRequests, year]);

  const entitlement = allowance?.annual_entitlement_days ?? 0;
  const remaining = Math.max(0, entitlement - usedAnnual);
  const toilBalance = allowance?.toil_balance_days ?? 0;
  const usedPct = entitlement > 0 ? Math.min(100, Math.round((usedAnnual / entitlement) * 100)) : 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">

      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Time off</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">Book leave, log sick days, and see your balances.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-[#6b6b6b]">
            Year
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12.5px] text-[#121212]"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          {canManage ? (
            <Link
              href="/admin/leave"
              className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12.5px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
            >
              Admin settings
            </Link>
          ) : null}
        </div>
      </div>

      {msg ? (
        <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p>
      ) : null}

      {/* Balances */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {/* Annual leave balance */}
        <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">Annual leave remaining</p>
          <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-[#121212]">
            {remaining}
            <span className="ml-1 text-[16px] font-normal text-[#9b9b9b]">days</span>
          </p>
          <p className="mt-2 text-[11.5px] text-[#9b9b9b]">{usedAnnual} booked of {entitlement} day entitlement</p>
          {entitlement > 0 ? (
            <div className="mt-3 h-1.5 w-full rounded-full bg-[#ececec]">
              <div
                className={`h-1.5 rounded-full transition-all ${usedPct >= 90 ? 'bg-[#f59e0b]' : 'bg-[#121212]'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          ) : null}
        </div>

        {/* TOIL balance */}
        <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
            Time off in lieu (TOIL)
          </p>
          <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-[#121212]">
            {toilBalance}
            <span className="ml-1 text-[16px] font-normal text-[#9b9b9b]">days</span>
          </p>
          <p className="mt-2 text-[11.5px] text-[#9b9b9b]">
            TOIL is earned overtime you can take back as paid time off.
          </p>
        </div>
      </div>

      {/* Pending approvals (manager/admin) */}
      {(canApprove || canManage) && pendingForMe.length > 0 ? (
        <section className="mb-6 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-5">
          <h2 className="text-[14px] font-semibold text-[#92400e]">
            {pendingForMe.length} request{pendingForMe.length === 1 ? '' : 's'} waiting for your decision
          </h2>
          <ul className="mt-3 space-y-3">
            {pendingForMe.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-[#fde68a] bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-[13px]">
                  <div className="font-medium text-[#121212]">{displayName(r)}</div>
                  <div className="text-[#6b6b6b]">
                    <KindLabel kind={r.kind} /> · {r.start_date} to {r.end_date} ({daysLabel(r.start_date, r.end_date)})
                  </div>
                  {r.note ? <div className="mt-0.5 text-[12px] text-[#9b9b9b]">&ldquo;{r.note}&rdquo;</div> : null}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-[#14532d] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
                    onClick={() => void decideRequest(r.id, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#6b6b6b] disabled:opacity-50"
                    onClick={() => void decideRequest(r.id, false)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* No pending approvals notice */}
      {(canApprove || canManage) && pendingForMe.length === 0 ? (
        <section className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-4">
          <p className="text-[13px] text-[#9b9b9b]">No leave requests waiting for your approval.</p>
        </section>
      ) : null}

      {/* Request leave form */}
      {canSubmit ? (
        <section className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Book time off</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">Your request will go to your line manager for approval.</p>
          <form className="mt-4 space-y-3" onSubmit={(e) => void submitLeave(e)}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Type
                <select
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={formKind}
                  onChange={(e) => setFormKind(e.target.value as 'annual' | 'toil')}
                >
                  <option value="annual">Annual leave</option>
                  <option value="toil">Time off in lieu (TOIL)</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                First day off
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Last day off
                <input
                  type="date"
                  required
                  min={formStart}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                />
              </label>
            </div>
            {formStart && formEnd && formEnd >= formStart ? (
              <p className="text-[12px] text-[#6b6b6b]">
                That&apos;s <strong>{daysLabel(formStart, formEnd)}</strong>
                {formKind === 'annual' && ` — you have ${remaining} day${remaining === 1 ? '' : 's'} remaining`}
                {formKind === 'toil' && ` — you have ${toilBalance} TOIL day${toilBalance === 1 ? '' : 's'} available`}
              </p>
            ) : null}
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Add a note (optional)
              <input
                type="text"
                placeholder="e.g. family holiday"
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !formStart || !formEnd}
              className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        </section>
      ) : null}

      {/* Log sick day */}
      {canSubmit ? (
        <section className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Log sick days</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            Sick days don&apos;t use your annual leave — they&apos;re tracked separately. No approval needed.
          </p>
          <form className="mt-4 space-y-3" onSubmit={(e) => void submitSickness(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                First day sick
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={sickStart}
                  onChange={(e) => setSickStart(e.target.value)}
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Last day sick
                <input
                  type="date"
                  required
                  min={sickStart}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={sickEnd}
                  onChange={(e) => setSickEnd(e.target.value)}
                />
              </label>
            </div>
            {sickStart && sickEnd && sickEnd >= sickStart ? (
              <p className="text-[12px] text-[#6b6b6b]">
                That&apos;s <strong>{daysLabel(sickStart, sickEnd)}</strong>
              </p>
            ) : null}
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Notes (optional)
              <input
                type="text"
                placeholder="e.g. flu, GP appointment"
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={sickNotes}
                onChange={(e) => setSickNotes(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !sickStart || !sickEnd}
              className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
      ) : null}

      {/* My requests */}
      <section className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-[#121212]">My leave requests</h2>
        {myRequests.length === 0 ? (
          <p className="text-[13px] text-[#9b9b9b]">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-[#ececec] text-[13px]">
            {myRequests.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#121212]"><KindLabel kind={r.kind} /></span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-0.5 text-[#6b6b6b]">
                    {r.start_date} to {r.end_date} · {daysLabel(r.start_date, r.end_date)}
                  </div>
                  {r.note ? <div className="text-[12px] text-[#9b9b9b]">&ldquo;{r.note}&rdquo;</div> : null}
                </div>
                {r.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 sm:shrink-0"
                    onClick={() => void cancelRequest(r.id)}
                  >
                    Cancel request
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sick day history */}
      {canSubmit && sickness.length > 0 ? (
        <section className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-[#121212]">Sick day history</h2>
          <ul className="divide-y divide-[#ececec] text-[13px]">
            {sickness.map((s) => (
              <li key={s.id} className="py-2.5 text-[#6b6b6b]">
                {s.start_date} to {s.end_date} ({daysLabel(s.start_date, s.end_date)})
                {s.notes ? <span className="ml-2 text-[12px] text-[#9b9b9b]">&ldquo;{s.notes}&rdquo;</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Sickness absence score */}
      {absenceScore ? (
        <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Sickness absence score</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            A score your organisation uses to spot patterns in sickness — based on the number of separate absences and
            total days off. Higher scores may prompt a conversation with HR.
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <dt className="text-[11.5px] font-medium text-[#9b9b9b]">Separate absences</dt>
              <dd className="mt-1 text-[24px] font-bold text-[#121212]">{absenceScore.spell_count}</dd>
            </div>
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <dt className="text-[11.5px] font-medium text-[#9b9b9b]">Total sick days</dt>
              <dd className="mt-1 text-[24px] font-bold text-[#121212]">{absenceScore.total_days}</dd>
            </div>
            <div className={`rounded-lg p-3 ${absenceScore.bradford_score >= 200 ? 'bg-[#fef2f2]' : 'bg-[#faf9f6]'}`}>
              <dt className="text-[11.5px] font-medium text-[#9b9b9b]">Absence score</dt>
              <dd className={`mt-1 text-[24px] font-bold ${absenceScore.bradford_score >= 200 ? 'text-[#b91c1c]' : 'text-[#121212]'}`}>
                {absenceScore.bradford_score}
              </dd>
            </div>
          </dl>
          {absenceScore.bradford_score >= 200 ? (
            <p className="mt-3 text-[12px] text-[#b91c1c]">
              Your score is above the typical review threshold. Your HR team may be in touch.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
