'use client';

import { MemberPermissionOverridesPanel } from '@/components/admin/MemberPermissionOverridesPanel';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  reports_to_user_id: string | null;
  departments: string[];
};

const PAGE = 25;

const ROLE_OPTION_LABEL: Record<string, string> = {
  unassigned: 'Unassigned',
  org_admin: 'Org admin',
  manager: 'Manager',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
  duty_manager: 'Duty manager',
  csa: 'CSA',
  society_leader: 'Society leader',
};

function rolePillClass(role: string): string {
  const m: Record<string, string> = {
    unassigned: 'bg-[#fef3c7] text-[#92400e]',
    org_admin: 'bg-[#1a1a1a] text-[#faf9f6]',
    manager: 'bg-[#14532d] text-[#86efac]',
    coordinator: 'bg-[#3b0764] text-[#d8b4fe]',
    administrator: 'bg-[#431407] text-[#fdba74]',
    duty_manager: 'bg-[#292524] text-[#e7e5e4]',
    csa: 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]',
    society_leader: 'bg-[#fef3c7] text-[#92400e]',
  };
  return m[role] ?? 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]';
}

function statusBadge(status: string) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#166534]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Active
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[11px] font-medium text-[#c2410c]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9b9b]">
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      Inactive
    </span>
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

export function AdminUsersClient({
  currentUserId,
  canEditRoles,
  assignableRoles,
  roleFilterOptions,
  managerChoices,
  initialRows,
  departments,
  defaultFilters,
  orgName,
  orgSlug,
  totalMemberCount,
}: {
  currentUserId: string;
  canEditRoles: boolean;
  assignableRoles: { id: string; key: string; label: string; is_system?: boolean }[];
  /** All tenant roles for URL filter (may include roles you cannot assign). */
  roleFilterOptions: { key: string; label: string }[];
  managerChoices: { id: string; full_name: string }[];
  initialRows: UserRow[];
  departments: { id: string; name: string; type: string; is_archived: boolean }[];
  defaultFilters: { q?: string; dept?: string; status?: string; role?: string };
  orgName: string;
  orgSlug: string;
  totalMemberCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('');
  const [inviteDepts, setInviteDepts] = useState<Set<string>>(new Set());

  const [edit, setEdit] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<string>('');
  const [editDepts, setEditDepts] = useState<Set<string>>(new Set());
  const [editReportsTo, setEditReportsTo] = useState<string>('');

  const [qInput, setQInput] = useState(defaultFilters.q ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDepts = departments.filter((d) => !d.is_archived);
  const [bulkApproveRole, setBulkApproveRole] = useState<string>('');

  const defaultInviteRole = useMemo((): string => {
    return assignableRoles.find((r) => r.key === 'csa')?.key ?? assignableRoles[0]?.key ?? '';
  }, [assignableRoles]);

  const roleLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roleFilterOptions) map.set(r.key, r.label);
    for (const r of assignableRoles) map.set(r.key, r.label);
    return map;
  }, [roleFilterOptions, assignableRoles]);

  const editRoleOptions = useMemo(() => {
    const options = [...assignableRoles];
    if (editRole && !options.some((r) => r.key === editRole)) {
      options.unshift({
        id: `current-${editRole}`,
        key: editRole,
        label: roleLabelByKey.get(editRole) ?? editRole.replace(/_/g, ' '),
        is_system: true,
      });
    }
    return options;
  }, [assignableRoles, editRole, roleLabelByKey]);

  useEffect(() => {
    if (!inviteRole) setInviteRole(defaultInviteRole);
    if (!bulkApproveRole) setBulkApproveRole(defaultInviteRole);
  }, [bulkApproveRole, defaultInviteRole, inviteRole]);

  const filterHref = useCallback(
    (patch: Record<string, string | undefined>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === 'all') p.delete(k);
        else p.set(k, v);
      }
      const s = p.toString();
      return s ? `/admin/users?${s}` : '/admin/users';
    },
    [searchParams]
  );

  useEffect(() => {
    setRows(initialRows);
    setPage(0);
  }, [initialRows]);

  useEffect(() => {
    setQInput(defaultFilters.q ?? '');
  }, [defaultFilters.q]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const inUrl = searchParams.get('q') ?? '';
      if (qInput === inUrl) return;
      router.replace(filterHref({ q: qInput.trim() || undefined }));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [qInput, router, filterHref, searchParams]);

  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  const statusFilter = defaultFilters.status ?? 'all';
  const roleFilter = defaultFilters.role ?? 'all';
  const deptFilter = defaultFilters.dept ?? 'all';
  const inviteHref = `/register?org=${encodeURIComponent(orgSlug)}`;

  function toggleAll() {
    if (selected.size === slice.length) setSelected(new Set());
    else setSelected(new Set(slice.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function bulkApprovePending() {
    const ids = [...selected].filter((id) => rows.find((r) => r.id === id)?.status === 'pending');
    if (!ids.length) return;
    setBusy('bulk');
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(null);
      return;
    }
    for (const id of ids) {
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: true,
        p_rejection_note: null,
        p_role: bulkApproveRole,
      });
      if (error) {
        setMsg(error.message);
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDeactivate() {
    if (!selected.size || !confirm('Deactivate selected users?')) return;
    setBusy('bulk');
    setMsg(null);
    for (const id of selected) {
      const { error } = await supabase.from('profiles').update({ status: 'inactive' }).eq('id', id);
      if (error) {
        setMsg(error.message);
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    setSelected(new Set());
    router.refresh();
  }

  function exportCsv() {
    const lines = [
      ['id', 'full_name', 'email', 'role', 'status', 'departments', 'joined'].join(','),
      ...rows.map((r) =>
        [
          r.id,
          JSON.stringify(r.full_name),
          JSON.stringify(r.email ?? ''),
          r.role,
          r.status,
          JSON.stringify(r.departments.join('; ')),
          r.created_at,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'users-export.csv';
    a.click();
  }

  function openEdit(r: UserRow) {
    setEdit(r);
    setEditRole(r.role);
    setEditReportsTo(r.reports_to_user_id ?? '');
    setEditDepts(new Set());
    void (async () => {
      const { data } = await supabase.from('user_departments').select('dept_id').eq('user_id', r.id);
      setEditDepts(new Set((data ?? []).map((x) => x.dept_id as string)));
    })();
  }

  async function saveEdit() {
    if (!edit) return;
    if (!canEditRoles) return;
    setBusy(edit.id);
    setMsg(null);
    const roleId = assignableRoles.find((r) => r.key === editRole)?.id;
    if (!roleId && editRole !== edit.role) {
      setMsg('Invalid role selected');
      setBusy(null);
      return;
    }
    if (roleId) {
      const assignRes = await fetch('/api/admin/members/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: edit.id, role_id: roleId }),
      });
      const assignData = (await assignRes.json().catch(() => ({}))) as { error?: string };
      if (!assignRes.ok) {
        setMsg(assignData.error ?? 'Could not assign role');
        setBusy(null);
        return;
      }
    }
    const reportsPayload = editReportsTo.trim() ? editReportsTo.trim() : null;
    const reportsRes = await fetch('/api/admin/members/update-reports-to', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: edit.id, reports_to_user_id: reportsPayload }),
    });
    const reportsData = (await reportsRes.json().catch(() => ({}))) as { error?: string };
    if (!reportsRes.ok) {
      setMsg(reportsData.error ?? 'Could not update line manager');
      setBusy(null);
      return;
    }
    await supabase.from('user_departments').delete().eq('user_id', edit.id);
    for (const did of editDepts) {
      const { error: e2 } = await supabase.from('user_departments').insert({ user_id: edit.id, dept_id: did });
      if (e2) {
        setMsg(e2.message);
        setBusy(null);
        return;
      }
    }
    setEdit(null);
    setBusy(null);
    router.refresh();
  }

  function openInviteModal() {
    setMsg(null);
    setSuccessMsg(null);
    setInviteName('');
    setInviteEmail('');
    setInviteRole(defaultInviteRole);
    setInviteDepts(new Set());
    setInviteOpen(true);
  }

  async function submitInvite() {
    setBusy('invite');
    setMsg(null);
    setSuccessMsg(null);
    const res = await fetch('/api/admin/invite-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        full_name: inviteName.trim(),
        role: inviteRole,
        department_ids: [...inviteDepts],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      ok?: boolean;
      sentAccessEmail?: boolean;
      accessEmailChannel?: 'invite' | 'magiclink' | null;
    };
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error ?? 'Invite failed');
      return;
    }
    setInviteOpen(false);
    const addr = inviteEmail.trim();
    if (data.sentAccessEmail) {
      if (data.accessEmailChannel === 'magiclink') {
        setSuccessMsg(
          `Sign-in link sent to ${addr}. They should open the email and use the link to access the app (same email to log in later).`
        );
      } else {
        setSuccessMsg(
          `Invitation email sent to ${addr}. They should open the link, create a password, then they’ll reach the app.`
        );
      }
    } else {
      setSuccessMsg(
        `${addr}: membership was updated, but we could not send an access email (check SITE_URL / NEXT_PUBLIC_SITE_URL and email settings). They can still sign in if they already have an account.`
      );
    }
    router.refresh();
  }

  async function resendAccessEmail(r: UserRow) {
    if (r.id === currentUserId || !r.email?.trim()) return;
    setBusy(`resend:${r.id}`);
    setMsg(null);
    setSuccessMsg(null);
    const res = await fetch('/api/admin/resend-access-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: r.id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      ok?: boolean;
      accessEmailChannel?: 'invite' | 'magiclink';
    };
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error ?? 'Could not resend email');
      return;
    }
    if (data.accessEmailChannel === 'magiclink') {
      setSuccessMsg(`Sign-in link sent again to ${r.email}.`);
    } else {
      setSuccessMsg(`Invitation email sent again to ${r.email}.`);
    }
  }

  async function setUserStatus(id: string, status: string) {
    setBusy(id);
    const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
    setBusy(null);
    if (error) {
      setMsg(error.message);
      return;
    }
    router.refresh();
  }

  async function removeFromOrg(r: UserRow) {
    if (r.id === currentUserId) return;
    const ok = confirm(
      `Remove ${r.full_name} from this organisation? They will lose access here. Their sign-in account stays; they can rejoin only if you invite them or they use your self-signup link again.`
    );
    if (!ok) return;
    setBusy(r.id);
    setMsg(null);
    const { error } = await supabase.rpc('org_admin_remove_member', { p_target: r.id });
    setBusy(null);
    if (error) {
      setMsg(error.message);
      return;
    }
    setSelected((s) => {
      const n = new Set(s);
      n.delete(r.id);
      return n;
    });
    router.refresh();
  }

  function pillClass(active: boolean) {
    return [
      'rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
      active
        ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
        : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:bg-[#f5f4f1]',
    ].join(' ');
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">All Members</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            {totalMemberCount} member{totalMemberCount === 1 ? '' : 's'} across {orgName}
            {rows.length < totalMemberCount ? (
              <span className="text-[#9b9b9b]"> · {rows.length} shown (filters / max 500 loaded)</span>
            ) : null}
          </p>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[#9b9b9b]">
            <strong className="font-medium text-[#6b6b6b]">Email invite</strong> sends a link to accept the invite,
            choose a password, then enter the app with the role and teams you choose.{' '}
            <strong className="font-medium text-[#6b6b6b]">Invite link</strong> still
            opens self-registration: new joiners are <strong className="font-medium text-[#6b6b6b]">Unassigned</strong>{' '}
            and <strong className="font-medium text-[#6b6b6b]">Pending</strong> until an approver sets their role.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => openInviteModal()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
          >
            + Invite by email
          </button>
          <Link
            href={inviteHref}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
          >
            Open self-signup link
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex h-9 w-full max-w-[240px] items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 transition-[box-shadow] focus-within:border-[#121212] focus-within:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]">
          <span className="text-[13px] text-[#9b9b9b]" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search name or email..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
            aria-label="Search members"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => router.push(filterHref({ role: e.target.value }))}
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-2.5 text-[13px] text-[#121212] outline-none"
          aria-label="Filter by role"
        >
          <option value="all">All roles</option>
          <option value="unassigned">{ROLE_OPTION_LABEL.unassigned}</option>
          {roleFilterOptions.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          value={deptFilter}
          onChange={(e) => router.push(filterHref({ dept: e.target.value }))}
          className="h-9 min-w-[160px] rounded-lg border border-[#d8d8d8] bg-white px-2.5 text-[13px] text-[#121212] outline-none"
          aria-label="Filter by department"
        >
          <option value="all">All departments</option>
          {activeDepts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2">
          <Link href={filterHref({ status: 'all' })} className={pillClass(statusFilter === 'all')}>
            All
          </Link>
          <Link href={filterHref({ status: 'active' })} className={pillClass(statusFilter === 'active')}>
            Active
          </Link>
          <Link href={filterHref({ status: 'pending' })} className={pillClass(statusFilter === 'pending')}>
            Pending
          </Link>
          <Link href={filterHref({ status: 'inactive' })} className={pillClass(statusFilter === 'inactive')}>
            Inactive
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-[#6b6b6b]">
          Role when approving
          <select
            value={bulkApproveRole}
            onChange={(e) => setBulkApproveRole(e.target.value)}
            className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-2 text-[13px] text-[#121212]"
            aria-label="Role to assign when bulk approving pending members"
          >
            {assignableRoles.map((r) => (
              <option key={r.id} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void bulkApprovePending()}
          disabled={busy !== null}
          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12.5px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] disabled:opacity-50"
        >
          Approve selected (pending)
        </button>
        <button
          type="button"
          onClick={() => void bulkDeactivate()}
          disabled={busy !== null || !selected.size}
          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12.5px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] disabled:opacity-50"
        >
          Deactivate selected
        </button>
        <button
          type="button"
          onClick={() => exportCsv()}
          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12.5px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
        >
          Export CSV
        </button>
        <Link
          href={filterHref({ q: undefined, status: 'all', role: 'all', dept: 'all' })}
          className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
        >
          Clear filters
        </Link>
      </div>

      {successMsg ? (
        <p className="mb-3 text-sm text-[#15803d]" role="status">
          {successMsg}
        </p>
      ) : null}
      {msg ? <p className="mb-3 text-sm text-[#b91c1c]">{msg}</p> : null}

      <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#d8d8d8]">
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-[#d8d8d8]"
                    checked={slice.length > 0 && selected.size === slice.length}
                    onChange={() => toggleAll()}
                    aria-label="Select all on page"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
                  Member
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
                  Role
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
                  Department(s)
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
                  Status
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
                  Joined
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id} className="border-b border-[#d8d8d8] transition-colors last:border-0 hover:bg-[#f5f4f1]">
                  <td className="px-3 py-3 align-middle">
                    <input
                      type="checkbox"
                      className="rounded border-[#d8d8d8]"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Select ${r.full_name}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] text-[11px] font-semibold text-[#6b6b6b]">
                        {initials(r.full_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[#121212]">{r.full_name}</div>
                        <div className="text-[11.5px] text-[#9b9b9b]">{r.email ?? '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span
                      className={[
                        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        rolePillClass(r.role),
                      ].join(' ')}
                    >
                      {ROLE_OPTION_LABEL[r.role] ?? r.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="max-w-[200px] px-3 py-3 align-middle text-[13px] text-[#6b6b6b]">
                    {r.departments.length ? r.departments.join(', ') : '-'}
                  </td>
                  <td className="px-3 py-3 align-middle">{statusBadge(r.status)}</td>
                  <td className="px-3 py-3 align-middle text-[13px] text-[#6b6b6b]">
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex flex-wrap gap-1.5">
                      {canEditRoles ? (
                        <button
                          type="button"
                          className="rounded-md border border-[#d8d8d8] bg-white px-2 py-1 text-[11.5px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {r.id !== currentUserId && r.email?.trim() ? (
                        <button
                          type="button"
                          className="rounded-md border border-[#d8d8d8] bg-white px-2 py-1 text-[11.5px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] disabled:opacity-50"
                          onClick={() => void resendAccessEmail(r)}
                          disabled={busy !== null}
                          title="Resend invite or magic link to their email"
                        >
                          {busy === `resend:${r.id}` ? 'Sending...' : 'Resend access email'}
                        </button>
                      ) : null}
                      {r.status === 'active' ? (
                        <button
                          type="button"
                          className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-1 text-[11.5px] font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                          onClick={() => void setUserStatus(r.id, 'inactive')}
                          disabled={busy === r.id}
                        >
                          Deactivate
                        </button>
                      ) : r.status === 'inactive' ? (
                        <button
                          type="button"
                          className="rounded-md border border-[#bbf7d0] bg-[#dcfce7] px-2 py-1 text-[11.5px] font-medium text-[#166534] hover:bg-[#bbf7d0]"
                          onClick={() => void setUserStatus(r.id, 'active')}
                          disabled={busy === r.id}
                        >
                          Activate
                        </button>
                      ) : null}
                      {r.id !== currentUserId ? (
                        <button
                          type="button"
                          className="rounded-md border border-[#171717] bg-[#171717] px-2 py-1 text-[11.5px] font-medium text-[#faf9f6] hover:opacity-90 disabled:opacity-50"
                          onClick={() => void removeFromOrg(r)}
                          disabled={busy === r.id}
                        >
                          Remove from org
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {slice.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[#9b9b9b]">No members match these filters.</p>
      ) : null}

      <div className="mt-4 flex items-center gap-2 text-[13px]">
        <button
          type="button"
          disabled={page <= 0}
          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[#6b6b6b] disabled:opacity-40"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <span className="text-[#6b6b6b]">
          Page {page + 1} of {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages - 1}
          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[#6b6b6b] disabled:opacity-40"
          onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
        >
          Next
        </button>
      </div>

      {inviteOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[3px] sm:items-center"
          role="presentation"
          onClick={() => setInviteOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[#d8d8d8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_16px_40px_rgba(0,0,0,0.08)]"
            role="dialog"
            aria-labelledby="invite-member-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#d8d8d8] px-6 py-5">
              <h2 id="invite-member-title" className="font-authSerif text-xl text-[#121212]">
                Invite member
              </h2>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#d8d8d8] text-[#6b6b6b] hover:bg-[#f5f4f1]"
                onClick={() => setInviteOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="mb-4 text-[12.5px] leading-relaxed text-[#6b6b6b]">
                We email them a link to set a password and sign in. Their account is created in your organisation with
                the access level below (departments are optional).
              </p>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Full name
                <input
                  type="text"
                  autoComplete="name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  placeholder="e.g. Alex Smith"
                />
              </label>
              <label className="mt-4 block text-[12.5px] font-medium text-[#6b6b6b]">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  placeholder="name@example.com"
                />
              </label>
              <label className="mt-4 block text-[12.5px] font-medium text-[#6b6b6b]">
                Access level
                <select
                  className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.key}>
                      {r.label}
                      {r.is_system ? ' (predefined)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="mt-4">
                <legend className="text-[12.5px] font-medium text-[#6b6b6b]">
                  Departments <span className="font-normal text-[#9b9b9b]">(optional)</span>
                </legend>
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3">
                  {activeDepts.length === 0 ? (
                    <p className="text-[12.5px] text-[#9b9b9b]">No departments yet - add them under Admin → Departments, then optional teams under Admin → Teams.</p>
                  ) : (
                    activeDepts.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-[#121212]">
                        <input
                          type="checkbox"
                          className="rounded border-[#d8d8d8]"
                          checked={inviteDepts.has(d.id)}
                          onChange={(e) => {
                            setInviteDepts((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(d.id);
                              else n.delete(d.id);
                              return n;
                            });
                          }}
                        />
                        {d.name}
                      </label>
                    ))
                  )}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-col gap-2 border-t border-[#d8d8d8] bg-white px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] sm:order-1"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === 'invite' || !inviteName.trim() || !inviteEmail.trim()}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50 sm:order-2"
                onClick={() => void submitInvite()}
              >
                {busy === 'invite' ? 'Sending...' : 'Send invite email'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[3px] sm:items-center"
          role="presentation"
          onClick={() => setEdit(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[#d8d8d8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_16px_40px_rgba(0,0,0,0.08)]"
            role="dialog"
            aria-labelledby="edit-member-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#d8d8d8] px-6 py-5">
              <h2 id="edit-member-title" className="font-authSerif text-xl text-[#121212]">
                Edit member
              </h2>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#d8d8d8] text-[#6b6b6b] hover:bg-[#f5f4f1]"
                onClick={() => setEdit(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="mb-5 flex items-center gap-3 rounded-lg bg-[#f5f4f1] p-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[14px] font-semibold text-[#faf9f6]">
                  {initials(edit.full_name)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-[#121212]">{edit.full_name}</div>
                  <div className="text-[12px] text-[#9b9b9b]">{edit.email ?? '-'}</div>
                </div>
              </div>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Role
                <select
                  className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={!canEditRoles}
                >
                  {editRoleOptions.map((role) => (
                    <option key={role.id} value={role.key}>
                      {role.label}
                      {!assignableRoles.some((r) => r.key === role.key)
                        ? ' (current role — not assignable by your access)'
                        : role.is_system
                          ? ' (predefined)'
                          : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-[12.5px] font-medium text-[#6b6b6b]">
                Line manager (leave approval)
                <select
                  className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={editReportsTo}
                  onChange={(e) => setEditReportsTo(e.target.value)}
                  disabled={!canEditRoles}
                >
                  <option value="">None (only org admins can approve leave)</option>
                  {managerChoices
                    .filter((m) => m.id !== edit.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset className="mt-4">
                <legend className="text-[12.5px] font-medium text-[#6b6b6b]">Departments</legend>
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3">
                  {activeDepts.map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-[#121212]">
                      <input
                        type="checkbox"
                        className="rounded border-[#d8d8d8]"
                        checked={editDepts.has(d.id)}
                        onChange={(e) => {
                          setEditDepts((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(d.id);
                            else n.delete(d.id);
                            return n;
                          });
                        }}
                        disabled={!canEditRoles}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              {canEditRoles && edit.id !== currentUserId ? (
                <MemberPermissionOverridesPanel targetUserId={edit.id} />
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#d8d8d8] bg-white px-6 py-4">
              <button
                type="button"
                className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === edit.id || !canEditRoles}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
                onClick={() => void saveEdit()}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
