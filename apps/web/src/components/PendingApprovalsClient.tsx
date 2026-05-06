'use client';

import { FormSelect } from '@campsite/ui/web';
import { rolesAssignableOnApprove } from '@campsite/types';
import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, Search, X } from 'lucide-react';

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

export type PendingRow = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  /** Requested role on registration (informational). */
  role: string;
  departments: string[];
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

function metaLine(p: PendingRow) {
  const dept = p.departments.length ? p.departments.join(' · ') : 'No department';
  return `${dept} · ${roleLine(p.role)}`;
}

export function PendingApprovalsClient({
  initial,
  viewerRole,
}: {
  initial: PendingRow[];
  viewerRole: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [note, setNote] = useState<Record<string, string>>({});
  const [approveRoleById, setApproveRoleById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [apiAssignable, setApiAssignable] = useState<{ key: string; label: string; is_system: boolean }[] | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/admin/members/assignable-roles', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        roles?: { key: string; label: string; is_system: boolean }[];
      };
      if (res.ok && Array.isArray(data.roles)) setApiAssignable(data.roles);
    })();
  }, []);

  const legacyAssignable = useMemo(() => rolesAssignableOnApprove(viewerRole), [viewerRole]);

  const assignableRoles = useMemo(() => {
    if (apiAssignable?.length) return apiAssignable.map((r) => r.key);
    return legacyAssignable;
  }, [apiAssignable, legacyAssignable]);

  const assignableOptions = useMemo(() => {
    if (apiAssignable?.length) {
      return apiAssignable.map((r) => ({
        key: r.key,
        label: `${r.label}${r.is_system ? ' (predefined)' : ''}`,
      }));
    }
    return legacyAssignable.map((key) => ({ key, label: ROLE_LABEL[key] ?? key }));
  }, [apiAssignable, legacyAssignable]);

  const defaultApproveRole = useMemo((): string => {
    if (assignableRoles.includes('csa')) return 'csa';
    return assignableRoles[0] ?? 'csa';
  }, [assignableRoles]);

  useEffect(() => {
    setRows(initial);
    setRejectingId(null);
    setMsg(null);
  }, [initial]);

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
      const supabase = createClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
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
      await invalidateClientCaches({ scopes: ['org-members'], shellUserIds: [id] }).catch(() => null);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const supabase = createClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
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
      await invalidateClientCaches({ scopes: ['org-members'], shellUserIds: [id] }).catch(() => null);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  const scoped = viewerRole === 'manager' || viewerRole === 'coordinator';
  const count = rows.length;

  if (!rows.length) {
    return (
      <div className="overflow-hidden rounded-xl border border-campsite-border bg-campsite-elevated">
        <div className="border-b border-campsite-border px-[18px] py-4">
          <div className="flex items-center gap-2 text-[14px] font-medium text-campsite-text">
            Pending verifications
            <span className="rounded-full bg-[#d8d8d8] px-[7px] py-0.5 text-[10.5px] font-semibold text-campsite-text-secondary">
              0
            </span>
          </div>
        </div>
        <div className="px-[18px] py-12 text-center">
          <p className="text-[15px] font-medium text-campsite-text">No pending registrations</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-campsite-text-secondary">
            You&apos;re all caught up. New joiners will show here when they request access.
          </p>
          {scoped ? (
            <div className="mx-auto mt-6 max-w-lg rounded-xl border border-campsite-border bg-campsite-bg px-4 py-3 text-left text-[12.5px] leading-relaxed text-campsite-text-secondary">
              <p className="font-medium text-campsite-text">Scoped to your departments</p>
              <p className="mt-1.5">
                You only see people who picked at least one department you manage (managers) or belong to
                (coordinators). Joiners who chose other teams appear for your{' '}
                <span className="font-medium text-campsite-text">organisation admin</span> under Admin → Pending
                approval or All members (filter: Pending).
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex h-9 w-full max-w-[280px] items-center gap-2 rounded-lg border border-campsite-border bg-campsite-surface px-3">
        <Search className="h-3.5 w-3.5 text-campsite-text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or department..."
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-campsite-text outline-none placeholder:text-campsite-text-muted"
          aria-label="Search pending members"
        />
      </div>

      {msg ? (
        <p className="status-banner-error mb-4 rounded-lg px-3 py-2 text-[13px]" role="alert">
          {msg}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-campsite-border bg-campsite-elevated">
        <div className="flex items-center justify-between gap-3 border-b border-campsite-border px-[18px] py-4">
          <div className="flex items-center gap-2 text-[14px] font-medium text-campsite-text">
            Pending verifications
            <span className="rounded-full bg-[#E11D48] px-[7px] py-0.5 text-[10.5px] font-bold text-white">
              {count > 99 ? '99+' : count}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-[18px] py-12 text-center text-[13px] text-campsite-text-muted">No matches for your search.</p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((p) => {
              const openReject = rejectingId === p.id;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 border-b border-campsite-border px-[18px] py-3 transition-colors last:border-b-0 hover:bg-campsite-surface/80 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-campsite-border bg-campsite-surface text-[12px] font-semibold text-campsite-text">
                      {initials(p.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-campsite-text">{p.full_name}</div>
                      <div className="text-[12.5px] text-campsite-text-secondary">{metaLine(p)}</div>
                      <div className="mt-0.5 text-[11px] text-campsite-text-muted">
                        {p.email ?? '-'} · Requested {new Date(p.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {openReject ? (
                    <div className="flex w-full flex-col gap-2 sm:max-w-[280px] sm:shrink-0">
                      <label className="text-[11px] text-campsite-text-secondary">
                        Rejection note (optional)
                        <input
                          className="mt-1 w-full rounded-lg border border-campsite-border bg-campsite-elevated px-2.5 py-1.5 text-[13px] text-campsite-text outline-none focus:ring-1 focus:ring-campsite-text"
                          value={note[p.id] ?? ''}
                          onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === p.id}
                          className="rounded-lg bg-campsite-warning px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          onClick={() => void reject(p.id)}
                        >
                          Confirm reject
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-campsite-border bg-campsite-elevated px-3 py-1.5 text-[12.5px] font-medium text-campsite-text-secondary hover:bg-campsite-bg"
                          onClick={() => setRejectingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      <label className="sr-only" htmlFor={`approve-role-${p.id}`}>
                        Role after approval
                      </label>
                      <FormSelect
                        id={`approve-role-${p.id}`}
                        value={approveRoleById[p.id] ?? defaultApproveRole}
                        onChange={(e) =>
                          setApproveRoleById((m) => ({ ...m, [p.id]: e.target.value }))
                        }
                        className="h-9 min-w-[160px] rounded-lg border border-campsite-border bg-campsite-elevated px-2.5 text-[12px] text-campsite-text outline-none focus:ring-1 focus:ring-campsite-text"
                      >
                        {assignableOptions.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </FormSelect>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Approve"
                          disabled={busy === p.id}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-campsite-success text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          onClick={() => void approve(p.id)}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          title="Reject"
                          disabled={busy === p.id}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-campsite-warning bg-campsite-elevated text-[15px] font-semibold text-campsite-warning transition-colors hover:bg-[#fef2f2] disabled:opacity-50"
                          onClick={() => setRejectingId(p.id)}
                        >
                          <X className="h-4 w-4" aria-hidden />
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
