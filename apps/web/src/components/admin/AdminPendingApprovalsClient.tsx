'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import type { PendingApprovalRow } from '@/lib/admin/loadPendingApprovals';
import { rolesAssignableOnApprove, type ProfileRole } from '@campsite/types';

const ROLE_LABEL: Record<string, string> = {
  unassigned: 'Unassigned',
  org_admin: 'Org admin',
  manager: 'Manager',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
  duty_manager: 'Duty manager',
  csa: 'CSA',
  society_leader: 'Society leader',
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function roleLine(role: string) {
  return ROLE_LABEL[role] ?? role.replace(/_/g, ' ');
}

function metaLine(p: PendingApprovalRow) {
  const dept = p.departments.length ? p.departments.join(' · ') : 'No department';
  return `${dept} · ${roleLine(p.role)}`;
}

export function AdminPendingApprovalsClient({
  initialRows,
  orgId,
  showApproveAll,
  viewerRole,
}: {
  initialRows: PendingApprovalRow[];
  orgId: string;
  showApproveAll: boolean;
  viewerRole: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initialRows);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [bulkAllBusy, setBulkAllBusy] = useState(false);
  const [approveRoleById, setApproveRoleById] = useState<Record<string, ProfileRole>>({});
  const [bulkApproveRole, setBulkApproveRole] = useState<ProfileRole>('csa');

  const assignableRoles = useMemo(() => rolesAssignableOnApprove(viewerRole), [viewerRole]);
  const defaultApproveRole = useMemo((): ProfileRole => {
    if (assignableRoles.includes('csa')) return 'csa';
    return assignableRoles[0] ?? 'csa';
  }, [assignableRoles]);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(s) ||
        (r.email ?? '').toLowerCase().includes(s) ||
        metaLine(r).toLowerCase().includes(s)
    );
  }, [rows, q]);

  async function refresh() {
    router.refresh();
  }

  async function approve(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const rolePick = approveRoleById[id] ?? defaultApproveRole;
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: true,
        p_rejection_note: null,
        p_role: rolePick,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      setRejectingId(null);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: false,
        p_rejection_note: note[id]?.trim() ? note[id]!.trim() : null,
        p_role: null,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      setRejectingId(null);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function approveAllPending() {
    if (!confirm('Approve all pending members in this organisation?')) return;
    setBulkAllBusy(true);
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBulkAllBusy(false);
      return;
    }
    const { data: pendingRows } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'pending');
    const ids = (pendingRows ?? []).map((r) => r.id as string);
    for (const id of ids) {
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: true,
        p_rejection_note: null,
        p_role: bulkApproveRole,
      });
      if (error) {
        setMsg(error.message);
        setBulkAllBusy(false);
        return;
      }
    }
    setBulkAllBusy(false);
    setRows([]);
    void refresh();
  }

  const count = rows.length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Pending verifications
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Approve or reject new registrations before they can use the app.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/users?status=pending"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
          >
            Manage in Users
          </Link>
        </div>
      </div>

      {showApproveAll && count > 0 ? (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-[13px] text-[#6b6b6b]">
            <span className="font-medium text-[#121212]">{count}</span> awaiting verification. You can approve
            everyone in one step.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-[#6b6b6b]">
              Role for all
              <select
                value={bulkApproveRole}
                onChange={(e) => setBulkApproveRole(e.target.value as ProfileRole)}
                className="h-9 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-2 text-[13px] text-[#121212]"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={bulkAllBusy}
              onClick={() => void approveAllPending()}
              className="shrink-0 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {bulkAllBusy ? 'Working…' : 'Approve all pending'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex h-9 w-full max-w-[280px] items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3">
        <span className="text-[13px] text-[#9b9b9b]" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
          aria-label="Search pending members"
        />
      </div>

      {msg ? <p className="mb-4 text-sm text-[#b91c1c]">{msg}</p> : null}

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#d8d8d8] px-[18px] py-4">
          <div className="flex items-center gap-2 text-[14px] font-medium text-[#121212]">
            Pending verifications
            {count > 0 ? (
              <span className="rounded-full bg-[#E11D48] px-[7px] py-0.5 text-[10.5px] font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </div>
          <Link href="/admin/users" className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
            View all members →
          </Link>
        </div>

        {filtered.length === 0 ? (
          <p className="px-[18px] py-12 text-center text-[13px] text-[#9b9b9b]">
            {rows.length === 0 ? 'No pending registrations. You’re all caught up.' : 'No matches for your search.'}
          </p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((p) => {
              const openReject = rejectingId === p.id;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 border-b border-[#d8d8d8] px-[18px] py-3 transition-colors last:border-b-0 hover:bg-[#f5f4f1]/80 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] text-[12px] font-semibold text-[#121212]">
                      {initials(p.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-[#121212]">{p.full_name}</div>
                      <div className="text-[12.5px] text-[#6b6b6b]">{metaLine(p)}</div>
                      <div className="mt-0.5 text-[11px] text-[#9b9b9b]">
                        {p.email ?? '—'} · Requested {new Date(p.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {openReject ? (
                    <div className="flex w-full flex-col gap-2 sm:max-w-[280px] sm:shrink-0">
                      <label className="text-[11px] text-[#6b6b6b]">
                        Rejection note (optional)
                        <input
                          className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-1.5 text-[13px] text-[#121212] outline-none"
                          value={note[p.id] ?? ''}
                          onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === p.id}
                          className="rounded-lg bg-[#b91c1c] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
                          onClick={() => void reject(p.id)}
                        >
                          Confirm reject
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#6b6b6b]"
                          onClick={() => setRejectingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      <select
                        value={approveRoleById[p.id] ?? defaultApproveRole}
                        onChange={(e) =>
                          setApproveRoleById((m) => ({ ...m, [p.id]: e.target.value as ProfileRole }))
                        }
                        className="h-9 min-w-[140px] rounded-lg border border-[#d8d8d8] bg-white px-2 text-[12px] text-[#121212]"
                        aria-label="Role when approving"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r] ?? r}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="Approve"
                        disabled={busy === p.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#15803d] text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        onClick={() => void approve(p.id)}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        title="Reject"
                        disabled={busy === p.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#b91c1c] bg-white text-[15px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fef2f2] disabled:opacity-50"
                        onClick={() => setRejectingId(p.id)}
                      >
                        ✕
                      </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
