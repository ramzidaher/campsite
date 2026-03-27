'use client';

import { rolesAssignableOnApprove, type ProfileRole } from '@campsite/types';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
  departments: string[];
};

export function PendingApprovalsClient({
  initial,
  viewerRole,
}: {
  initial: PendingRow[];
  /** Used to explain scoped queue for managers/coordinators vs org-wide admin list. */
  viewerRole: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [note, setNote] = useState<Record<string, string>>({});
  const [approveRoleById, setApproveRoleById] = useState<Record<string, ProfileRole>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const assignableRoles = useMemo(() => rolesAssignableOnApprove(viewerRole), [viewerRole]);
  const defaultApproveRole = useMemo((): ProfileRole => {
    if (assignableRoles.includes('csa')) return 'csa';
    return assignableRoles[0] ?? 'csa';
  }, [assignableRoles]);

  async function refresh() {
    router.refresh();
  }

  async function approve(id: string) {
    setBusy(id);
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
        alert(error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
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
        alert(error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    const scoped = viewerRole === 'manager' || viewerRole === 'coordinator';
    return (
      <div className="mt-6 space-y-2 text-sm text-[var(--campsite-text-secondary)]">
        <p>No pending registrations.</p>
        {scoped ? (
          <p className="text-xs leading-relaxed text-[var(--campsite-text-muted)]">
            You only see people who picked at least one department you manage (managers) or belong to
            (coordinators). New joiners who chose other teams appear for your{' '}
            <strong className="font-medium text-[var(--campsite-text-secondary)]">organisation admin</strong>{' '}
            under Admin → Pending approval or All members (filter: Pending).
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {rows.map((p) => (
        <li
          key={p.id}
          className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-4"
        >
          <p className="font-medium text-[var(--campsite-text)]">{p.full_name}</p>
          <p className="text-sm text-[var(--campsite-text-secondary)]">{p.email ?? '—'}</p>
          <p className="mt-1 text-xs text-[var(--campsite-text-muted)]">
            Requested {new Date(p.created_at).toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
            Departments: {p.departments.length ? p.departments.join(', ') : '—'}
          </p>
          <label className="mt-3 block text-xs text-[var(--campsite-text-secondary)]">
            Role after approval
            <select
              className="mt-1 block w-full max-w-xs rounded border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-1.5 text-sm"
              value={approveRoleById[p.id] ?? defaultApproveRole}
              onChange={(e) =>
                setApproveRoleById((m) => ({ ...m, [p.id]: e.target.value as ProfileRole }))
              }
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs">
            Rejection note (optional)
            <input
              className="mt-1 w-full rounded border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-1 text-sm"
              value={note[p.id] ?? ''}
              onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === p.id}
              className="rounded-lg bg-[var(--campsite-success)] px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void approve(p.id)}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy === p.id}
              className="rounded-lg bg-[var(--campsite-warning)] px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void reject(p.id)}
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
