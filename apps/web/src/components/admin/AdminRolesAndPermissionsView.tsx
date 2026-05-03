'use client';

import { FormSelect } from '@campsite/ui/web';
import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
import { validateCustomRolePermissionKeys } from '@/lib/authz/validateCustomRolePermissions';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type RoleRow = {
  id: string;
  key: string;
  label: string;
  description: string;
  is_system: boolean;
  is_archived: boolean;
  source_preset_id?: string | null;
  source_catalog_version_no?: number | null;
  org_role_permissions: { permission_key: string }[];
};

type PermissionRow = {
  key: string;
  label: string;
  description: string;
  is_founder_only: boolean;
};

type RolePresetRow = {
  id: string;
  source_version_no: number;
  key: string;
  name: string;
  description: string;
  target_use_case: string;
  recommended_permission_keys: string[];
};

const PERMISSION_GROUPS: { key: string; title: string }[] = [
  { key: 'members', title: 'Members' },
  { key: 'approvals', title: 'Approvals' },
  { key: 'roles', title: 'Roles' },
  { key: 'departments', title: 'Departments' },
  { key: 'teams', title: 'Teams' },
  { key: 'broadcasts', title: 'Broadcasts' },
  { key: 'rota', title: 'Rota' },
  { key: 'discounts', title: 'Discounts' },
  { key: 'org.settings', title: 'Organisation Settings' },
  { key: 'integrations', title: 'Integrations' },
  { key: 'recruitment', title: 'Recruitment' },
  { key: 'jobs', title: 'Jobs' },
  { key: 'applications', title: 'Applications' },
  { key: 'offers', title: 'Offers' },
  { key: 'interviews', title: 'Interviews' },
];

const HR_DOCUMENT_PERMISSION_KEYS = [
  'hr.employee_photo.view_all',
  'hr.employee_photo.manage_all',
  'hr.employee_photo.view_own',
  'hr.employee_photo.upload_own',
  'hr.employee_photo.delete_own',
  'hr.id_document.view_all',
  'hr.id_document.manage_all',
  'hr.id_document.view_own',
  'hr.id_document.upload_own',
  'hr.id_document.delete_own',
] as const;

const PAYROLL_TAX_DOCUMENT_PERMISSION_KEYS = [
  'payroll.tax_docs.view_all',
  'payroll.tax_docs.manage_all',
  'payroll.tax_docs.view_own',
  'payroll.tax_docs.upload_own',
  'payroll.tax_docs.export',
] as const;

const EMPLOYMENT_HISTORY_PERMISSION_KEYS = [
  'hr.employment_history.view_all',
  'hr.employment_history.manage_all',
  'hr.employment_history.view_own',
  'hr.employment_history.manage_own',
] as const;

const DISCIPLINARY_GRIEVANCE_PERMISSION_KEYS = [
  'hr.disciplinary.view_all',
  'hr.disciplinary.manage_all',
  'hr.disciplinary.view_own',
  'hr.grievance.view_all',
  'hr.grievance.manage_all',
  'hr.grievance.view_own',
] as const;

const MEDICAL_NOTES_PERMISSION_KEYS = [
  'hr.medical_notes.view_all',
  'hr.medical_notes.manage_all',
  'hr.medical_notes.view_own_summary',
  'hr.medical_notes.reveal_sensitive',
  'hr.medical_notes.export',
  'hr.medical_notes.manage_own',
] as const;

const CUSTOM_HR_FIELDS_PERMISSION_KEYS = [
  'hr.custom_fields.view',
  'hr.custom_fields.manage_definitions',
  'hr.custom_fields.manage_values_all',
  'hr.custom_fields.manage_values_own',
] as const;

const PRIVACY_POLICY_PERMISSION_KEYS = [
  'privacy.retention_policy.view',
  'privacy.retention_policy.manage',
  'privacy.erasure_request.create',
  'privacy.erasure_request.review',
  'privacy.erasure_request.execute',
  'privacy.erasure_request.audit_view',
] as const;

const RECORD_EXPORT_PERMISSION_KEYS = [
  'hr.records_export.view_all',
  'hr.records_export.view_own',
  'hr.records_export.view_direct_reports',
  'hr.records_export.include_sensitive',
  'hr.records_export.generate_pdf',
  'hr.records_export.generate_csv',
] as const;

export function AdminRolesAndPermissionsView({ canManageRoles }: { canManageRoles: boolean }) {
  const [activeTab, setActiveTab] = useState<'roles' | 'create'>('roles');
  const [createPickerItems, setCreatePickerItems] = useState<PermissionPickerItem[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<RolePresetRow[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [permissionQuery, setPermissionQuery] = useState('');
  const [roleDraftPerms, setRoleDraftPerms] = useState<Record<string, Set<string>>>({});
  const [roleDraftMeta, setRoleDraftMeta] = useState<Record<string, { label: string; description: string }>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const matrixPermissions = useMemo(
    () => permissions.filter((p) => !p.is_founder_only),
    [permissions]
  );
  const createAssignable = useMemo(
    () => createPickerItems.filter((p) => p.assignable_into_custom_role),
    [createPickerItems],
  );

  const groupedCreatePermissions = useMemo(() => {
    const q = permissionQuery.trim().toLowerCase();
    const groups: Array<{ title: string; items: PermissionPickerItem[] }> = [];
    for (const g of PERMISSION_GROUPS) {
      const items = createAssignable.filter((p) => {
        if (!p.key.startsWith(`${g.key}.`)) return false;
        if (!q) return true;
        return (
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q)
        );
      });
      if (items.length) groups.push({ title: g.title, items });
    }
    const remaining = createAssignable.filter(
      (p) =>
        !PERMISSION_GROUPS.some((g) => p.key.startsWith(`${g.key}.`)) &&
        (!q ||
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q)),
    );
    if (remaining.length) groups.push({ title: 'Other', items: remaining });
    return groups;
  }, [createAssignable, permissionQuery]);

  const groupedPermissions = useMemo(() => {
    const q = permissionQuery.trim().toLowerCase();
    const groups: Array<{ title: string; items: PermissionRow[] }> = [];
    for (const g of PERMISSION_GROUPS) {
      const items = matrixPermissions.filter((p) => {
        if (!p.key.startsWith(`${g.key}.`)) return false;
        if (!q) return true;
        return (
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q)
        );
      });
      if (items.length) groups.push({ title: g.title, items });
    }
    const remaining = matrixPermissions.filter(
      (p) =>
        !PERMISSION_GROUPS.some((g) => p.key.startsWith(`${g.key}.`)) &&
        (!q ||
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q))
    );
    if (remaining.length) groups.push({ title: 'Other', items: remaining });
    return groups;
  }, [matrixPermissions, permissionQuery]);

  function roleKeyFromLabel(label: string): string {
    const raw = label.trim().toLowerCase();
    const key = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return key || 'custom_role';
  }

  async function load() {
    const res = await fetch('/api/admin/roles', { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as {
      roles?: RoleRow[];
      permissions?: PermissionRow[];
      presets?: RolePresetRow[];
      error?: string;
    };
    if (!res.ok) {
      setMsg(data.error ?? 'Failed to load roles.');
      return;
    }
    setRoles(data.roles ?? []);
    setPermissions(data.permissions ?? []);
    setPresets(data.presets ?? []);
    setRoleDraftPerms(
      Object.fromEntries(
        (data.roles ?? []).map((r) => [r.id, new Set(r.org_role_permissions.map((x) => x.permission_key))])
      )
    );
    setRoleDraftMeta(
      Object.fromEntries((data.roles ?? []).map((r) => [r.id, { label: r.label, description: r.description ?? '' }]))
    );
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!canManageRoles) return;
    void (async () => {
      const res = await fetch('/api/admin/custom-roles', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        permission_picker?: { items?: PermissionPickerItem[] };
        error?: string;
      };
      if (!res.ok) {
        if (res.status !== 403) setMsg(data.error ?? 'Could not load permission picker for new roles');
        return;
      }
      setCreatePickerItems(data.permission_picker?.items ?? []);
    })();
  }, [canManageRoles]);

  useEffect(() => {
    if (!canManageRoles && activeTab === 'create') setActiveTab('roles');
  }, [canManageRoles, activeTab]);

  async function createRole() {
    if (!canManageRoles) return;
    setBusy(true);
    setMsg(null);
    const keys = [...newPerms];
    const v = validateCustomRolePermissionKeys(keys, createPickerItems);
    if (!v.ok) {
      setBusy(false);
      setMsg(v.error ?? 'Invalid permission selection');
      return;
    }
    const res = await fetch('/api/admin/custom-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: roleKeyFromLabel(newLabel),
        label: newLabel.trim(),
        description: newDescription.trim(),
        permission_keys: keys,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; role_id?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Could not create role');
      return;
    }
    setNewLabel('');
    setNewDescription('');
    setNewPerms(new Set());
    setSelectedPresetId('');
    await load();
  }

  async function initializeDefaultPermissions() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/permissions/bootstrap', { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { error?: string; total?: number };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Could not initialize permissions');
      return;
    }
    setMsg(`Default permissions initialized${typeof data.total === 'number' ? ` (${data.total} total).` : '.'}`);
    await load();
  }

  async function saveRole(roleId: string, label: string, description: string, permissionKeys: string[]) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, description, permission_keys: permissionKeys }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Could not update role');
      return;
    }
    await load();
  }

  function duplicateRoleToDraft(role: RoleRow) {
    if (!canManageRoles) return;
    setNewLabel(`${role.label} Copy`);
    setNewDescription(role.description ?? '');
    const allowed = new Set(createAssignable.map((p) => p.key));
    const keys = role.org_role_permissions.map((x) => x.permission_key).filter((k) => allowed.has(k));
    setNewPerms(new Set(keys));
    setPermissionQuery('');
    setSelectedPresetId('');
    setActiveTab('create');
    setMsg(
      `Created draft from "${role.label}". Permissions you cannot grant were removed. Save as a new custom role, then assign from All members.`
    );
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const selectedMeta = selectedRole
    ? roleDraftMeta[selectedRole.id] ?? { label: selectedRole.label, description: selectedRole.description ?? '' }
    : null;
  const selectedChecked =
    selectedRole && roleDraftPerms[selectedRole.id]
      ? roleDraftPerms[selectedRole.id]
      : selectedRole
        ? new Set(selectedRole.org_role_permissions.map((x) => x.permission_key))
        : new Set<string>();
  const selectedDirty = selectedRole
    ? (() => {
        const metaChanged =
          (selectedMeta?.label ?? selectedRole.label) !== selectedRole.label ||
          (selectedMeta?.description ?? selectedRole.description ?? '') !== (selectedRole.description ?? '');
        const original = new Set(selectedRole.org_role_permissions.map((x) => x.permission_key));
        const permissionsChanged =
          selectedChecked.size !== original.size ||
          [...selectedChecked].some((key) => !original.has(key));
        return metaChanged || permissionsChanged;
      })()
    : false;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7" data-no-checkbox-sound>
      <div className="mb-6">
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1917]">Roles & permissions</h1>
        <p className="mt-1 text-[14px] text-[#6B6963]">
          Define what each role can do, then assign roles from{' '}
          <Link href="/admin/users" className="text-[#1A5FA8] underline underline-offset-2">
            All members
          </Link>
          .
        </p>
      </div>

      {msg ? (
        <div className="mb-4 rounded-md border border-[#b91c1c]/20 bg-[#fff4f4] px-3 py-2 text-[13px] text-[#b91c1c]">
          {msg}
        </div>
      ) : null}

      <div className="mb-7 inline-flex rounded-[10px] bg-[#ECEAE4] p-[3px]">
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={[
            'rounded-[8px] px-4 py-1.5 text-[13.5px] transition',
            activeTab === 'roles'
              ? 'bg-white font-medium text-[#1A1917] shadow-sm'
              : 'text-[#6B6963] hover:text-[#1A1917]',
          ].join(' ')}
        >
          Roles
        </button>
        {canManageRoles ? (
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={[
              'rounded-[8px] px-4 py-1.5 text-[13.5px] transition',
              activeTab === 'create'
                ? 'bg-white font-medium text-[#1A1917] shadow-sm'
                : 'text-[#6B6963] hover:text-[#1A1917]',
            ].join(' ')}
          >
            Create custom role
          </button>
        ) : null}
      </div>

      {activeTab === 'roles' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => {
              const chips = role.org_role_permissions.slice(0, 3);
              const more = Math.max(0, role.org_role_permissions.length - chips.length);
              return (
                <div
                  key={role.id}
                  className="rounded-[14px] border border-black/10 bg-white p-4 transition hover:border-black/20 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-[15px] font-medium tracking-[-0.01em] text-[#1A1917]">{role.label}</p>
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.04em]',
                        role.is_system ? 'bg-[#ECEAE4] text-[#A39E97]' : 'bg-[#EBF3FF] text-[#1A5FA8]',
                      ].join(' ')}
                    >
                      {role.is_system ? 'system' : 'custom'}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#6B6963]">{role.description || 'No description'}</p>
                  {role.source_preset_id ? (
                    <p className="mt-1 text-[11.5px] text-[#A39E97]">
                      Cloned from founder preset · v{role.source_catalog_version_no ?? '-'}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {chips.map((p) => {
                      const perm = permissions.find((x) => x.key === p.permission_key);
                      return (
                        <span
                          key={`${role.id}:${p.permission_key}`}
                          className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                        >
                          {perm?.label ?? p.permission_key}
                        </span>
                      );
                    })}
                    {more > 0 ? <span className="px-1 py-0.5 text-[11.5px] text-[#A39E97]">+{more} more</span> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-2.5">
                    <span className="font-mono text-[11.5px] text-[#A39E97]">{role.key}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#6B6963] hover:bg-[#F2F1ED]"
                    >
                      {selectedRoleId === role.id ? 'Editing' : 'Edit'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {canManageRoles ? (
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className="flex w-full items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-black/20 px-4 py-4 text-left text-[14px] text-[#6B6963] hover:bg-white hover:text-[#1A1917]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-current text-[18px]">+</span>
              Create a custom role
            </button>
          ) : null}

          {selectedRole ? (
            <div className="rounded-[18px] border border-black/10 bg-white p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[16px] font-medium text-[#1A1917]">{selectedRole.label}</p>
                  <p className="mt-0.5 text-[12px] text-[#A39E97]">Internal key: {selectedRole.key}</p>
                </div>
                <button
                  type="button"
                  className="text-[12px] text-[#6B6963] underline underline-offset-2"
                  onClick={() => {
                    setRoleDraftPerms((curr) => ({
                      ...curr,
                      [selectedRole.id]: new Set(selectedRole.org_role_permissions.map((x) => x.permission_key)),
                    }));
                    setRoleDraftMeta((curr) => ({
                      ...curr,
                      [selectedRole.id]: { label: selectedRole.label, description: selectedRole.description ?? '' },
                    }));
                  }}
                >
                  Reset changes
                </button>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6B6963]">
                    Role name
                  </label>
                  <input
                    value={selectedMeta?.label ?? ''}
                    onChange={(e) =>
                      setRoleDraftMeta((curr) => ({
                        ...curr,
                        [selectedRole.id]: {
                          label: e.target.value,
                          description: selectedMeta?.description ?? '',
                        },
                      }))
                    }
                    className="w-full rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6B6963]">
                    Description
                  </label>
                  <input
                    value={selectedMeta?.description ?? ''}
                    onChange={(e) =>
                      setRoleDraftMeta((curr) => ({
                        ...curr,
                        [selectedRole.id]: {
                          label: selectedMeta?.label ?? selectedRole.label,
                          description: e.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
                  />
                </div>
              </div>

              <div className="mb-3">
                <input
                  value={permissionQuery}
                  onChange={(e) => setPermissionQuery(e.target.value)}
                  placeholder="Search permissions..."
                  className="w-full rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
                />
              </div>

              <div className="max-h-[460px] space-y-4 overflow-y-auto pr-1">
                {groupedPermissions.map((group) => {
                  const groupAll = group.items.every((p) => selectedChecked.has(p.key));
                  const groupSome = group.items.some((p) => selectedChecked.has(p.key));
                  return (
                  <div key={`${selectedRole.id}-${group.title}`}>
                    <div className="mb-2">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-black/20"
                          aria-label={`Toggle all permissions in ${group.title}`}
                          ref={(el) => {
                            if (el) el.indeterminate = groupSome && !groupAll;
                          }}
                          checked={group.items.length > 0 && groupAll}
                          onChange={() =>
                            setRoleDraftPerms((curr) => {
                              const next = new Set(curr[selectedRole.id] ?? selectedChecked);
                              const allSelected = group.items.every((p) => next.has(p.key));
                              for (const p of group.items) {
                                if (allSelected) next.delete(p.key);
                                else next.add(p.key);
                              }
                              return { ...curr, [selectedRole.id]: next };
                            })
                          }
                        />
                        <span className="text-[11px] uppercase tracking-[0.08em] text-[#A39E97]">{group.title}</span>
                      </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.items.map((p) => (
                        <label
                          key={`${selectedRole.id}-${p.key}`}
                          className={[
                            'flex cursor-pointer items-start gap-2 rounded-[10px] border p-2.5',
                            selectedChecked.has(p.key)
                              ? 'border-[#1A5FA8]/20 bg-[#EBF3FF]'
                              : 'border-black/10 bg-[#F7F6F2]',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={selectedChecked.has(p.key)}
                            onChange={(e) =>
                              setRoleDraftPerms((curr) => {
                                const next = new Set(curr[selectedRole.id] ?? selectedChecked);
                                if (e.target.checked) next.add(p.key);
                                else next.delete(p.key);
                                return { ...curr, [selectedRole.id]: next };
                              })
                            }
                          />
                          <span>
                            <span className="block text-[13px] font-medium text-[#1A1917]">{p.label}</span>
                            <span className="text-[11.5px] text-[#6B6963]">{p.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3">
                <p className="text-[13px] text-[#6B6963]">
                  <strong className="font-medium text-[#1A1917]">{selectedChecked.size}</strong> permissions selected
                </p>
                <div className="flex items-center gap-2">
                  {canManageRoles ? (
                    <button
                      type="button"
                      onClick={() => duplicateRoleToDraft(selectedRole)}
                      className="rounded-[10px] border border-black/15 px-3 py-2 text-[13px] text-[#1A1917] hover:bg-[#F2F1ED]"
                    >
                      Duplicate as custom
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || !selectedDirty || !(selectedMeta?.label ?? '').trim()}
                    onClick={() =>
                      void saveRole(
                        selectedRole.id,
                        (selectedMeta?.label ?? '').trim(),
                        selectedMeta?.description ?? '',
                        [...selectedChecked].sort()
                      )
                    }
                    className="rounded-[10px] bg-[#1A1917] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Employee Document Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for employee photo and ID document access controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {HR_DOCUMENT_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Payroll Tax Document Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for P45/P60 payroll tax document access controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {PAYROLL_TAX_DOCUMENT_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Employment History Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for employee employment history access controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {EMPLOYMENT_HISTORY_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Disciplinary & Grievance Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for sensitive disciplinary and grievance access controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {DISCIPLINARY_GRIEVANCE_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Medical Notes Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for medical and occupational health record controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {MEDICAL_NOTES_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Custom HR Fields Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for custom HR field definition and value controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {CUSTOM_HR_FIELDS_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Privacy & Erasure Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for retention policies and GDPR right-to-erasure controls.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIVACY_POLICY_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/10 bg-white p-5">
            <div className="mb-3">
              <p className="text-[16px] font-medium text-[#1A1917]">Employee Record Export Permission Matrix</p>
              <p className="mt-0.5 text-[12px] text-[#6B6963]">
                Role coverage for CSV/PDF export and sensitive export gating.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/10 text-[#6B6963]">
                    <th className="py-2 pr-3 font-medium">Permission</th>
                    <th className="py-2 pr-3 font-medium">Roles with permission</th>
                  </tr>
                </thead>
                <tbody>
                  {RECORD_EXPORT_PERMISSION_KEYS.map((key) => {
                    const permission = permissions.find((p) => p.key === key);
                    const roleLabels = roles
                      .filter((r) => r.org_role_permissions.some((rp) => rp.permission_key === key))
                      .map((r) => r.label);
                    return (
                      <tr key={key} className="border-b border-black/5 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-[#1A1917]">{permission?.label ?? key}</p>
                          <p className="font-mono text-[11px] text-[#A39E97]">{key}</p>
                        </td>
                        <td className="py-2 pr-3">
                          {roleLabels.length === 0 ? (
                            <span className="text-[#A39E97]">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {roleLabels.map((label) => (
                                <span
                                  key={`${key}:${label}`}
                                  className="rounded-full border border-[#1A5FA8]/20 bg-[#EBF3FF] px-2 py-0.5 text-[11.5px] text-[#1A5FA8]"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : canManageRoles ? (
        <div className="max-w-4xl rounded-[18px] border border-black/10 bg-white p-6">
          <div className="mb-4 border-b border-black/10 pb-3">
            <p className="text-[13px] font-medium text-[#1A1917]">Custom role (permission ceiling: your access)</p>
            <p className="mt-1 text-[12px] text-[#6B6963]">
              Only permissions you already have can be included. Predefined (system) roles are created by the platform seed — use this form for tenant-specific roles.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6B6963]">
                Start from founder preset (optional)
              </label>
              <FormSelect
                value={selectedPresetId}
                onChange={(e) => {
                  const presetId = e.target.value;
                  setSelectedPresetId(presetId);
                  const preset = presets.find((p) => p.id === presetId);
                  if (!preset) return;
                  setNewLabel(preset.name);
                  setNewDescription(preset.description || preset.target_use_case);
                  const allowed = new Set(createAssignable.map((p) => p.key));
                  setNewPerms(
                    new Set(
                      createAssignable.length === 0
                        ? preset.recommended_permission_keys
                        : preset.recommended_permission_keys.filter((k) => allowed.has(k)),
                    ),
                  );
                }}
                className="w-full rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
              >
                <option value="">No preset</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} ({preset.key}) - v{preset.source_version_no}
                  </option>
                ))}
              </FormSelect>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6B6963]">
                Role name
              </label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Team Lead"
                className="w-full rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
              />
              <p className="mt-1 font-mono text-[12px] text-[#A39E97]">
                internal key: {roleKeyFromLabel(newLabel || 'role_name')}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6B6963]">
                Description
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this role is for..."
                className="h-[74px] w-full resize-none rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
              />
            </div>
          </div>

          <div className="mt-6 border-b border-black/10 pb-3">
            <p className="text-[13px] font-medium text-[#1A1917]">Permissions</p>
          </div>
          <div className="mt-3">
            <input
              value={permissionQuery}
              onChange={(e) => setPermissionQuery(e.target.value)}
              placeholder="Search permissions..."
              className="w-full rounded-[10px] border border-black/15 bg-[#F7F6F2] px-3 py-2 text-[14px]"
            />
          </div>

          <div className="mt-4 max-h-[520px] space-y-4 overflow-y-auto pr-1">
            {createAssignable.length === 0 ? (
              <div className="rounded-md border border-[#1A5FA8]/20 bg-[#EBF3FF] p-3 text-[13px] text-[#1A5FA8]">
                Loading permissions you may grant… If this persists, ensure the permission catalog is initialized.
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void initializeDefaultPermissions()}
                  className="ml-2 underline underline-offset-2"
                >
                  Initialize default permissions
                </button>
              </div>
            ) : (
              groupedCreatePermissions.map((group) => {
                const groupAll = group.items.every((p) => newPerms.has(p.key));
                const groupSome = group.items.some((p) => newPerms.has(p.key));
                return (
                <div key={`create-${group.title}`}>
                  <div className="mb-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-black/20"
                        aria-label={`Toggle all permissions in ${group.title}`}
                        ref={(el) => {
                          if (el) el.indeterminate = groupSome && !groupAll;
                        }}
                        checked={group.items.length > 0 && groupAll}
                        onChange={() =>
                          setNewPerms((curr) => {
                            const next = new Set(curr);
                            const allSelected = group.items.every((p) => next.has(p.key));
                            for (const p of group.items) {
                              if (allSelected) next.delete(p.key);
                              else next.add(p.key);
                            }
                            return next;
                          })
                        }
                      />
                      <span className="text-[11px] uppercase tracking-[0.08em] text-[#A39E97]">{group.title}</span>
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((p) => (
                      <label
                        key={`create-${p.key}`}
                        className={[
                          'flex cursor-pointer items-start gap-2 rounded-[10px] border p-2.5',
                          newPerms.has(p.key)
                            ? 'border-[#1A5FA8]/20 bg-[#EBF3FF]'
                            : 'border-black/10 bg-[#F7F6F2]',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={newPerms.has(p.key)}
                          onChange={(e) =>
                            setNewPerms((curr) => {
                              const next = new Set(curr);
                              if (e.target.checked) next.add(p.key);
                              else next.delete(p.key);
                              return next;
                            })
                          }
                        />
                        <span>
                          <span className="block text-[13px] font-medium text-[#1A1917]">{p.label}</span>
                          <span className="text-[11.5px] text-[#6B6963]">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                );
              })
            )}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-black/10 pt-4">
            <p className="text-[13px] text-[#6B6963]">
              <strong className="font-medium text-[#1A1917]">{newPerms.size}</strong> permissions selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-[10px] border border-black/15 px-4 py-2 text-[14px] text-[#1A1917]"
                onClick={() => setActiveTab('roles')}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !newLabel.trim()}
                onClick={() => void createRole()}
                className="rounded-[10px] bg-[#1A1917] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
              >
                Create role
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
