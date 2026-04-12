'use client';

import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
import {
  buildEffectiveAccessSummary,
  groupPermissionPickerItems,
  permissionPickerMatchesQuery,
} from '@/lib/authz/memberOverrideUx';
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
  const [selectedAddKeys, setSelectedAddKeys] = useState<Set<string>>(() => new Set());
  const [selectedReplaceKeys, setSelectedReplaceKeys] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [replaceSearch, setReplaceSearch] = useState('');
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

  async function addOverridesBatch(keys: string[]) {
    const trimmed = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    const allowed = trimmed.filter((k) => assignableKeys.has(k));
    if (allowed.length === 0) {
      setLoadErr('You cannot assign these permissions because they are outside your current access.');
      return;
    }
    setLoadErr(null);
    setBusy(true);
    const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'upsert_batch', mode, permission_keys: allowed }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not add overrides');
      return;
    }
    setSelectedAddKeys(new Set());
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
      const tokens = q.split(/\s+/).filter(Boolean);
      return rows.filter((row) => {
        const pk = row.permission_key.toLowerCase();
        const label = permLabel(row.permission_key).toLowerCase();
        const desc = permDescription(row.permission_key).toLowerCase();
        const haystack = `${pk} ${label} ${desc}`;
        return tokens.every((t) => haystack.includes(t));
      });
    },
    [existingSearch, pickerItems],
  );
  const groupedItems = useMemo(() => {
    const filtered = pickerItems.filter((item) => permissionPickerMatchesQuery(item, search));
    return groupPermissionPickerItems(filtered);
  }, [pickerItems, search]);

  const groupedReplaceItems = useMemo(() => {
    const filtered = pickerItems.filter((item) => permissionPickerMatchesQuery(item, replaceSearch));
    return groupPermissionPickerItems(filtered);
  }, [pickerItems, replaceSearch]);

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
    <div className="mt-5 border-t border-[#e8e8e8] pt-4" data-no-checkbox-sound>
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
        <p className="mt-2 text-[12px] font-medium text-[#6b6b6b]">Permissions</p>
        <div className="mt-2 max-h-[min(420px,55vh)] space-y-3 overflow-y-auto pr-1">
          {pickerItems.length > 0 && groupedItems.length === 0 ? (
            <p className="text-[12px] text-[#9b9b9b]">No permissions match your search.</p>
          ) : null}
          {groupedItems.map((group) => {
            const assignableInGroup = group.items.filter((i) => assignableKeys.has(i.key));
            const allAssignableSelected =
              assignableInGroup.length > 0 && assignableInGroup.every((p) => selectedAddKeys.has(p.key));
            return (
              <div key={group.group}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">{group.group}</p>
                  {assignableInGroup.length > 0 ? (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] text-[#1A5FA8] underline underline-offset-2"
                      disabled={busy}
                      onClick={() =>
                        setSelectedAddKeys((curr) => {
                          const next = new Set(curr);
                          for (const p of assignableInGroup) {
                            if (allAssignableSelected) next.delete(p.key);
                            else next.add(p.key);
                          }
                          return next;
                        })
                      }
                    >
                      {allAssignableSelected ? 'Clear all' : 'Select all'}
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const canAssign = assignableKeys.has(item.key);
                    return (
                      <label
                        key={item.key}
                        className={[
                          'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5',
                          selectedAddKeys.has(item.key)
                            ? 'border-[#1A5FA8]/25 bg-[#EBF3FF]'
                            : 'border-[#e8e8e8] bg-white',
                          !canAssign ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedAddKeys.has(item.key)}
                          disabled={busy || !canAssign}
                          onChange={(e) =>
                            setSelectedAddKeys((curr) => {
                              const next = new Set(curr);
                              if (e.target.checked) next.add(item.key);
                              else next.delete(item.key);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-[#121212]">{item.label}</span>
                          <span className="text-[11.5px] text-[#6b6b6b]">{item.description}</span>
                          {!canAssign ? (
                            <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">Not assignable with your access</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {selectedAddKeys.size === 1 ? (
          <p className="mt-2 text-[12px] text-[#6b6b6b]">{permDescription([...selectedAddKeys][0]!)}</p>
        ) : null}
        <p className="mt-2 text-[11.5px] text-[#9b9b9b]">
          Check every permission to grant or remove for this person. Rows you cannot assign are disabled.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-[#6b6b6b]">
            <span className="font-medium text-[#121212]">{selectedAddKeys.size}</span> selected
          </p>
          <button
            type="button"
            disabled={busy || selectedAddKeys.size === 0}
            className="rounded-lg bg-[#121212] px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
            onClick={() => void addOverridesBatch([...selectedAddKeys])}
          >
            Apply exception{selectedAddKeys.size > 1 ? 's' : ''}
          </button>
        </div>
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
          Search allowlist
          <input
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-2 text-[13px]"
            value={replaceSearch}
            onChange={(e) => setReplaceSearch(e.target.value)}
            placeholder="Search by name or key"
          />
        </label>
        <p className="mt-2 text-[12px] font-medium text-[#6b6b6b]">Permissions to allow</p>
        <div className="mt-2 max-h-[min(320px,45vh)] space-y-3 overflow-y-auto pr-1">
          {pickerItems.length > 0 && groupedReplaceItems.length === 0 ? (
            <p className="text-[12px] text-[#9b9b9b]">No permissions match your search.</p>
          ) : null}
          {groupedReplaceItems.map((group) => {
            const assignableInGroup = group.items.filter((i) => assignableKeys.has(i.key));
            const allAssignableSelected =
              assignableInGroup.length > 0 && assignableInGroup.every((p) => selectedReplaceKeys.has(p.key));
            return (
              <div key={`replace-${group.group}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">{group.group}</p>
                  {assignableInGroup.length > 0 ? (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] text-[#92400e] underline underline-offset-2"
                      disabled={busy}
                      onClick={() =>
                        setSelectedReplaceKeys((curr) => {
                          const next = new Set(curr);
                          for (const p of assignableInGroup) {
                            if (allAssignableSelected) next.delete(p.key);
                            else next.add(p.key);
                          }
                          return next;
                        })
                      }
                    >
                      {allAssignableSelected ? 'Clear all' : 'Select all'}
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const canAssign = assignableKeys.has(item.key);
                    return (
                      <label
                        key={`replace-${item.key}`}
                        className={[
                          'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5',
                          selectedReplaceKeys.has(item.key)
                            ? 'border-[#92400e]/35 bg-[#fff7ed]'
                            : 'border-[#fcd34d]/60 bg-white',
                          !canAssign ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedReplaceKeys.has(item.key)}
                          disabled={busy || !canAssign}
                          onChange={(e) =>
                            setSelectedReplaceKeys((curr) => {
                              const next = new Set(curr);
                              if (e.target.checked) next.add(item.key);
                              else next.delete(item.key);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-[#121212]">{item.label}</span>
                          <span className="text-[11.5px] text-[#6b6b6b]">{item.description}</span>
                          {!canAssign ? (
                            <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">Not assignable with your access</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12.5px] text-[#92400e]">
            <span className="font-medium">{selectedReplaceKeys.size}</span> selected for allowlist
          </p>
          <button
            type="button"
            disabled={busy || selectedReplaceKeys.size === 0}
            className="rounded-lg bg-[#92400e] px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
            onClick={async () => {
              const keys = [...selectedReplaceKeys].filter((k) => assignableKeys.has(k.trim()));
              if (keys.length === 0) {
                setLoadErr('You cannot allowlist these permissions because they are outside your current access.');
                return;
              }
              setBusy(true);
              setLoadErr(null);
              const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ op: 'upsert_batch', mode: 'replace', permission_keys: keys }),
              });
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              setBusy(false);
              if (!res.ok) {
                setLoadErr(data.error ?? 'Could not update custom allowlist');
                return;
              }
              setSelectedReplaceKeys(new Set());
              await load();
            }}
          >
            Add to allowlist
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
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
