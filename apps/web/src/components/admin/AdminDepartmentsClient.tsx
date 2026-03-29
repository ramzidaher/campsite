'use client';

import type { DeptMemberRow } from '@/lib/departments/loadDepartmentsDirectory';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Dept = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_archived: boolean;
};

type FilterKey = 'all' | 'department' | 'society' | 'club';

type BroadcastPermRow = { permission: string; min_role: string };

type MinRoleOpt = 'manager' | 'coordinator' | 'coordinator_only';

/** Matches `dept_broadcast_permissions.permission` + Plan 02 spec. */
const DEPT_BROADCAST_PERM_DEFS: {
  permission: string;
  label: string;
  hint: string;
  minRoleOptions: MinRoleOpt[];
}[] = [
  {
    permission: 'send_org_wide',
    label: 'Send org-wide',
    hint: 'Authorise org-wide broadcasts that reach every active member (no category pick).',
    minRoleOptions: ['manager', 'coordinator'],
  },
  {
    permission: 'send_no_approval',
    label: 'Send without approval',
    hint: 'Coordinators in this department can publish without manager approval.',
    minRoleOptions: ['coordinator_only'],
  },
  {
    permission: 'edit_others_broadcasts',
    label: 'Edit others’ broadcasts',
    hint: 'Edit posts from other authors in scope for this department.',
    minRoleOptions: ['manager', 'coordinator'],
  },
  {
    permission: 'delete_dept_broadcasts',
    label: 'Delete broadcasts in this department',
    hint: 'Remove any broadcast tied to this department.',
    minRoleOptions: ['manager', 'coordinator'],
  },
  {
    permission: 'delete_org_broadcasts',
    label: 'Delete org-wide broadcasts',
    hint: 'Remove any broadcast across the organisation.',
    minRoleOptions: ['manager'],
  },
  {
    permission: 'pin_broadcasts',
    label: 'Pin broadcasts',
    hint: 'Pin posts to the top of the feed for subscribers.',
    minRoleOptions: ['manager'],
  },
  {
    permission: 'mandatory_broadcast',
    label: 'Mandatory broadcasts',
    hint: 'Mark sends as mandatory so they bypass category subscription filters.',
    minRoleOptions: ['manager'],
  },
];

function minRoleLabel(r: MinRoleOpt): string {
  if (r === 'coordinator_only') return 'Coordinators only';
  if (r === 'coordinator') return 'Managers & coordinators';
  return 'Managers (dept managers)';
}

function typeIcon(t: string) {
  if (t === 'society') return '👥';
  if (t === 'club') return '⚽';
  return '🏢';
}

function typeLabel(t: string) {
  if (t === 'department') return 'Department';
  if (t === 'society') return 'Society';
  if (t === 'club') return 'Club';
  return t;
}

function pillClass(active: boolean) {
  return [
    'rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
    active
      ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
      : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:bg-[#f5f4f1]',
  ].join(' ');
}

export function AdminDepartmentsClient({
  orgId,
  currentUserId,
  isOrgAdmin,
  initialDepartments,
  categoriesByDept,
  teamsByDept,
  memberTeamByDept,
  managersByDept,
  memberCountByDept,
  membersByDept,
  broadcastPermsByDept,
  staffOptions,
}: {
  orgId: string;
  currentUserId: string;
  /** Org admins get full department settings; managers get member management for assigned departments only. */
  isOrgAdmin: boolean;
  initialDepartments: Dept[];
  categoriesByDept: Record<string, { id: string; name: string }[]>;
  teamsByDept: Record<string, { id: string; name: string }[]>;
  memberTeamByDept: Record<string, Record<string, string | null>>;
  managersByDept: Record<string, { user_id: string; full_name: string }[]>;
  memberCountByDept: Record<string, number>;
  membersByDept: Record<string, DeptMemberRow[]>;
  broadcastPermsByDept: Record<string, BroadcastPermRow[]>;
  staffOptions: { id: string; full_name: string; role: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [nName, setNName] = useState('');
  const [nType, setNType] = useState<'department' | 'society' | 'club'>('department');
  const [nDesc, setNDesc] = useState('');

  const [detailDept, setDetailDept] = useState<Dept | null>(null);

  const counts = useMemo(() => {
    const list = initialDepartments;
    return {
      all: list.length,
      department: list.filter((d) => d.type === 'department').length,
      society: list.filter((d) => d.type === 'society').length,
      club: list.filter((d) => d.type === 'club').length,
    };
  }, [initialDepartments]);

  const filteredGrid = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = initialDepartments;
    if (filter !== 'all') list = list.filter((d) => d.type === filter);
    if (s) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(s) ||
          (d.description ?? '').toLowerCase().includes(s) ||
          typeLabel(d.type).toLowerCase().includes(s)
      );
    }
    return list;
  }, [initialDepartments, filter, q]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  async function createDept() {
    if (!nName.trim()) {
      setMsg('Please enter a department name.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('departments').insert({
      org_id: orgId,
      name: nName.trim(),
      type: nType,
      description: nDesc.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setCreateOpen(false);
    setNName('');
    setNDesc('');
    void refresh();
  }

  async function saveDept(d: Dept) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('departments')
      .update({
        name: d.name,
        type: d.type as 'department' | 'society' | 'club',
        description: d.description,
        is_archived: d.is_archived,
      })
      .eq('id', d.id);
    setBusy(false);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function addCategory(deptId: string, name: string) {
    if (!name.trim()) return;
    const { error } = await supabase.from('dept_categories').insert({ dept_id: deptId, name: name.trim() });
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function removeCategory(catId: string) {
    const { error } = await supabase.from('dept_categories').delete().eq('id', catId);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function addManager(deptId: string, userId: string) {
    const { error } = await supabase.from('dept_managers').insert({ dept_id: deptId, user_id: userId });
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function removeManager(deptId: string, userId: string) {
    const { error } = await supabase.from('dept_managers').delete().eq('dept_id', deptId).eq('user_id', userId);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function upsertBroadcastPerm(deptId: string, permission: string, min_role: MinRoleOpt) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('dept_broadcast_permissions').upsert(
      {
        dept_id: deptId,
        permission,
        min_role,
        granted_by: currentUserId,
      },
      { onConflict: 'dept_id,permission' }
    );
    setBusy(false);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function revokeBroadcastPerm(deptId: string, permission: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('dept_broadcast_permissions')
      .delete()
      .eq('dept_id', deptId)
      .eq('permission', permission);
    setBusy(false);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function addDeptMember(deptId: string, userId: string) {
    setMsg(null);
    const { error } = await supabase.from('user_departments').insert({ dept_id: deptId, user_id: userId });
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function removeDeptMember(deptId: string, userId: string) {
    setMsg(null);
    const { error } = await supabase.from('user_departments').delete().eq('dept_id', deptId).eq('user_id', userId);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function addTeam(deptId: string, name: string) {
    if (!name.trim()) return;
    setMsg(null);
    const { error } = await supabase.from('dept_teams').insert({ dept_id: deptId, name: name.trim() });
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function removeTeam(teamId: string) {
    setMsg(null);
    const { error } = await supabase.from('dept_teams').delete().eq('id', teamId);
    if (error) setMsg(error.message);
    else void refresh();
  }

  async function setMemberTeam(deptId: string, userId: string, teamId: string | null) {
    setMsg(null);
    const teamIds = (teamsByDept[deptId] ?? []).map((t) => t.id);
    if (teamIds.length) {
      const { error: delErr } = await supabase.from('user_dept_teams').delete().eq('user_id', userId).in('team_id', teamIds);
      if (delErr) {
        setMsg(delErr.message);
        return;
      }
    }
    if (teamId) {
      const { error } = await supabase.from('user_dept_teams').insert({ user_id: userId, team_id: teamId });
      if (error) setMsg(error.message);
      else void refresh();
    } else {
      void refresh();
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            {isOrgAdmin ? 'Departments' : 'Your departments'}
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            {isOrgAdmin
              ? 'Manage all departments, societies and clubs in your organisation'
              : 'Departments you manage — view members and update who belongs in each'}
          </p>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            {counts.all} total · {counts.department} department{counts.department === 1 ? '' : 's'} ·{' '}
            {counts.society} societ{counts.society === 1 ? 'y' : 'ies'} · {counts.club} club
            {counts.club === 1 ? '' : 's'}
          </p>
        </div>
        {isOrgAdmin ? (
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setCreateOpen(true);
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
          >
            + New Department
          </button>
        ) : null}
      </div>

      {msg ? <p className="mb-4 text-sm text-[#b91c1c]">{msg}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex h-9 w-full max-w-[240px] items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3">
          <span className="text-[13px] text-[#9b9b9b]" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
            aria-label="Search departments"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={pillClass(filter === 'all')} onClick={() => setFilter('all')}>
          All ({counts.all})
        </button>
        <button type="button" className={pillClass(filter === 'department')} onClick={() => setFilter('department')}>
          Departments ({counts.department})
        </button>
        <button type="button" className={pillClass(filter === 'society')} onClick={() => setFilter('society')}>
          Societies ({counts.society})
        </button>
        <button type="button" className={pillClass(filter === 'club')} onClick={() => setFilter('club')}>
          Clubs ({counts.club})
        </button>
      </div>

      {filteredGrid.length === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-[#6b6b6b]">
            {isOrgAdmin ? 'No departments match' : 'No departments assigned'}
          </p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">
            {isOrgAdmin
              ? 'Try another filter or add a new department.'
              : 'Ask an org admin to assign you as a manager on a department.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGrid.map((d) => (
            <DeptGridCard
              key={d.id}
              dept={d}
              memberCount={memberCountByDept[d.id] ?? 0}
              categories={categoriesByDept[d.id] ?? []}
              managers={managersByDept[d.id] ?? []}
              onOpen={() => {
                setMsg(null);
                setDetailDept(d);
              }}
            />
          ))}
        </div>
      )}

      {isOrgAdmin && createOpen ? (
        <ModalOverlay title="New department" onClose={() => setCreateOpen(false)}>
          <div className="grid gap-3">
            <label className="text-[13px] text-[#121212]">
              Name
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#121212]"
                value={nName}
                onChange={(e) => setNName(e.target.value)}
              />
            </label>
            <label className="text-[13px] text-[#121212]">
              Type
              <select
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none"
                value={nType}
                onChange={(e) => setNType(e.target.value as typeof nType)}
              >
                <option value="department">Department</option>
                <option value="society">Society</option>
                <option value="club">Club</option>
              </select>
            </label>
            <label className="text-[13px] text-[#121212]">
              Description
              <textarea
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none"
                rows={3}
                value={nDesc}
                onChange={(e) => setNDesc(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#d8d8d8] pt-4">
            <button
              type="button"
              className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
              onClick={() => void createDept()}
            >
              Create
            </button>
          </div>
        </ModalOverlay>
      ) : null}

      {detailDept ? (
        <ModalOverlay
          wide
          title={detailDept.name}
          subtitle={`${typeLabel(detailDept.type)} · ${memberCountByDept[detailDept.id] ?? 0} members`}
          onClose={() => setDetailDept(null)}
        >
          <DeptDetailForm
            isOrgAdmin={isOrgAdmin}
            dept={detailDept}
            members={membersByDept[detailDept.id] ?? []}
            categories={categoriesByDept[detailDept.id] ?? []}
            teams={teamsByDept[detailDept.id] ?? []}
            memberTeamByUser={memberTeamByDept[detailDept.id] ?? {}}
            managers={managersByDept[detailDept.id] ?? []}
            staffOptions={staffOptions}
            broadcastPerms={broadcastPermsByDept[detailDept.id] ?? []}
            busy={busy}
            onSave={(x) => void saveDept(x)}
            onAddCat={(name) => void addCategory(detailDept.id, name)}
            onRemoveCat={(id) => void removeCategory(id)}
            onAddTeam={(name) => void addTeam(detailDept.id, name)}
            onRemoveTeam={(tid) => void removeTeam(tid)}
            onSetMemberTeam={(uid, tid) => void setMemberTeam(detailDept.id, uid, tid)}
            onAddMgr={(uid) => void addManager(detailDept.id, uid)}
            onRemoveMgr={(uid) => void removeManager(detailDept.id, uid)}
            onUpsertBroadcastPerm={(perm, minRole) => void upsertBroadcastPerm(detailDept.id, perm, minRole)}
            onRevokeBroadcastPerm={(perm) => void revokeBroadcastPerm(detailDept.id, perm)}
            onAddMember={(uid) => void addDeptMember(detailDept.id, uid)}
            onRemoveMember={(uid) => void removeDeptMember(detailDept.id, uid)}
          />
        </ModalOverlay>
      ) : null}
    </div>
  );
}

function DeptGridCard({
  dept,
  memberCount,
  categories,
  managers,
  onOpen,
}: {
  dept: Dept;
  memberCount: number;
  categories: { id: string; name: string }[];
  managers: { user_id: string; full_name: string }[];
  onOpen: () => void;
}) {
  const catNames = categories.map((c) => c.name);
  const show = catNames.slice(0, 3);
  const more = catNames.length - show.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={[
        'cursor-pointer rounded-xl border border-[#d8d8d8] bg-white p-[18px] text-left transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_12px_rgba(0,0,0,0.04)]',
        dept.is_archived ? 'opacity-75' : '',
      ].join(' ')}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border border-[#d8d8d8] bg-[#f5f4f1] text-[18px]">
          {typeIcon(dept.type)}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
            {typeLabel(dept.type)}
          </span>
          {dept.is_archived ? (
            <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#991b1b]">
              Archived
            </span>
          ) : null}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="font-authSerif text-[22px] leading-none text-[#121212]">{memberCount}</div>
      <div className="mb-1 text-[12px] text-[#9b9b9b]">members</div>
      <div className="text-[14px] font-medium text-[#121212]">{dept.name}</div>
      <div className="mt-1 text-[12px] text-[#6b6b6b]">
        {managers.length ? <>Managed by {managers.map((m) => m.full_name).join(', ')}</> : 'No assigned manager'}
      </div>
      {catNames.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {show.map((c) => (
            <span
              key={c}
              className="rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2 py-0.5 text-[10.5px] text-[#9b9b9b]"
            >
              {c}
            </span>
          ))}
          {more > 0 ? (
            <span className="rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2 py-0.5 text-[10.5px] text-[#9b9b9b]">
              +{more} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModalOverlay({
  title,
  subtitle,
  wide,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dept-modal-title"
        className={[
          'max-h-[min(90vh,800px)] w-full overflow-y-auto rounded-xl border border-[#d8d8d8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.07)]',
          wide ? 'max-w-2xl' : 'max-w-lg',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#d8d8d8] px-6 py-4">
          <div>
            <h2 id="dept-modal-title" className="font-authSerif text-[19px] tracking-tight text-[#121212]">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[15px] leading-none text-[#9b9b9b] hover:bg-[#f5f4f1] hover:text-[#121212]"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DeptDetailForm({
  isOrgAdmin,
  dept,
  members,
  categories,
  teams,
  memberTeamByUser,
  managers,
  staffOptions,
  broadcastPerms,
  busy,
  onSave,
  onAddCat,
  onRemoveCat,
  onAddTeam,
  onRemoveTeam,
  onSetMemberTeam,
  onAddMgr,
  onRemoveMgr,
  onUpsertBroadcastPerm,
  onRevokeBroadcastPerm,
  onAddMember,
  onRemoveMember,
}: {
  isOrgAdmin: boolean;
  dept: Dept;
  members: DeptMemberRow[];
  categories: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  memberTeamByUser: Record<string, string | null>;
  managers: { user_id: string; full_name: string }[];
  staffOptions: { id: string; full_name: string; role: string }[];
  broadcastPerms: BroadcastPermRow[];
  busy: boolean;
  onSave: (d: Dept) => void;
  onAddCat: (name: string) => void;
  onRemoveCat: (id: string) => void;
  onAddTeam: (name: string) => void;
  onRemoveTeam: (teamId: string) => void;
  onSetMemberTeam: (userId: string, teamId: string | null) => void;
  onAddMgr: (userId: string) => void;
  onRemoveMgr: (userId: string) => void;
  onUpsertBroadcastPerm: (permission: string, minRole: MinRoleOpt) => void;
  onRevokeBroadcastPerm: (permission: string) => void;
  onAddMember: (userId: string) => void;
  onRemoveMember: (userId: string) => void;
}) {
  const [edit, setEdit] = useState(dept);
  const [catName, setCatName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [mgrPick, setMgrPick] = useState('');
  const [memberPick, setMemberPick] = useState('');

  useEffect(() => {
    setEdit(dept);
  }, [dept]);

  return (
    <>
      {!isOrgAdmin ? (
        <p className="mb-4 text-[12px] leading-snug text-[#6b6b6b]">
          Name, categories, broadcast rules and department managers are managed by an org admin. You can add or remove
          members for this department below.
        </p>
      ) : null}

      {isOrgAdmin ? (
        <>
          <div className="grid gap-3">
            <label className="text-[13px] text-[#121212]">
              Name
              <input
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label className="text-[13px] text-[#121212]">
              Type
              <select
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none"
                value={edit.type}
                onChange={(e) => setEdit({ ...edit, type: e.target.value })}
              >
                <option value="department">Department</option>
                <option value="society">Society</option>
                <option value="club">Club</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#121212]">
              <input
                type="checkbox"
                className="rounded border-[#d8d8d8]"
                checked={edit.is_archived}
                onChange={(e) => setEdit({ ...edit, is_archived: e.target.checked })}
              />
              Archived
            </label>
            <label className="text-[13px] text-[#121212]">
              Description
              <textarea
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none"
                rows={3}
                value={edit.description ?? ''}
                onChange={(e) => setEdit({ ...edit, description: e.target.value || null })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-4 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
            onClick={() => onSave(edit)}
          >
            Save department
          </button>
        </>
      ) : null}

      <div className={`${isOrgAdmin ? 'mt-6' : ''} border-t border-[#d8d8d8] pt-4`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Sub-teams</p>
        <p className="mt-1 text-[12px] leading-snug text-[#9b9b9b]">
          Optional groups for targeted broadcasts. Add teams here, then assign members in the list below.
        </p>
        {teams.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#9b9b9b]">{isOrgAdmin ? 'No sub-teams yet.' : 'No sub-teams defined.'}</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="text-[#6b6b6b]">{t.name}</span>
                {isOrgAdmin ? (
                  <button
                    type="button"
                    className="text-[12px] text-[#b91c1c] hover:underline"
                    onClick={() => onRemoveTeam(t.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isOrgAdmin ? (
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
              placeholder="New sub-team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
              onClick={() => {
                onAddTeam(teamName);
                setTeamName('');
              }}
            >
              Add
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 border-t border-[#d8d8d8] pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Members</p>
        <p className="mt-1 text-[12px] leading-snug text-[#9b9b9b]">
          People linked to this department for broadcasts, rota and approvals. Removing them here does not deactivate
          their account.
        </p>
        <ul className="mt-2 max-h-[220px] space-y-1.5 overflow-y-auto text-[13px]">
          {members.length === 0 ? (
            <li className="text-[#9b9b9b]">No members yet.</li>
          ) : (
            members.map((m) => (
              <li key={m.user_id} className="flex flex-col gap-1.5 rounded-md py-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 text-[#121212]">
                  <span className="font-medium">{m.full_name}</span>
                  <span className="ml-2 text-[11px] text-[#9b9b9b]">{m.role}</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {isOrgAdmin && teams.length > 0 ? (
                    <select
                      className="max-w-[200px] rounded-lg border border-[#d8d8d8] bg-white px-2 py-1 text-[12px] text-[#121212]"
                      value={memberTeamByUser[m.user_id] ?? ''}
                      onChange={(e) =>
                        onSetMemberTeam(m.user_id, e.target.value ? e.target.value : null)
                      }
                      aria-label={`Sub-team for ${m.full_name}`}
                    >
                      <option value="">No sub-team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="shrink-0 text-[12px] text-[#b91c1c] hover:underline"
                    onClick={() => onRemoveMember(m.user_id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="mt-2 flex gap-2">
          <select
            className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
            value={memberPick}
            onChange={(e) => setMemberPick(e.target.value)}
            aria-label="Add member"
          >
            <option value="">Add member…</option>
            {staffOptions
              .filter((s) => !members.some((m) => m.user_id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.role})
                </option>
              ))}
          </select>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
            onClick={() => {
              if (memberPick) {
                onAddMember(memberPick);
                setMemberPick('');
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      {isOrgAdmin ? (
        <>
          <div className="mt-6 border-t border-[#d8d8d8] pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Broadcast permissions</p>
        <p className="mt-1 text-[12px] leading-snug text-[#9b9b9b]">
          Off by default. Grants extra broadcast powers for this department; baseline role rules still apply.
        </p>
        <ul className="mt-3 space-y-3">
          {DEPT_BROADCAST_PERM_DEFS.map((def) => {
            const row = broadcastPerms.find((p) => p.permission === def.permission);
            const enabled = Boolean(row);
            const minRole = (row?.min_role as MinRoleOpt | undefined) ?? def.minRoleOptions[0];
            const safeMin = def.minRoleOptions.includes(minRole) ? minRole : def.minRoleOptions[0];
            return (
              <li
                key={def.permission}
                className="rounded-lg border border-[#eceae6] bg-[#faf9f6] px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:items-center sm:justify-between">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-[#d8d8d8]"
                      checked={enabled}
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.checked) onUpsertBroadcastPerm(def.permission, def.minRoleOptions[0]);
                        else onRevokeBroadcastPerm(def.permission);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[#121212]">{def.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-[#6b6b6b]">{def.hint}</span>
                    </span>
                  </label>
                  {enabled && def.minRoleOptions.length > 1 ? (
                    <select
                      className="w-full shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-1.5 text-[12px] text-[#121212] sm:w-[200px]"
                      value={safeMin}
                      disabled={busy}
                      onChange={(e) =>
                        onUpsertBroadcastPerm(def.permission, e.target.value as MinRoleOpt)
                      }
                      aria-label={`Minimum role for ${def.label}`}
                    >
                      {def.minRoleOptions.map((r) => (
                        <option key={r} value={r}>
                          {minRoleLabel(r)}
                        </option>
                      ))}
                    </select>
                  ) : enabled ? (
                    <span className="shrink-0 rounded-md border border-[#d8d8d8] bg-white px-2 py-1 text-[11px] text-[#6b6b6b]">
                      {minRoleLabel(def.minRoleOptions[0])}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6 border-t border-[#d8d8d8] pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Broadcast categories</p>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-[#6b6b6b]">{c.name}</span>
              <button
                type="button"
                className="text-[12px] text-[#b91c1c] hover:underline"
                onClick={() => onRemoveCat(c.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
            placeholder="New category"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
            onClick={() => {
              onAddCat(catName);
              setCatName('');
            }}
          >
            Add
          </button>
        </div>
      </div>
        </>
      ) : null}

      <div className="mt-6 border-t border-[#d8d8d8] pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Managers</p>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          {isOrgAdmin
            ? 'Assign who can approve and manage this department.'
            : 'Assigned by an org admin. Contact them to change department managers.'}
        </p>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {managers.length === 0 ? (
            <li className="text-[#9b9b9b]">No assigned manager</li>
          ) : (
            managers.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2">
                <span className="text-[#6b6b6b]">{m.full_name}</span>
                {isOrgAdmin ? (
                  <button
                    type="button"
                    className="text-[12px] text-[#b91c1c] hover:underline"
                    onClick={() => onRemoveMgr(m.user_id)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
        {isOrgAdmin ? (
          <div className="mt-2 flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
              value={mgrPick}
              onChange={(e) => setMgrPick(e.target.value)}
            >
              <option value="">Add manager…</option>
              {staffOptions
                .filter((s) => !managers.some((m) => m.user_id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role})
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
              onClick={() => {
                if (mgrPick) {
                  onAddMgr(mgrPick);
                  setMgrPick('');
                }
              }}
            >
              Add
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
