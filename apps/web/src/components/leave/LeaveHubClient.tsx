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
  user_id?: string;
};

type AllowanceRow = {
  leave_year: string;
  annual_entitlement_days: number;
  toil_balance_days: number;
};

function daysLabel(start: string, end: string): string {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  const n = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return `${n} day${n === 1 ? '' : 's'}`;
}

function displayName(p: LeaveRequest): string {
  const raw = p.profiles;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.full_name?.trim() || 'Member';
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

  useEffect(() => {
    void load();
  }, [load]);

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
    if (error) {
      setMsg(error.message);
      return;
    }
    setFormStart('');
    setFormEnd('');
    setFormNote('');
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
    if (error) {
      setMsg(error.message);
      return;
    }
    setSickStart('');
    setSickEnd('');
    setSickNotes('');
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
      .reduce((acc, r) => {
        const a = new Date(`${r.start_date}T12:00:00Z`);
        const b = new Date(`${r.end_date}T12:00:00Z`);
        return acc + Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
      }, 0);
  }, [myRequests, year]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Leave</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Annual leave and TOIL (with line-manager approval), sickness logging, and a rolling sickness absence
            score.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/admin/leave"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12.5px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
          >
            Org leave admin
          </Link>
        ) : null}
      </div>

      {msg ? <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      <aside className="mb-6 rounded-xl border border-[#e8e4dc] bg-[#f7f5f0] p-4 text-[12px] leading-relaxed text-[#4a4a4a]">
        <p className="font-semibold text-[#121212]">How this works</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Annual leave</strong> is checked against the entitlement your organisation sets. The system uses
            your <strong>approved and pending</strong> annual requests for this leave year (calendar year for now) when
            you book — there is no separate “used days” counter.
          </li>
          <li>
            <strong>TOIL</strong> uses a days balance your admin maintains; when TOIL leave is <strong>approved</strong>
            , that balance goes down.
          </li>
          <li>
            <strong>Sickness</strong> is logged separately: it does not reduce annual leave or TOIL, but it feeds the
            sickness absence score below.
          </li>
          <li>
            Your <strong>line manager</strong> (for approvals) is chosen under Admin → All members → Edit. If none is
            set, only org admins can approve leave.
          </li>
          {canManage ? (
            <li>
              <strong>Custom roles</strong> do not get leave access automatically — grant the right leave permissions
              under Admin → Roles & permissions.
            </li>
          ) : null}
        </ul>
      </aside>

      <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">Balances ({year})</h2>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          Figures are for planning; booking rules are enforced when you submit (annual vs entitlement, TOIL vs balance).
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
          <label className="flex items-center gap-2 text-[#6b6b6b]">
            Leave year
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value.trim() || initialYear)}
              className="w-24 rounded-md border border-[#d8d8d8] px-2 py-1 text-[#121212]"
              aria-label="Leave year"
            />
          </label>
          <div>
            <span className="text-[#9b9b9b]">Annual entitlement</span>{' '}
            <span className="font-medium text-[#121212]">{allowance?.annual_entitlement_days ?? 0} days</span>
          </div>
          <div>
            <span className="text-[#9b9b9b]">Annual booked this year (pending + approved)</span>{' '}
            <span className="font-medium text-[#121212]">{usedAnnual} days</span>
          </div>
          <div>
            <span className="text-[#9b9b9b]">TOIL balance (reduced when TOIL leave is approved)</span>{' '}
            <span className="font-medium text-[#121212]">{allowance?.toil_balance_days ?? 0} days</span>
          </div>
        </div>
      </section>

      {canApprove || canManage ? (
        <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Pending approvals</h2>
          {pendingForMe.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#9b9b9b]">No pending leave requests.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pendingForMe.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-[13px]">
                    <div className="font-medium text-[#121212]">{displayName(r)}</div>
                    <div className="text-[#6b6b6b]">
                      {r.kind === 'annual' ? 'Annual leave' : 'TOIL'} · {r.start_date} → {r.end_date} (
                      {daysLabel(r.start_date, r.end_date)})
                    </div>
                    {r.note ? <div className="text-[12px] text-[#9b9b9b]">{r.note}</div> : null}
                  </div>
                  <div className="flex gap-2">
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
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {canSubmit ? (
        <>
          <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
            <h2 className="text-[15px] font-semibold text-[#121212]">Request leave</h2>
            <p className="mt-1 text-[12px] text-[#9b9b9b]">
              Your line manager (set under Admin → All members → Edit) approves TOIL and annual leave.
            </p>
            <form className="mt-4 space-y-3" onSubmit={(e) => void submitLeave(e)}>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Type
                <select
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={formKind}
                  onChange={(e) => setFormKind(e.target.value as 'annual' | 'toil')}
                >
                  <option value="annual">Annual leave</option>
                  <option value="toil">TOIL</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  Start
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                  />
                </label>
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  End
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Note (optional)
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
              >
                Submit request
              </button>
            </form>
          </section>

          <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
            <h2 className="text-[15px] font-semibold text-[#121212]">Log sickness</h2>
            <p className="mt-1 text-[12px] text-[#9b9b9b]">
              Sickness is separate from paid leave: it does not use your annual entitlement or TOIL balance, but it
              counts toward your rolling sickness absence score below.
            </p>
            <form className="mt-4 space-y-3" onSubmit={(e) => void submitSickness(e)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  Start
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                    value={sickStart}
                    onChange={(e) => setSickStart(e.target.value)}
                  />
                </label>
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  End
                  <input
                    type="date"
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                    value={sickEnd}
                    onChange={(e) => setSickEnd(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Notes (optional)
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  value={sickNotes}
                  onChange={(e) => setSickNotes(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
              >
                Log sickness
              </button>
            </form>
          </section>
        </>
      ) : null}

      <section className="mb-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">Sickness absence score</h2>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          Based only on sickness you have logged. Many UK employers track a number from{' '}
          <strong>how many separate absences</strong> you have had and <strong>how many days</strong> you were off in a
          rolling period (here: separate absences squared × total days). Overlapping or back-to-back sick days usually
          count as one absence. This is not legal advice — use it alongside your own HR policies.
        </p>
        {absenceScore ? (
          <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[#9b9b9b]">Separate absences</dt>
              <dd className="font-medium text-[#121212]">{absenceScore.spell_count}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Total days off (sickness)</dt>
              <dd className="font-medium text-[#121212]">{absenceScore.total_days}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Combined score</dt>
              <dd className="font-medium text-[#121212]">{absenceScore.bradford_score}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-[13px] text-[#9b9b9b]">Could not load sickness absence score.</p>
        )}
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#121212]">My leave requests</h2>
        <ul className="mt-3 divide-y divide-[#ececec] text-[13px]">
          {myRequests.length === 0 ? <li className="py-2 text-[#9b9b9b]">No requests yet.</li> : null}
          {myRequests.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium capitalize text-[#121212]">{r.kind}</span>{' '}
                <span className="text-[#6b6b6b]">
                  {r.start_date} → {r.end_date} ({daysLabel(r.start_date, r.end_date)})
                </span>
                <span
                  className={[
                    'ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    r.status === 'approved'
                      ? 'bg-[#dcfce7] text-[#166534]'
                      : r.status === 'pending'
                        ? 'bg-[#fff7ed] text-[#c2410c]'
                        : r.status === 'rejected'
                          ? 'bg-[#fef2f2] text-[#b91c1c]'
                          : 'bg-[#f5f4f1] text-[#6b6b6b]',
                  ].join(' ')}
                >
                  {r.status}
                </span>
              </div>
              {r.status === 'pending' ? (
                <button
                  type="button"
                  disabled={busy}
                  className="text-[12px] text-[#b91c1c] underline disabled:opacity-50"
                  onClick={() => void cancelRequest(r.id)}
                >
                  Cancel
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {canSubmit ? (
        <section className="mt-8 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Sickness history</h2>
          <ul className="mt-3 divide-y divide-[#ececec] text-[13px]">
            {sickness.length === 0 ? <li className="py-2 text-[#9b9b9b]">No sickness logged.</li> : null}
            {sickness.map((s) => (
              <li key={s.id} className="py-2 text-[#6b6b6b]">
                {s.start_date} → {s.end_date} ({daysLabel(s.start_date, s.end_date)})
                {s.notes ? <span className="ml-2 text-[12px] text-[#9b9b9b]">{s.notes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
