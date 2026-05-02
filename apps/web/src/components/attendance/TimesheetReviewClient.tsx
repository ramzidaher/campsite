'use client';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  user_id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  reported_total_minutes: number | null;
  approved_total_minutes: number | null;
  profiles: { full_name: string | null } | null;
};

export function TimesheetReviewClient({ orgId, viewerId }: { orgId: string; viewerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveMinutes, setApproveMinutes] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});

  const [proxyUserId, setProxyUserId] = useState('');
  const [proxyDir, setProxyDir] = useState<'in' | 'out'>('in');
  const [proxyReason, setProxyReason] = useState('');
  const [reports, setReports] = useState<{ id: string; full_name: string | null }[]>([]);
  const [sickUser, setSickUser] = useState('');
  const [sickRows, setSickRows] = useState<{ id: string; start_date: string; end_date: string }[]>([]);
  const [voidReason, setVoidReason] = useState('error_entry');
  const [voidNotes, setVoidNotes] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase
      .from('weekly_timesheets')
      .select('id, user_id, week_start_date, week_end_date, status, reported_total_minutes, approved_total_minutes')
      .eq('org_id', orgId)
      .eq('status', 'submitted')
      .order('week_start_date', { ascending: false });
    if (error) {
      setErr(error.message);
      return;
    }
    const raw = (data ?? []) as Omit<Row, 'profiles'>[];
    const ids = [...new Set(raw.map((r) => r.user_id))];
    const { data: profs } = await supabase
      .from('coworker_directory_public')
      .select('id, full_name')
      .in('id', ids);
    const nameById = new Map((profs as { id: string; full_name: string | null }[] | null)?.map((p) => [p.id, p.full_name]) ?? []);
    const list: Row[] = raw.map((r) => ({
      ...r,
      profiles: { full_name: nameById.get(r.user_id) ?? null },
    }));
    setRows(list);
    const am: Record<string, string> = {};
    for (const r of list) {
      am[r.id] = String(r.reported_total_minutes ?? 0);
    }
    setApproveMinutes(am);
  }, [orgId, supabase]);

  const invalidateAttendanceCaches = useCallback(async () => {
    await invalidateClientCaches({ scopes: ['leave-attendance'] });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const { data: manage } = await supabase.rpc('has_permission', {
        p_user_id: viewerId,
        p_org_id: orgId,
        p_permission_key: 'leave.manage_org',
        p_context: {},
      });
      let q = supabase
        .from('profiles')
        .select('id, full_name')
        .eq('org_id', orgId)
        .eq('status', 'active');
      if (!manage) {
        q = q.eq('reports_to_user_id', viewerId);
      }
      const { data } = await q.order('full_name');
      setReports((data as { id: string; full_name: string | null }[]) ?? []);
    })();
  }, [orgId, supabase, viewerId]);

  useEffect(() => {
    if (!sickUser) {
      setSickRows([]);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('sickness_absences')
        .select('id, start_date, end_date')
        .eq('org_id', orgId)
        .eq('user_id', sickUser)
        .is('voided_at', null)
        .order('start_date', { ascending: false })
        .limit(40);
      setSickRows((data as { id: string; start_date: string; end_date: string }[]) ?? []);
    })();
  }, [orgId, sickUser, supabase]);

  async function decide(row: Row, decision: 'approve' | 'reject') {
    setBusyId(row.id);
    setErr(null);
    const mins =
      decision === 'approve'
        ? Number(approveMinutes[row.id] ?? row.reported_total_minutes ?? 0)
        : null;
    const { error } = await supabase.rpc('weekly_timesheet_manager_decide', {
      p_user_id: row.user_id,
      p_week_start: row.week_start_date,
      p_decision: decision,
      p_approved_minutes: decision === 'approve' ? mins : null,
      p_note: note[row.id]?.trim() || null,
    });
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await invalidateAttendanceCaches().catch(() => null);
    await load();
  }

  async function proxyClock() {
    if (!proxyUserId || !proxyReason.trim()) {
      setErr('Choose employee and enter reason for proxy clock.');
      return;
    }
    setErr(null);
    setBusyId('proxy');
    let lat = 0;
    let lng = 0;
    let acc: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000 });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        acc = pos.coords.accuracy;
      } catch {
        setErr('Location required for proxy clock.');
        setBusyId(null);
        return;
      }
    }
    const { error } = await supabase.rpc('attendance_clock_event', {
      p_direction: proxyDir,
      p_source: 'manager_proxy',
      p_lat: lat,
      p_lng: lng,
      p_accuracy_m: acc,
      p_target_user_id: proxyUserId,
      p_manager_reason: proxyReason.trim(),
    });
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    setProxyReason('');
    await invalidateAttendanceCaches().catch(() => null);
  }

  async function voidSickness(absenceId: string) {
    setErr(null);
    setBusyId(`void-${absenceId}`);
    const { error } = await supabase.rpc('sickness_absence_void', {
      p_absence_id: absenceId,
      p_reason_code: voidReason,
      p_notes: voidNotes.trim() || null,
    });
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    setVoidNotes('');
    await invalidateAttendanceCaches().catch(() => null);
    void (async () => {
      const { data } = await supabase
        .from('sickness_absences')
        .select('id, start_date, end_date')
        .eq('org_id', orgId)
        .eq('user_id', sickUser)
        .is('voided_at', null)
        .order('start_date', { ascending: false })
        .limit(40);
      setSickRows((data as { id: string; start_date: string; end_date: string }[]) ?? []);
    })();
  }

  return (
    <div className="space-y-8">
      {err ? <p className="status-banner-error rounded-lg px-3 py-2 text-[13px]">{err}</p> : null}

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Submitted timesheets</h2>
        {rows.length === 0 ? (
          <p className="text-[13px] text-[#6b6b6b]">No submitted weeks awaiting approval.</p>
        ) : (
          <ul className="divide-y divide-[#eee] rounded-xl border border-[#e8e4dc]">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-[#121212]">{r.profiles?.full_name ?? r.user_id}</p>
                  <p className="text-[12px] text-[#6b6b6b]">
                    Week {r.week_start_date} – {r.week_end_date}
                  </p>
                </div>
                <p className="mt-1 text-[13px] text-[#6b6b6b]">
                  Reported: {r.reported_total_minutes ?? 0} minutes
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-[12px] text-[#6b6b6b]">
                    Approve minutes
                    <input
                      type="number"
                      min={0}
                      value={approveMinutes[r.id] ?? ''}
                      onChange={(e) => setApproveMinutes((m) => ({ ...m, [r.id]: e.target.value }))}
                      className="ml-2 w-28 rounded border border-[#d8d8d8] px-2 py-1 text-[13px]"
                    />
                  </label>
                  <label className="text-[12px] text-[#6b6b6b]">
                    Note
                    <input
                      value={note[r.id] ?? ''}
                      onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                      className="ml-2 min-w-[12rem] rounded border border-[#d8d8d8] px-2 py-1 text-[13px]"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void decide(r, 'approve')}
                    className="rounded-lg bg-[#121212] px-3 py-1.5 text-[12.5px] font-medium text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void decide(r, 'reject')}
                    className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 text-[12.5px] text-[#121212]"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Void sickness episode</h2>
        <p className="mb-3 text-[13px] text-[#6b6b6b]">
          Use when an absence was entered in error or needs to be excluded from SSP. This cannot be undone from the UI.
        </p>
        <div className="mb-4 flex max-w-xl flex-wrap gap-3">
          <label className="flex-1 text-[12px] text-[#6b6b6b]">
            Employee
            <select
              value={sickUser}
              onChange={(e) => setSickUser(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
            >
              <option value="">—</option>
              {reports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-[#6b6b6b]">
            Reason code
            <select
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="mt-1 block rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
            >
              <option value="error_entry">Error entry</option>
              <option value="actually_worked">Actually worked / paid another way</option>
              <option value="converted_leave">Converted to leave</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="min-w-[12rem] flex-1 text-[12px] text-[#6b6b6b]">
            Notes
            <input
              value={voidNotes}
              onChange={(e) => setVoidNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
            />
          </label>
        </div>
        <ul className="divide-y divide-[#eee] rounded-xl border border-[#e8e4dc]">
          {!sickUser ? (
            <li className="px-4 py-3 text-[13px] text-[#6b6b6b]">Select an employee to list open sickness episodes.</li>
          ) : sickRows.length === 0 ? (
            <li className="px-4 py-3 text-[13px] text-[#6b6b6b]">No voidable episodes.</li>
          ) : (
            sickRows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span>
                  {s.start_date} – {s.end_date}
                </span>
                <button
                  type="button"
                  disabled={busyId === `void-${s.id}`}
                  onClick={() => void voidSickness(s.id)}
                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-900"
                >
                  Void
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Remote clock (proxy)</h2>
        <p className="mb-3 text-[13px] text-[#6b6b6b]">
          Record a clock-in/out on behalf of staff when they could not use their phone. A reason is required.
        </p>
        <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block flex-1 text-[12px] text-[#6b6b6b]">
            Employee
            <select
              value={proxyUserId}
              onChange={(e) => setProxyUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
            >
              <option value="">—</option>
              {reports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-[#6b6b6b]">
            Direction
            <select
              value={proxyDir}
              onChange={(e) => setProxyDir(e.target.value as 'in' | 'out')}
              className="mt-1 block rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
            >
              <option value="in">In</option>
              <option value="out">Out</option>
            </select>
          </label>
          <label className="min-w-[12rem] flex-1 text-[12px] text-[#6b6b6b]">
            Reason
            <input
              value={proxyReason}
              onChange={(e) => setProxyReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]"
              placeholder="e.g. Site Wi‑Fi failed"
            />
          </label>
          <button
            type="button"
            disabled={busyId === 'proxy'}
            onClick={() => void proxyClock()}
            className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] font-medium text-white"
          >
            Record punch
          </button>
        </div>
      </section>
    </div>
  );
}
