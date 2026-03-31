'use client';

import { canFinalApproveRotaRequests, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import { addWeeks, endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type RequestShiftRef = {
  id: string;
  start_time: string;
  end_time: string;
  role_label: string | null;
  assigneeName: string | null;
};

type ChangeRequestRow = {
  id: string;
  request_type: string;
  status: string;
  note: string | null;
  created_at: string;
  primary_shift_id: string;
  counterparty_shift_id: string | null;
  requested_by: string;
  requester_name?: string | null;
  counterparty_user_id: string | null;
};

type SwapShiftRow = {
  id: string;
  start_time: string;
  end_time: string;
  role_label: string | null;
  user_id: string;
};

type Profile = { id: string; org_id: string; role: ProfileRole; full_name: string };

export function RotaRequestsPanel({
  profile,
  myShifts,
  swapTargets,
  onRefresh,
}: {
  profile: Profile;
  myShifts: RequestShiftRef[];
  swapTargets: RequestShiftRef[];
  onRefresh: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [swapFromId, setSwapFromId] = useState('');
  const [swapToId, setSwapToId] = useState('');
  const [changeShiftId, setChangeShiftId] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [swapWeekStart, setSwapWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [swapWeekRows, setSwapWeekRows] = useState<SwapShiftRow[]>([]);
  const [swapWeekLoading, setSwapWeekLoading] = useState(false);
  const [staffMap, setStaffMap] = useState<Map<string, string>>(new Map());

  const canApprove = canFinalApproveRotaRequests(profile.role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rota_change_requests')
      .select(
        'id, request_type, status, note, created_at, primary_shift_id, counterparty_shift_id, requested_by, counterparty_user_id'
      )
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      const rawRows = (data ?? []) as ChangeRequestRow[];
      const requesterIds = Array.from(
        new Set(rawRows.map((r) => r.requested_by).filter((v): v is string => Boolean(v)))
      );
      const requesterNameById = new Map<string, string>();
      if (requesterIds.length > 0) {
        const { data: requesterRows } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', requesterIds);
        for (const p of requesterRows ?? []) {
          const id = String(p.id ?? '');
          if (!id) continue;
          requesterNameById.set(id, (p.full_name as string | null)?.trim() || 'Member');
        }
      }
      setRows(
        rawRows.map((r) => ({
          ...r,
          requester_name: requesterNameById.get(r.requested_by) ?? 'Member',
        }))
      );
    }
    setLoading(false);
  }, [supabase, profile.org_id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id,full_name')
        .eq('org_id', profile.org_id)
        .eq('status', 'active');
      const next = new Map<string, string>();
      for (const row of data ?? []) {
        const id = (row as { id?: string }).id;
        const name = (row as { full_name?: string }).full_name;
        if (id) next.set(id, name ?? '-');
      }
      setStaffMap(next);
    })();
  }, [supabase, profile.org_id]);

  const loadSwapWeek = useCallback(async () => {
    setSwapWeekLoading(true);
    const from = swapWeekStart.toISOString();
    const to = endOfWeekExclusive(swapWeekStart).toISOString();
    const { data, error } = await supabase
      .from('rota_shifts')
      .select('id,start_time,end_time,role_label,user_id')
      .eq('org_id', profile.org_id)
      .gte('start_time', from)
      .lt('start_time', to)
      .not('user_id', 'is', null)
      .neq('user_id', profile.id)
      .order('start_time');
    if (error) {
      console.error(error);
      setSwapWeekRows([]);
    } else {
      setSwapWeekRows((data ?? []) as SwapShiftRow[]);
    }
    setSwapWeekLoading(false);
  }, [supabase, profile.org_id, profile.id, swapWeekStart]);

  useEffect(() => {
    void loadSwapWeek();
  }, [loadSwapWeek]);

  const approveQueue = rows.filter((r) => r.status === 'pending_final');
  const peerQueue = rows.filter((r) => r.counterparty_user_id === profile.id && r.status === 'pending_peer');
  const mine = rows.filter((r) => r.requested_by === profile.id);

  async function peerAccept(id: string) {
    setMsg(null);
    const { error } = await supabase.rpc('rota_change_request_peer_accept', { p_request_id: id });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      void load();
      onRefresh();
    }
  }

  async function finalApprove(id: string) {
    setMsg(null);
    const { error } = await supabase.rpc('rota_change_request_final_approve', { p_request_id: id });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      void load();
      onRefresh();
    }
  }

  async function finalReject(id: string) {
    const note = window.prompt('Reason (optional)') ?? '';
    setMsg(null);
    const { error } = await supabase.rpc('rota_change_request_final_reject', {
      p_request_id: id,
      p_note: note,
    });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      void load();
      onRefresh();
    }
  }

  async function cancel(id: string) {
    setMsg(null);
    const { error } = await supabase.rpc('rota_change_request_cancel', { p_request_id: id });
    if (error) setMsg(friendlyDbError(error.message));
    else void load();
  }

  async function submitSwap() {
    setMsg(null);
    if (!swapFromId || !swapToId) {
      setMsg('Pick both shifts.');
      return;
    }
    const { error } = await supabase.rpc('rota_change_request_submit_swap', {
      p_primary_shift_id: swapFromId,
      p_counterparty_shift_id: swapToId,
    });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      setSwapFromId('');
      setSwapToId('');
      void load();
    }
  }

  async function submitChange() {
    setMsg(null);
    if (!changeShiftId) {
      setMsg('Pick a shift.');
      return;
    }
    const { data, error } = await supabase.rpc('rota_change_request_submit_change', {
      p_shift_id: changeShiftId,
      p_note: changeNote || null,
    });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      void data;
      setChangeNote('');
      void load();
    }
  }

  function fmtShift(s: RequestShiftRef) {
    const a = new Date(s.start_time).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${a} · ${s.assigneeName ?? 'Open'}${s.role_label ? ` · ${s.role_label}` : ''}`;
  }

  function fmtWeekRange(weekStart: Date): string {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function fmtShiftTime(isoStart: string, isoEnd: string): string {
    const s = new Date(isoStart);
    const e = new Date(isoEnd);
    return `${s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} - ${e.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  const weekDays = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(swapWeekStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [swapWeekStart]);

  const swapRowsByDay = useMemo(() => {
    const by = new Map<string, SwapShiftRow[]>();
    for (const day of weekDays) {
      by.set(day.toDateString(), []);
    }
    for (const r of swapWeekRows) {
      const key = new Date(r.start_time).toDateString();
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(r);
    }
    return by;
  }, [swapWeekRows, weekDays]);

  const selectedSwapShiftLabel = useMemo(() => {
    if (!swapToId) return null;
    const selected = swapWeekRows.find((r) => r.id === swapToId);
    if (!selected) return null;
    const person = staffMap.get(selected.user_id) ?? 'Staff';
    const role = selected.role_label ? ` · ${selected.role_label}` : '';
    return `${fmtShiftTime(selected.start_time, selected.end_time)} · ${person}${role}`;
  }, [swapToId, swapWeekRows, staffMap]);

  const field =
    'mt-1.5 w-full rounded-xl border border-[#d4d2cc] bg-white px-3 py-2.5 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10';
  const btnPrimary =
    'rounded-xl bg-[#121212] px-4 py-2.5 text-[13px] font-semibold text-[#faf9f6] shadow-sm transition hover:bg-[#2d2d2d] active:scale-[0.99]';
  const btnOutline =
    'rounded-xl border border-[#d4d2cc] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#121212] shadow-sm transition hover:bg-[#f7f6f2]';

  return (
    <div className="rounded-2xl border border-[#e4e2dc] bg-white px-5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-8 sm:py-8">
      <h2 className="font-authSerif text-[22px] text-[#121212]">Requests &amp; swaps</h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#5c5c5c]">
        {canApprove
          ? 'Staff submit swaps or unassign requests here. Swaps need the other person to accept first; then you (or any manager / duty manager in the org) can give final approval - not limited to one department.'
          : 'Swaps need the other person to accept, then any manager or duty manager in the organisation can approve. Unassign requests go straight to those approvers.'}
      </p>
      {msg ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900">{msg}</p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div className="space-y-6">
          <h3 className="text-[15px] font-semibold text-[#121212]">Start a request</h3>
          <div className="space-y-4 rounded-2xl border border-[#ebe9e4] bg-[#faf9f6] p-5 sm:p-6">
            <p className="text-[13px] font-semibold text-[#121212]">Swap shifts</p>
            <label className="block text-[13px] font-medium text-[#121212]">
              Your shift
              <select
                className={field}
                value={swapFromId}
                onChange={(e) => setSwapFromId(e.target.value)}
              >
                <option value="">-</option>
                {myShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmtShift(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] font-medium text-[#121212]">
              Their shift
              <select
                className={field}
                value={swapToId}
                onChange={(e) => setSwapToId(e.target.value)}
              >
                <option value="">-</option>
                {swapTargets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmtShift(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-[#e4e2dc] bg-white p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Other staff rota</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => setSwapWeekStart((w) => addWeeks(w, -1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => setSwapWeekStart(startOfWeekMonday(new Date()))}
                  >
                    This week
                  </button>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => setSwapWeekStart((w) => addWeeks(w, 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
              <p className="mb-3 text-[13px] font-medium text-[#121212]">{fmtWeekRange(swapWeekStart)}</p>
              {swapWeekLoading ? (
                <p className="text-[13px] text-[#6b6b6b]">Loading rota...</p>
              ) : (
                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2">
                    {weekDays.map((day) => {
                      const dayRows = swapRowsByDay.get(day.toDateString()) ?? [];
                      return (
                        <div
                          key={day.toISOString()}
                          className="w-[126px] shrink-0 rounded-lg border border-[#ebe9e4] bg-[#faf9f6] p-2"
                        >
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6b6b6b]">
                            {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                          </div>
                          {dayRows.length === 0 ? (
                            <div className="text-[11px] text-[#9b9b9b]">No shifts</div>
                          ) : (
                            <div className="space-y-1.5">
                              {dayRows.map((r) => {
                                const isActive = swapToId === r.id;
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setSwapToId(r.id)}
                                    className={[
                                      'w-full rounded-md border px-2 py-1 text-left text-[11px] transition',
                                      isActive
                                        ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
                                        : 'border-[#d4d2cc] bg-white text-[#121212] hover:bg-[#f5f4f1]',
                                    ].join(' ')}
                                    title="Select this shift for swap"
                                  >
                                    <div className="font-semibold">{fmtShiftTime(r.start_time, r.end_time)}</div>
                                    <div className="truncate">
                                      {staffMap.get(r.user_id) ?? 'Staff'}
                                      {r.role_label ? ` · ${r.role_label}` : ''}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedSwapShiftLabel ? (
                <p className="mt-3 text-[12px] text-[#5c5c5c]">
                  Selected swap target: <span className="font-medium text-[#121212]">{selectedSwapShiftLabel}</span>
                </p>
              ) : null}
            </div>
            <button type="button" className={`${btnPrimary} w-full sm:w-auto`} onClick={() => void submitSwap()}>
              Submit swap request
            </button>
          </div>
          <div className="space-y-4 rounded-2xl border border-[#ebe9e4] bg-[#faf9f6] p-5 sm:p-6">
            <p className="text-[13px] font-semibold text-[#121212]">Request to be unassigned</p>
            <label className="block text-[13px] font-medium text-[#121212]">
              Shift
              <select
                className={field}
                value={changeShiftId}
                onChange={(e) => setChangeShiftId(e.target.value)}
              >
                <option value="">-</option>
                {myShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmtShift(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px] font-medium text-[#121212]">
              Note to approvers
              <textarea
                className={field}
                rows={3}
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
              />
            </label>
            <button type="button" className={`${btnPrimary} w-full sm:w-auto`} onClick={() => void submitChange()}>
              Submit request
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {canApprove && approveQueue.length > 0 ? (
            <div>
              <h3 className="text-[15px] font-semibold text-[#121212]">Awaiting your approval</h3>
              <ul className="mt-3 space-y-2">
                {approveQueue.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d4d2cc] bg-white px-4 py-3 text-[13px]"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-[#121212]">
                        <span className="font-semibold">{r.request_type === 'swap' ? 'Swap' : 'Unassign'}</span>
                        <span className="mx-1.5 text-[#9b9b9b]">·</span>
                        <span>{r.requester_name ?? 'Member'}</span>
                        <span className="mx-1.5 text-[#9b9b9b]">·</span>
                        <span>{new Date(r.created_at).toLocaleDateString()}</span>
                      </p>
                      <p className="max-w-[560px] text-[12.5px] text-[#6b6b6b]">
                        <span className="font-medium text-[#121212]">Reason:</span>{' '}
                        {r.note?.trim() ? r.note.trim() : 'No note provided'}
                      </p>
                    </div>
                    <span className="flex flex-wrap gap-2">
                      <button type="button" className={btnOutline} onClick={() => void finalApprove(r.id)}>
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-red-800 hover:bg-red-50"
                        onClick={() => void finalReject(r.id)}
                      >
                        Reject
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {peerQueue.length > 0 ? (
            <div>
              <h3 className="text-[15px] font-semibold text-[#121212]">Awaiting your OK (swap)</h3>
              <ul className="mt-3 space-y-2">
                {peerQueue.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d4d2cc] bg-white px-4 py-3 text-[13px]"
                  >
                    <span>Swap request · {new Date(r.created_at).toLocaleDateString()}</span>
                    <button type="button" className={btnPrimary} onClick={() => void peerAccept(r.id)}>
                      Accept
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-[#121212]">My recent requests</h3>
              <span className="rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-semibold text-[#6b6b6b]">
                {mine.length} total
              </span>
            </div>
            {loading ? (
              <p className="mt-3 rounded-xl border border-[#ebe9e4] bg-[#faf9f6] px-4 py-3 text-[13px] text-[#6b6b6b]">
                Loading your recent requests...
              </p>
            ) : mine.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[#d8d8d8] bg-[#faf9f6] px-5 py-7 text-center">
                <p className="text-[14px] font-medium text-[#121212]">No requests yet</p>
                <p className="mt-1 text-[13px] text-[#6b6b6b]">
                  Your submitted swap and unassign requests will appear here.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {mine.slice(0, 12).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e2db] bg-[#faf9f6] px-4 py-3 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#d8d8d8] bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.02em] text-[#121212]">
                        {r.request_type === 'swap' ? 'Swap' : 'Unassign'}
                      </span>
                      <span
                        className={[
                          'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                          r.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : r.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : r.status === 'cancelled'
                                ? 'bg-stone-200 text-stone-700'
                                : 'bg-amber-100 text-amber-900',
                        ].join(' ')}
                      >
                        {r.status.replaceAll('_', ' ')}
                      </span>
                      <span className="text-[11.5px] text-[#8a8a8a]">
                        {new Date(r.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {r.status === 'pending_peer' || r.status === 'pending_final' ? (
                      <button type="button" className={btnOutline} onClick={() => void cancel(r.id)}>
                        Cancel
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
