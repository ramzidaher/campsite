'use client';

import { canFinalApproveRotaRequests, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
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
  counterparty_user_id: string | null;
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
      setRows((data ?? []) as ChangeRequestRow[]);
    }
    setLoading(false);
  }, [supabase, profile.org_id]);

  useEffect(() => {
    void load();
  }, [load]);

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
                    <span className="text-[#121212]">
                      {r.request_type === 'swap' ? 'Swap' : 'Unassign'} ·{' '}
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
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
            <h3 className="text-[15px] font-semibold text-[#121212]">My recent requests</h3>
            {loading ? (
              <p className="mt-3 text-[13px] text-[#6b6b6b]">Loading...</p>
            ) : mine.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#6b6b6b]">None yet - your submitted requests will show here.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mine.slice(0, 12).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ebe9e4] bg-[#faf9f6] px-4 py-3 text-[13px]"
                  >
                    <span>
                      {r.request_type} · {r.status}
                    </span>
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
