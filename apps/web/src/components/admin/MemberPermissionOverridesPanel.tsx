'use client';

import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
import { buildEffectiveAccessSummary, groupPermissionPickerItems } from '@/lib/authz/memberOverrideUx';
import { useCallback, useEffect, useMemo, useState } from 'react';

type OverrideRow = {
  id: string;
  mode: string;
  permission_key: string;
  created_at: string;
};

export function MemberPermissionOverridesPanel({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [pickerItems, setPickerItems] = useState<PermissionPickerItem[]>([]);
  const [baseRoleLabel, setBaseRoleLabel] = useState<string>('No base role');
  const [baseRolePermissionKeys, setBaseRolePermissionKeys] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'additive' | 'subtractive'>('additive');
  const [replacePermKey, setReplacePermKey] = useState('');
  const [permKey, setPermKey] = useState('');
  const [search, setSearch] = useState('');
  const [existingSearch, setExistingSearch] = useState('');

  const assignableKeys = useMemo(
    () => new Set(pickerItems.filter((i) => i.assignable_into_custom_role).map((i) => i.key)),
    [pickerItems],
  );

  const byMode = useMemo(() => {
    const m: Record<string, OverrideRow[]> = { additive: [], subtractive: [], replace: [] };
    for (const o of overrides) {
      const k = o.mode as keyof typeof m;
      if (!m[k]) m[k] = [];
      m[k].push(o);
    }
    return m;
  }, [overrides]);

  const hasReplace = (byMode.replace ?? []).length > 0;

  const load = useCallback(async () => {
    setLoadErr(null);
    const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      overrides?: OverrideRow[];
      permission_picker?: { items?: PermissionPickerItem[] };
      base_role?: { label?: string | null };
      base_role_permission_keys?: string[];
    };
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not load permission overrides');
      return;
    }
    setOverrides(data.overrides ?? []);
    setPickerItems(data.permission_picker?.items ?? []);
    setBaseRoleLabel(data.base_role?.label?.trim() || 'No base role');
    setBaseRolePermissionKeys(data.base_role_permission_keys ?? []);
  }, [targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addOverride() {
    if (!permKey.trim()) return;
    if (!assignableKeys.has(permKey.trim())) {
      setLoadErr('You cannot assign this permission because it is outside your current access.');
      return;
    }
    setBusy(true);
    setLoadErr(null);
    const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'upsert', mode, permission_key: permKey.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not add override');
      return;
    }
    setPermKey('');
    await load();
  }

  async function removeOverride(row: OverrideRow) {
    setBusy(true);
    setLoadErr(null);
    const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'delete', mode: row.mode, permission_key: row.permission_key }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not remove override');
      return;
    }
    await load();
  }

  async function clearReplaceMode() {
    if (!confirm('Remove all replace-mode overrides? Role-based permissions will apply again.')) return;
    setBusy(true);
    setLoadErr(null);
    const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'clear_modes', modes: ['replace'] }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not clear');
      return;
    }
    await load();
  }

  const permLabel = (key: string) => pickerItems.find((p) => p.key === key)?.label ?? key;
  const permDescription = (key: string) => pickerItems.find((p) => p.key === key)?.description ?? '';
  const filterRows = useCallback(
    (rows: OverrideRow[]) => {
      const q = existingSearch.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((row) => {
        const label = permLabel(row.permission_key).toLowerCase();
        const key = row.permission_key.toLowerCase();
        return label.includes(q) || key.includes(q);
      });
    },
    [existingSearch, pickerItems],
  );
  const groupedItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? pickerItems.filter(
          (item) =>
            item.key.toLowerCase().includes(q) ||
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q),
        )
      : pickerItems;
    return groupPermissionPickerItems(filtered);
  }, [pickerItems, search]);

  const preview = useMemo(
    () =>
      buildEffectiveAccessSummary({
        overrideRows: overrides.map((o) => ({ mode: o.mode as 'additive' | 'subtractive' | 'replace', permission_key: o.permission_key })),
        baseRolePermissionKeys,
        candidatePermissionKeys: pickerItems.map((p) => p.key),
      }),
    [overrides, baseRolePermissionKeys, pickerItems],
  );

  const modeTitle =
    mode === 'additive'
      ? 'Grant extra permission'
      : 'Remove inherited permission';

  if (loadErr && overrides.length === 0 && pickerItems.length === 0) {
    return <p className="text-[12.5px] text-[#b91c1c]">{loadErr}</p>;
  }

  return (
    <div className="mt-5 border-t border-[#e8e8e8] pt-4">
      <h3 className="text-[13px] font-semibold text-[#121212]">Specific user access</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-[#6b6b6b]">
        Keep their base role and add user-specific exceptions. This only affects this person and does not change the role template.
      </p>
      {loadErr ? <p className="mt-2 text-[12px] text-[#b91c1c]">{loadErr}</p> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#e8e8e8] bg-[#faf9f6] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Base role access</p>
          <p className="mt-1 text-[12.5px] font-medium text-[#121212]">{baseRoleLabel}</p>
          <p className="mt-1 text-[12px] text-[#6b6b6b]">{baseRolePermissionKeys.length} inherited permissions</p>
        </div>
        <div className="rounded-lg border border-[#e8e8e8] bg-[#faf9f6] p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Effective access preview</p>
          <p className="mt-1 text-[12px] text-[#6b6b6b]">
            Added: <span className="font-medium text-[#166534]">{preview.added.length}</span> · Removed:{' '}
            <span className="font-medium text-[#b91c1c]">{preview.removed.length}</span>
          </p>
          {preview.roleIgnoredByReplace ? (
            <p className="mt-1 text-[12px] font-medium text-[#92400e]">Advanced custom allowlist is active: inherited role access is ignored.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-3 rounded-lg border border-[#e8e8e8] bg-[#faf9f6] p-3">
        <label className="block text-[12px] font-medium text-[#6b6b6b]">
          Search current specific access
          <input
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-2 text-[13px]"
            value={existingSearch}
            onChange={(e) => setExistingSearch(e.target.value)}
            placeholder="Search current grants/removals"
          />
        </label>
        {(['additive', 'subtractive', 'replace'] as const).map((m) => (
          <div key={m}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">
              {m === 'additive' ? 'Grant extra permission' : m === 'subtractive' ? 'Remove inherited permission' : 'Advanced custom allowlist'}
            </p>
            {filterRows(byMode[m] ?? []).length === 0 ? (
              <p className="text-[12px] text-[#9b9b9b]">None</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {filterRows(byMode[m] ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-[12.5px] text-[#121212]">
                    <span className="min-w-0 truncate">{permLabel(o.permission_key)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      className="shrink-0 text-[11.5px] text-[#b91c1c] underline underline-offset-2 disabled:opacity-50"
                      onClick={() => void removeOverride(o)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-[#e8e8e8] p-3">
        <p className="text-[12px] font-medium text-[#121212]">Add exception</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('additive')}
            className={`rounded-lg border px-3 py-1.5 text-[12px] ${mode === 'additive' ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-white text-[#6b6b6b]'}`}
          >
            Grant extra permission
          </button>
          <button
            type="button"
            onClick={() => setMode('subtractive')}
            className={`rounded-lg border px-3 py-1.5 text-[12px] ${mode === 'subtractive' ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-white text-[#6b6b6b]'}`}
          >
            Remove inherited permission
          </button>
        </div>
        <p className="mt-2 text-[12px] text-[#6b6b6b]">{modeTitle}</p>
        <label className="mt-2 block text-[12px] font-medium text-[#6b6b6b]">
          Search permissions
          <input
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-2 text-[13px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or key"
          />
        </label>
        <label className="block text-[12px] font-medium text-[#6b6b6b]">
          Permission
          <select
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-2 text-[13px]"
            value={permKey}
            disabled={busy}
            onChange={(e) => setPermKey(e.target.value)}
          >
            <option value="">Select…</option>
            {groupedItems.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                    {!item.assignable_into_custom_role ? ' (not assignable)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {permKey ? <p className="mt-1 text-[12px] text-[#6b6b6b]">{permDescription(permKey)}</p> : null}
        <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
          All permissions are listed. Disabled options cannot be assigned with your current access.
        </p>
        <button
          type="button"
          disabled={busy || !permKey}
          className="mt-3 rounded-lg bg-[#121212] px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
          onClick={() => void addOverride()}
        >
          Apply exception
        </button>
      </div>

      <details className="mt-4 rounded-lg border border-[#fcd34d] bg-[#fffbeb] p-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-[#92400e]">Advanced: custom mode (replace role access)</summary>
        <p className="mt-2 text-[12px] leading-relaxed text-[#92400e]">
          Use this only for exceptional cases. In custom mode, this user stops inheriting permissions from their role and only keeps:
          allowlisted permissions listed here, plus any explicit grants above.
        </p>
        <p className="mt-1 text-[12px] text-[#92400e]">
          Example: keep someone on a broad role, but temporarily restrict them to a small safe permission set.
        </p>
        <label className="mt-2 block text-[12px] font-medium text-[#6b6b6b]">
          Permission to allow
          <select
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-2 text-[13px]"
            value={replacePermKey}
            disabled={busy}
            onChange={(e) => setReplacePermKey(e.target.value)}
          >
            <option value="">Select…</option>
            {groupedItems.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                    {!item.assignable_into_custom_role ? ' (not assignable)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !replacePermKey}
            className="rounded-lg bg-[#92400e] px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
            onClick={async () => {
              if (!replacePermKey.trim()) return;
              if (!assignableKeys.has(replacePermKey.trim())) {
                setLoadErr('You cannot allowlist this permission because it is outside your current access.');
                return;
              }
              setBusy(true);
              setLoadErr(null);
              const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ op: 'upsert', mode: 'replace', permission_key: replacePermKey.trim() }),
              });
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              setBusy(false);
              if (!res.ok) {
                setLoadErr(data.error ?? 'Could not update custom allowlist');
                return;
              }
              setReplacePermKey('');
              await load();
            }}
          >
            Add to allowlist
          </button>
          {hasReplace ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-[#92400e] bg-white px-3 py-2 text-[12.5px] font-medium text-[#92400e] disabled:opacity-50"
              onClick={() => void clearReplaceMode()}
            >
              Clear custom allowlist
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
