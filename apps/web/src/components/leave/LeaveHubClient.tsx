'use client';

import { HrNav } from '@/components/hr/HrNav';
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
  decided_at?: string | null;
  requested_action_at?: string | null;
  proposed_kind?: string | null;
  proposed_start_date?: string | null;
  proposed_end_date?: string | null;
  proposed_note?: string | null;
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

function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = new Date(`${aStart}T12:00:00Z`).getTime();
  const e = new Date(`${aEnd}T12:00:00Z`).getTime();
  const bs = new Date(`${bStart}T12:00:00Z`).getTime();
  const be = new Date(`${bEnd}T12:00:00Z`).getTime();
  const from = Math.max(s, bs);
  const to = Math.min(e, be);
  if (to < from) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

function daysLabel(start: string, end: string): string {
  const n = daysBetween(start, end);
  return `${n} day${n === 1 ? '' : 's'}`;
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function displayName(p: LeaveRequest): string {
  const raw = p.profiles;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.full_name?.trim() || 'Team member';
}

function isWithinApprovedChangeWindow(r: LeaveRequest, windowHours: number): boolean {
  if (r.status !== 'approved' || !r.decided_at) return false;
  const decidedMs = new Date(r.decided_at).getTime();
  if (!Number.isFinite(decidedMs)) return false;
  return Date.now() <= decidedMs + windowHours * 60 * 60 * 1000;
}

const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  pending:   { label: 'Awaiting approval', dot: 'bg-amber-400',   text: 'text-amber-800',  bg: 'bg-amber-50 border-amber-200' },
  approved:  { label: 'Approved',          dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200' },
  pending_cancel: { label: 'Cancel request pending', dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  pending_edit: { label: 'Edit request pending', dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  rejected:  { label: 'Declined',          dot: 'bg-red-400',     text: 'text-red-800',     bg: 'bg-red-50 border-red-200' },
  cancelled: { label: 'Cancelled',         dot: 'bg-[#d0d0d0]',   text: 'text-[#6b6b6b]',  bg: 'bg-[#f5f4f1] border-[#e0e0e0]' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, dot: 'bg-[#d0d0d0]', text: 'text-[#6b6b6b]', bg: 'bg-[#f5f4f1] border-[#e0e0e0]' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function LeaveHubClient({
  orgId,
  userId,
  canSubmit,
  canApprove,
  canManage,
  initialYear,
  leaveYearStartMonth,
  leaveYearStartDay,
  approvedChangeWindowHours,
  showPerformanceTab,
  showOnboardingTab,
}: {
  orgId: string;
  userId: string;
  canSubmit: boolean;
  canApprove: boolean;
  canManage: boolean;
  initialYear: string;
  leaveYearStartMonth: number;
  leaveYearStartDay: number;
  approvedChangeWindowHours: number;
  showPerformanceTab: boolean;
  showOnboardingTab: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [year, setYear] = useState(initialYear);
  const [allowance, setAllowance] = useState<AllowanceRow | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingForMe, setPendingForMe] = useState<LeaveRequest[]>([]);
  const [sickness, setSickness] = useState<SicknessRow[]>([]);
  const [absenceScore, setAbsenceScore] = useState<{ spell_count: number; total_days: number; bradford_score: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showSickForm, setShowSickForm] = useState(false);
  const [showSickHistory, setShowSickHistory] = useState(false);

  const [formKind, setFormKind] = useState<'annual' | 'toil'>('annual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formNote, setFormNote] = useState('');

  const [sickStart, setSickStart] = useState('');
  const [sickEnd, setSickEnd] = useState('');
  const [sickNotes, setSickNotes] = useState('');
  const [editTarget, setEditTarget] = useState<LeaveRequest | null>(null);
  const [editKind, setEditKind] = useState<'annual' | 'toil'>('annual');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNote, setEditNote] = useState('');

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].map(String);

  const load = useCallback(async () => {
    setMsg(null);
    const [{ data: al }, { data: mine }, { data: sick }, { data: bf }] = await Promise.all([
      supabase.from('leave_allowances').select('leave_year, annual_entitlement_days, toil_balance_days').eq('org_id', orgId).eq('user_id', userId).eq('leave_year', year).maybeSingle(),
      supabase.from('leave_requests').select('id, kind, start_date, end_date, status, note, created_at, decided_at, requested_action_at, proposed_kind, proposed_start_date, proposed_end_date, proposed_note').eq('org_id', orgId).eq('requester_id', userId).order('created_at', { ascending: false }).limit(80),
      supabase.from('sickness_absences').select('id, start_date, end_date, notes').eq('org_id', orgId).eq('user_id', userId).order('start_date', { ascending: false }).limit(80),
      supabase.rpc('bradford_factor_for_user', { p_user_id: userId, p_on: new Date().toISOString().slice(0, 10) }),
    ]);

    setAllowance(al ? { leave_year: String(al.leave_year), annual_entitlement_days: Number(al.annual_entitlement_days ?? 0), toil_balance_days: Number(al.toil_balance_days ?? 0) } : { leave_year: year, annual_entitlement_days: 0, toil_balance_days: 0 });
    setMyRequests((mine ?? []) as LeaveRequest[]);
    setSickness((sick ?? []) as SicknessRow[]);

    const b0 = Array.isArray(bf) ? bf[0] : bf;
    if (b0 && typeof b0 === 'object' && 'spell_count' in b0) {
      setAbsenceScore({ spell_count: Number((b0 as { spell_count: number }).spell_count), total_days: Number((b0 as { total_days: number }).total_days), bradford_score: Number((b0 as { bradford_score: number }).bradford_score) });
    } else { setAbsenceScore(null); }

    if (canApprove || canManage) {
      let pend: LeaveRequest[] = [];
      if (canManage) {
          const { data } = await supabase.from('leave_requests').select('id, requester_id, kind, start_date, end_date, status, note, created_at, proposed_kind, proposed_start_date, proposed_end_date, proposed_note').eq('org_id', orgId).in('status', ['pending', 'pending_cancel', 'pending_edit']).order('created_at', { ascending: false });
        pend = (data ?? []) as LeaveRequest[];
      } else {
        const { data: reportIds } = await supabase.from('profiles').select('id').eq('org_id', orgId).eq('reports_to_user_id', userId);
        const ids = (reportIds ?? []).map((r) => r.id as string).filter(Boolean);
        if (ids.length) {
          const { data } = await supabase.from('leave_requests').select('id, requester_id, kind, start_date, end_date, status, note, created_at, proposed_kind, proposed_start_date, proposed_end_date, proposed_note').eq('org_id', orgId).in('status', ['pending', 'pending_cancel', 'pending_edit']).in('requester_id', ids).order('created_at', { ascending: false });
          pend = (data ?? []) as LeaveRequest[];
        }
      }
      const nameIds = [...new Set(pend.map((r) => r.requester_id as string))];
      const names: Record<string, string> = {};
      if (nameIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', nameIds);
        for (const p of profs ?? []) names[p.id as string] = (p.full_name as string) ?? '';
      }
      setPendingForMe(pend.map((r) => ({ ...r, profiles: { full_name: names[r.requester_id as string] ?? '' } })));
    } else { setPendingForMe([]); }
  }, [supabase, orgId, userId, year, canApprove, canManage]);

  useEffect(() => { void load(); }, [load]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !formStart || !formEnd) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('leave_request_submit', { p_kind: formKind, p_start: formStart, p_end: formEnd, p_note: formNote.trim() || null });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setFormStart(''); setFormEnd(''); setFormNote(''); setShowLeaveForm(false);
    await load();
  }

  async function submitSickness(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !sickStart || !sickEnd) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('sickness_absence_create', { p_user_id: userId, p_start: sickStart, p_end: sickEnd, p_notes: sickNotes.trim() || null });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setSickStart(''); setSickEnd(''); setSickNotes(''); setShowSickForm(false);
    await load();
  }

  async function cancelRequest(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_cancel', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message); else await load();
  }

  async function requestCancelApproval(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_cancel_request', { p_request_id: id });
    setBusy(false);
    if (error) setMsg(error.message); else await load();
  }

  async function requestEditApproval(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || !editStart || !editEnd) return;
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_edit_request', {
      p_request_id: editTarget.id,
      p_kind: editKind,
      p_start: editStart,
      p_end: editEnd,
      p_note: editNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setEditTarget(null);
    setEditStart('');
    setEditEnd('');
    setEditNote('');
    await load();
  }

  function openEditDialog(r: LeaveRequest) {
    setEditTarget(r);
    setEditKind((r.kind === 'toil' ? 'toil' : 'annual') as 'annual' | 'toil');
    setEditStart(r.start_date);
    setEditEnd(r.end_date);
    setEditNote(r.note ?? '');
    setMsg(null);
  }

  async function decideRequest(id: string, approve: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc('leave_request_decide', { p_request_id: id, p_approve: approve, p_note: null });
    setBusy(false);
    if (error) setMsg(error.message); else await load();
  }

  const leaveYearStartIso = useMemo(() => {
    const y = Number(year);
    return `${String(y).padStart(4, '0')}-${String(leaveYearStartMonth).padStart(2, '0')}-${String(leaveYearStartDay).padStart(2, '0')}`;
  }, [year, leaveYearStartMonth, leaveYearStartDay]);
  const leaveYearEndIso = useMemo(() => {
    const y = Number(year) + 1;
    const d = new Date(Date.UTC(y, leaveYearStartMonth - 1, leaveYearStartDay));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [year, leaveYearStartMonth, leaveYearStartDay]);

  const usedAnnual = useMemo(
    () =>
      myRequests
        .filter((r) => r.kind === 'annual' && (r.status === 'approved' || r.status === 'pending'))
        .reduce((acc, r) => acc + overlapDays(r.start_date, r.end_date, leaveYearStartIso, leaveYearEndIso), 0),
    [myRequests, leaveYearStartIso, leaveYearEndIso]
  );

  const entitlement = allowance?.annual_entitlement_days ?? 0;
  const remaining = Math.max(0, entitlement - usedAnnual);
  const toilBalance = allowance?.toil_balance_days ?? 0;
  const usedPct = entitlement > 0 ? Math.min(100, Math.round((usedAnnual / entitlement) * 100)) : 0;
  const requestedDays = formStart && formEnd && formEnd >= formStart ? daysBetween(formStart, formEnd) : 0;
  const projectedAnnualRemaining = formKind === 'annual' ? remaining - requestedDays : remaining;
  const exceedsAnnualAllowance = formKind === 'annual' && requestedDays > 0 && projectedAnnualRemaining < 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      <HrNav showLeave showPerformance={showPerformanceTab} showOnboarding={showOnboardingTab} showOrgChart />

      {/* Page header */}
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Time off</h1>
          <p className="mt-1 text-[13.5px] text-[#6b6b6b]">Book leave, log sick days, and see your balances.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-[#6b6b6b]">
            Year
            <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px] text-[#121212] focus:border-[#121212] focus:outline-none">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {canManage ? (
            <Link href="/hr/leave" className="inline-flex h-8 items-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]">
              Admin settings
            </Link>
          ) : null}
        </div>
      </div>

      {msg ? <p className="mb-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      {/* Balance hero */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
        <div className="grid divide-y divide-[#f0f0f0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {/* Remaining */}
          <div className="flex flex-col gap-1 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Remaining</p>
            <p className="mt-1 text-[42px] font-bold leading-none tracking-tighter text-[#121212]">
              {remaining}
              <span className="ml-1.5 text-[16px] font-normal text-[#9b9b9b]">days</span>
            </p>
            {entitlement > 0 ? (
              <>
                <div className="mt-3 h-1.5 w-full rounded-full bg-[#f0f0f0]">
                  <div className={`h-1.5 rounded-full transition-all ${usedPct >= 90 ? 'bg-amber-400' : 'bg-[#121212]'}`} style={{ width: `${usedPct}%` }} />
                </div>
                <p className="mt-1.5 text-[11.5px] text-[#9b9b9b]">{usedAnnual} of {entitlement} days used</p>
              </>
            ) : null}
          </div>
          {/* TOIL */}
          <div className="flex flex-col gap-1 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">TOIL balance</p>
            <p className="mt-1 text-[42px] font-bold leading-none tracking-tighter text-[#121212]">
              {toilBalance}
              <span className="ml-1.5 text-[16px] font-normal text-[#9b9b9b]">days</span>
            </p>
            <p className="mt-3 text-[11.5px] text-[#9b9b9b]">Overtime earned back as paid time off.</p>
          </div>
          {/* Action / entitlement */}
          <div className="flex flex-col justify-between gap-4 p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Entitlement</p>
              <p className="mt-1 text-[42px] font-bold leading-none tracking-tighter text-[#121212]">
                {entitlement}
                <span className="ml-1.5 text-[16px] font-normal text-[#9b9b9b]">days / yr</span>
              </p>
            </div>
            {canSubmit ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => { setShowLeaveForm((v) => !v); setShowSickForm(false); }} className="inline-flex h-9 items-center justify-center rounded-xl bg-[#121212] px-4 text-[13px] font-medium text-white hover:bg-[#2a2a2a]">
                  {showLeaveForm ? 'Cancel' : '+ Book time off'}
                </button>
                <button type="button" onClick={() => { setShowSickForm((v) => !v); setShowLeaveForm(false); }} className="inline-flex h-9 items-center justify-center rounded-xl border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]">
                  {showSickForm ? 'Cancel' : '+ Log sick day'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Leave request form (slide-in) */}
      {showLeaveForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-[#121212]">Book time off</h2>
          <form className="space-y-4" onSubmit={(e) => void submitLeave(e)}>
            {/* Kind */}
            <div className="flex gap-2">
              {(['annual', 'toil'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setFormKind(k)}
                  className={`flex-1 rounded-xl border py-2.5 text-[13px] font-medium transition-colors ${formKind === k ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-[#faf9f6] text-[#6b6b6b] hover:border-[#121212]'}`}>
                  {k === 'annual' ? 'Annual leave' : 'Time off in lieu (TOIL)'}
                </button>
              ))}
            </div>
            {/* Dates */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">First day off</span>
                <input type="date" required value={formStart} onChange={(e) => setFormStart(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Last day off</span>
                <input type="date" required min={formStart} value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
            </div>
            {formStart && formEnd && formEnd >= formStart ? (
              <p
                className={[
                  'rounded-lg px-3 py-2 text-[12.5px] font-medium',
                  exceedsAnnualAllowance ? 'bg-[#fef2f2] text-[#b91c1c]' : 'bg-[#f0fdf9] text-[#166534]',
                ].join(' ')}
              >
                {daysLabel(formStart, formEnd)}
                {formKind === 'annual'
                  ? ` · ${Math.max(0, projectedAnnualRemaining)} day${Math.max(0, projectedAnnualRemaining) === 1 ? '' : 's'} remaining after this`
                  : ` · ${toilBalance} TOIL day${toilBalance === 1 ? '' : 's'} available`}
                {exceedsAnnualAllowance
                  ? ` · Exceeds your allowance by ${Math.abs(projectedAnnualRemaining)} day${Math.abs(projectedAnnualRemaining) === 1 ? '' : 's'}`
                  : ''}
              </p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Note (optional)</span>
              <input type="text" placeholder="e.g. family holiday" value={formNote} onChange={(e) => setFormNote(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <button type="submit" disabled={busy || !formStart || !formEnd || exceedsAnnualAllowance} className="inline-flex h-10 items-center rounded-xl bg-[#121212] px-5 text-[13px] font-medium text-white disabled:opacity-50">
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        </div>
      ) : null}

      {/* Sick day form */}
      {showSickForm && canSubmit ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-1 text-[15px] font-semibold text-[#121212]">Log sick days</h2>
          <p className="mb-4 text-[12px] text-[#9b9b9b]">Sick days don&apos;t use your annual leave — no approval needed.</p>
          <form className="space-y-4" onSubmit={(e) => void submitSickness(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">First day sick</span>
                <input type="date" required value={sickStart} onChange={(e) => setSickStart(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Last day sick</span>
                <input type="date" required min={sickStart} value={sickEnd} onChange={(e) => setSickEnd(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
            </div>
            {sickStart && sickEnd && sickEnd >= sickStart ? (
              <p className="rounded-lg bg-[#faf9f6] px-3 py-2 text-[12.5px] text-[#6b6b6b]">{daysLabel(sickStart, sickEnd)}</p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Notes (optional)</span>
              <input type="text" placeholder="e.g. flu, GP appointment" value={sickNotes} onChange={(e) => setSickNotes(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <button type="submit" disabled={busy || !sickStart || !sickEnd} className="inline-flex h-10 items-center rounded-xl bg-[#121212] px-5 text-[13px] font-medium text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      ) : null}

      {editTarget ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-[#121212]">Request changes to approved leave</h2>
          <p className="mb-4 text-[12px] text-[#9b9b9b]">
            This sends an edit request for manager approval.
          </p>
          <form className="space-y-4" onSubmit={(e) => void requestEditApproval(e)}>
            <div className="flex gap-2">
              {(['annual', 'toil'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEditKind(k)}
                  className={`flex-1 rounded-xl border py-2.5 text-[13px] font-medium transition-colors ${editKind === k ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-[#faf9f6] text-[#6b6b6b] hover:border-[#121212]'}`}
                >
                  {k === 'annual' ? 'Annual leave' : 'Time off in lieu (TOIL)'}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">First day off</span>
                <input type="date" required value={editStart} onChange={(e) => setEditStart(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Last day off</span>
                <input type="date" required min={editStart} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6b6b6b]">Note (optional)</span>
              <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} className="w-full rounded-xl border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy || !editStart || !editEnd} className="inline-flex h-10 items-center rounded-xl bg-[#121212] px-5 text-[13px] font-medium text-white disabled:opacity-50">
                {busy ? 'Sending…' : 'Send edit request'}
              </button>
              <button type="button" onClick={() => setEditTarget(null)} className="inline-flex h-10 items-center rounded-xl border border-[#d8d8d8] bg-white px-5 text-[13px] font-medium text-[#6b6b6b]">
                Close
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Pending approvals */}
      {(canApprove || canManage) && pendingForMe.length > 0 ? (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Pending approval</h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">{pendingForMe.length}</span>
          </div>
          <div className="space-y-2">
            {pendingForMe.map((r) => (
              <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-[#121212]">{displayName(r)}</p>
                  <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                    {r.kind === 'toil' ? 'Time off in lieu (TOIL)' : 'Annual leave'} &middot; {fmtDate(r.start_date)} – {fmtDate(r.end_date)} &middot; {daysLabel(r.start_date, r.end_date)}
                  </p>
                  {r.status === 'pending_edit' && r.proposed_start_date && r.proposed_end_date ? (
                    <p className="mt-1 text-[12px] text-[#92400e]">
                      Requested edit to {r.proposed_kind === 'toil' ? 'TOIL' : 'Annual leave'} &middot; {fmtDate(r.proposed_start_date)} – {fmtDate(r.proposed_end_date)}
                      {r.proposed_note ? ` · "${r.proposed_note}"` : ''}
                    </p>
                  ) : null}
                  {r.status === 'pending_cancel' ? (
                    <p className="mt-1 text-[12px] text-[#92400e]">Requested cancellation of this approved leave.</p>
                  ) : null}
                  {r.note ? <p className="mt-1 text-[12px] italic text-[#9b9b9b]">&ldquo;{r.note}&rdquo;</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={busy} onClick={() => void decideRequest(r.id, true)} className="rounded-xl bg-[#14532d] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 hover:bg-[#166534]">
                    Approve
                  </button>
                  <button type="button" disabled={busy} onClick={() => void decideRequest(r.id, false)} className="rounded-xl border border-[#d8d8d8] bg-white px-4 py-2 text-[12.5px] font-medium text-[#6b6b6b] disabled:opacity-50 hover:bg-[#fafafa]">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* My requests */}
      <section className="mb-6">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">My requests</h2>
        {myRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d8d8d8] px-6 py-10 text-center">
            <p className="text-[13px] text-[#9b9b9b]">No leave requests yet. Use &ldquo;Book time off&rdquo; above to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            {myRequests.map((r, i) => (
              <div key={r.id} className={`flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-[#121212]">{r.kind === 'toil' ? 'TOIL' : 'Annual leave'}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">{fmtDate(r.start_date)} – {fmtDate(r.end_date)} &middot; {daysLabel(r.start_date, r.end_date)}</p>
                  {r.note ? <p className="mt-0.5 text-[12px] italic text-[#9b9b9b]">&ldquo;{r.note}&rdquo;</p> : null}
                  {r.status === 'pending_edit' && r.proposed_start_date && r.proposed_end_date ? (
                    <p className="mt-1 text-[12px] text-[#92400e]">
                      Edit requested: {r.proposed_kind === 'toil' ? 'TOIL' : 'Annual leave'} &middot; {fmtDate(r.proposed_start_date)} – {fmtDate(r.proposed_end_date)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {r.status === 'pending' ? (
                    <button type="button" disabled={busy} onClick={() => void cancelRequest(r.id)} className="text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline">
                      Cancel
                    </button>
                  ) : null}
                  {isWithinApprovedChangeWindow(r, approvedChangeWindowHours) ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => openEditDialog(r)} className="text-[12px] text-[#6b6b6b] underline underline-offset-2 disabled:opacity-50 hover:no-underline">
                        Request edit
                      </button>
                      <button type="button" disabled={busy} onClick={() => void requestCancelApproval(r.id)} className="text-[12px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50 hover:no-underline">
                        Request cancellation
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sickness history */}
      {canSubmit && sickness.length > 0 ? (
        <section className="mb-6">
          <button type="button" onClick={() => setShowSickHistory((v) => !v)} className="mb-3 flex w-full items-center justify-between text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b] hover:text-[#6b6b6b]">
            <span>Sick day history</span>
            <span>{showSickHistory ? '▲' : '▼'}</span>
          </button>
          {showSickHistory ? (
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
              {sickness.map((s, i) => (
                <div key={s.id} className={`px-5 py-3 text-[12.5px] text-[#6b6b6b] ${i > 0 ? 'border-t border-[#f0f0f0]' : ''}`}>
                  {fmtDate(s.start_date)} – {fmtDate(s.end_date)} &middot; {daysLabel(s.start_date, s.end_date)}
                  {s.notes ? <span className="ml-2 italic text-[#9b9b9b]">&ldquo;{s.notes}&rdquo;</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Absence score */}
      {absenceScore ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Absence score</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            <div className="grid divide-y divide-[#f0f0f0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { label: 'Separate absences', value: absenceScore.spell_count },
                { label: 'Total sick days', value: absenceScore.total_days },
                { label: 'Absence score', value: absenceScore.bradford_score, highlight: absenceScore.bradford_score >= 200 },
              ].map((stat) => (
                <div key={stat.label} className={`p-5 ${stat.highlight ? 'bg-[#fef2f2]' : ''}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{stat.label}</p>
                  <p className={`mt-1.5 text-[32px] font-bold leading-none tracking-tight ${stat.highlight ? 'text-[#b91c1c]' : 'text-[#121212]'}`}>{stat.value}</p>
                </div>
              ))}
            </div>
            {absenceScore.bradford_score >= 200 ? (
              <div className="border-t border-[#fecaca] bg-[#fef2f2] px-5 py-3">
                <p className="text-[12.5px] text-[#b91c1c]">Your score is above the review threshold. Your HR team may be in touch.</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
