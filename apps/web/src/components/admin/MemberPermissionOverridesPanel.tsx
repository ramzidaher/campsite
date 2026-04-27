'use client';

import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
import {
  buildEffectiveAccessSummary,
  groupPermissionPickerItems,
  permissionPickerMatchesQuery,
} from '@/lib/authz/memberOverrideUx';
import { CampfireLoaderInline } from '@/components/CampfireLoaderInline';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';

type OverrideRow = {
  id: string;
  mode: string;
  permission_key: string;
  created_at: string;
};

type PermissionTab = 'give' | 'restrict' | 'advanced';
type OverridePayload = {
  overrides: OverrideRow[];
  pickerItems: PermissionPickerItem[];
  baseRolePermissionKeys: string[];
};

/** Native checkbox styling so the checked tick is visible across browsers (esp. with cream surfaces). */
const PERM_CHECKBOX_ADD =
  'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[#b8b8b8] bg-white accent-[#121212] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A5FA8] disabled:cursor-not-allowed';
const PERM_CHECKBOX_RESTRICT =
  'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[#b8b8b8] bg-white accent-[#b91c1c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b91c1c] disabled:cursor-not-allowed';
const PERM_CHECKBOX_REPLACE =
  'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[#d97706]/80 bg-white accent-[#92400e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97706] disabled:cursor-not-allowed';
const OVERRIDES_CACHE_TTL_MS = 8000;
const permissionOverridesCache = new Map<string, { payload: OverridePayload; freshUntil: number }>();
const permissionOverridesInFlight = new Map<string, Promise<OverridePayload>>();

export function MemberPermissionOverridesPanel({
  targetUserId,
  memberFirstName = 'This person',
  roleLabel = 'assigned',
}: {
  targetUserId: string;
  /** First name or short name for intro copy */
  memberFirstName?: string;
  /** Human-readable role title, e.g. "Society leader" */
  roleLabel?: string;
}) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [pickerItems, setPickerItems] = useState<PermissionPickerItem[]>([]);
  const [baseRolePermissionKeys, setBaseRolePermissionKeys] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PermissionTab>('give');
  const [selectedAddKeys, setSelectedAddKeys] = useState<Set<string>>(() => new Set());
  const [selectedReplaceKeys, setSelectedReplaceKeys] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [replaceSearch, setReplaceSearch] = useState('');
  const [existingSearch, setExistingSearch] = useState('');
  const [fetching, setFetching] = useState(true);

  const setFromPayload = useCallback((payload: OverridePayload) => {
    setOverrides(payload.overrides);
    setPickerItems(payload.pickerItems);
    setBaseRolePermissionKeys(payload.baseRolePermissionKeys);
  }, []);

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

  const additiveKeys = useMemo(
    () => new Set((byMode.additive ?? []).map((o) => o.permission_key)),
    [byMode.additive],
  );
  const subtractiveKeys = useMemo(
    () => new Set((byMode.subtractive ?? []).map((o) => o.permission_key)),
    [byMode.subtractive],
  );
  const replaceKeys = useMemo(
    () => new Set((byMode.replace ?? []).map((o) => o.permission_key)),
    [byMode.replace],
  );

  const load = useCallback(async (forceRefresh = false) => {
    setLoadErr(null);
    const cacheKey = targetUserId;
    const now = Date.now();
    const cached = permissionOverridesCache.get(cacheKey);
    if (!forceRefresh && cached && cached.freshUntil > now) {
      setFromPayload(cached.payload);
      setFetching(false);
      return;
    }
    setFetching(true);
    try {
      const existing = permissionOverridesInFlight.get(cacheKey);
      const request =
        existing ??
        fetch(`/api/admin/members/${targetUserId}/permission-overrides`, { cache: 'no-store' })
          .then(async (res) => {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              overrides?: OverrideRow[];
              permission_picker?: { items?: PermissionPickerItem[] };
              base_role?: { label?: string | null };
              base_role_permission_keys?: string[];
            };
            if (!res.ok) {
              throw new Error(data.error ?? 'Could not load permission overrides');
            }
            return {
              overrides: data.overrides ?? [],
              pickerItems: data.permission_picker?.items ?? [],
              baseRolePermissionKeys: data.base_role_permission_keys ?? [],
            } satisfies OverridePayload;
          })
          .finally(() => {
            permissionOverridesInFlight.delete(cacheKey);
          });
      if (!existing) {
        permissionOverridesInFlight.set(cacheKey, request);
      }
      const payload = await request;
      permissionOverridesCache.set(cacheKey, {
        payload,
        freshUntil: Date.now() + OVERRIDES_CACHE_TTL_MS,
      });
      setFromPayload(payload);
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : 'Could not load permission overrides');
    } finally {
      setFetching(false);
    }
  }, [targetUserId, setFromPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedAddKeys(new Set());
    setSelectedReplaceKeys(new Set());
  }, [tab]);

  const batchMode = tab === 'give' ? 'additive' : 'subtractive';

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
      body: JSON.stringify({ op: 'upsert_batch', mode: batchMode, permission_keys: allowed }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not add overrides');
      return;
    }
    setSelectedAddKeys(new Set());
    await load(true);
  }

  async function removeOverride(row: OverrideRow) {
    await removeOverridesRows([row]);
  }

  async function removeOverridesRows(rows: OverrideRow[]) {
    if (rows.length === 0) return;
    setBusy(true);
    setLoadErr(null);
    for (const row of rows) {
      const res = await fetch(`/api/admin/members/${targetUserId}/permission-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'delete', mode: row.mode, permission_key: row.permission_key }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLoadErr(data.error ?? 'Could not remove override');
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    await load(true);
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
    await load(true);
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
    const q = tab === 'advanced' ? replaceSearch : search;
    const filtered = pickerItems.filter((item) => permissionPickerMatchesQuery(item, q));
    return groupPermissionPickerItems(filtered);
  }, [pickerItems, search, replaceSearch, tab]);

  const preview = useMemo(
    () =>
      buildEffectiveAccessSummary({
        overrideRows: overrides.map((o) => ({
          mode: o.mode as 'additive' | 'subtractive' | 'replace',
          permission_key: o.permission_key,
        })),
        baseRolePermissionKeys,
        candidatePermissionKeys: pickerItems.map((p) => p.key),
      }),
    [overrides, baseRolePermissionKeys, pickerItems],
  );

  const additiveCount = (byMode.additive ?? []).length;
  const subtractiveCount = (byMode.subtractive ?? []).length;

  if (!fetching && loadErr && overrides.length === 0 && pickerItems.length === 0) {
    return <p className="text-[12.5px] text-[#b91c1c]">{loadErr}</p>;
  }

  const tabBtn = (active: boolean) =>
    [
      'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
      active ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:border-[#b8b8b8]',
    ].join(' ');

  const ignoreEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <section
      className="border-t border-[#e8e8e8] pt-8"
      aria-labelledby="perm-adjust-heading"
      aria-busy={fetching}
      data-no-checkbox-sound
    >
      <h3 id="perm-adjust-heading" className="text-[13px] font-semibold text-[#121212]">
        Adjust this person&apos;s permissions
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6b6b6b]">
        {memberFirstName} keeps their {roleLabel} role. Use these tabs to give them extra access, or take away specific
        things they currently have.
      </p>
      {loadErr ? <p className="mt-2 text-[12px] text-[#b91c1c]">{loadErr}</p> : null}

      <div className="relative mt-1 min-h-[min(320px,50vh)]">
        {fetching ? (
          <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-xl bg-[#faf9f6]/95 backdrop-blur-[2px]">
            <CampfireLoaderInline label="Loading access options…" />
          </div>
        ) : null}
        <div className={fetching ? 'invisible' : undefined} aria-hidden={fetching}>
      <details className="mt-4 rounded-lg border border-[#e8e8e8] bg-[#faf9f6] p-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-[#121212]">
          Current exceptions
          {additiveCount + subtractiveCount + (byMode.replace?.length ?? 0) > 0 ? (
            <span className="ml-1.5 text-[#6b6b6b]">
              ({additiveCount + subtractiveCount + (byMode.replace?.length ?? 0)})
            </span>
          ) : null}
        </summary>
        <label className="mt-3 block text-[11.5px] font-medium text-[#6b6b6b]">
          Search current access
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-2 text-[13px]"
            value={existingSearch}
            onChange={(e) => setExistingSearch(e.target.value)}
            onKeyDown={ignoreEnter}
            placeholder="Filter listed exceptions"
          />
        </label>
        <div className="mt-3 space-y-3">
          {(['additive', 'subtractive', 'replace'] as const).map((m) => (
            <div key={m}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b9b9b]">
                {m === 'additive' ? 'Extra access' : m === 'subtractive' ? 'Access removed' : 'Advanced allowlist'}
              </p>
              {filterRows(byMode[m] ?? []).length === 0 ? (
                <p className="mt-1 text-[12px] text-[#9b9b9b]">None</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
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
      </details>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Permission adjustment mode">
        <button type="button" role="tab" aria-selected={tab === 'give'} className={tabBtn(tab === 'give')} onClick={() => setTab('give')}>
          Give extra access
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'restrict'}
          className={tabBtn(tab === 'restrict')}
          onClick={() => setTab('restrict')}
        >
          Restrict access
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'advanced'}
          className={tabBtn(tab === 'advanced')}
          onClick={() => setTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {tab === 'advanced' ? (
        <div className="mt-4">
          <p className="text-[12px] leading-relaxed text-[#92400e]">
            Custom mode stops inherited role permissions for this person; only the allowlisted permissions below apply
            (plus explicit grants from “Give extra access”).
          </p>
          <label className="mt-3 block text-[12px] font-medium text-[#6b6b6b]">
            Search permissions
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px]"
              value={replaceSearch}
              onChange={(e) => setReplaceSearch(e.target.value)}
              onKeyDown={ignoreEnter}
              placeholder="Search permissions..."
            />
          </label>
          <div className="mt-3 max-h-[min(320px,45vh)] space-y-4 overflow-y-auto pr-1">
            {pickerItems.length > 0 && groupedItems.length === 0 ? (
              <p className="text-[12px] text-[#9b9b9b]">No permissions match your search.</p>
            ) : null}
            {groupedItems.map((group) => {
              const assignableInGroup = group.items.filter((i) => assignableKeys.has(i.key));
              const allReplaceGroupChecked =
                assignableInGroup.length > 0 &&
                assignableInGroup.every((p) => replaceKeys.has(p.key) || selectedReplaceKeys.has(p.key));
              return (
                <div key={`replace-${group.group}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#121212]">{group.group}</p>
                    {assignableInGroup.length > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 text-[12px] text-[#92400e] underline underline-offset-2"
                        disabled={busy}
                        onClick={() => {
                          if (allReplaceGroupChecked) {
                            setSelectedReplaceKeys((curr) => {
                              const next = new Set(curr);
                              for (const p of assignableInGroup) next.delete(p.key);
                              return next;
                            });
                            const rows = (byMode.replace ?? []).filter((o) =>
                              assignableInGroup.some((p) => p.key === o.permission_key),
                            );
                            void removeOverridesRows(rows);
                          } else {
                            setSelectedReplaceKeys((curr) => {
                              const next = new Set(curr);
                              for (const p of assignableInGroup) {
                                if (!replaceKeys.has(p.key)) next.add(p.key);
                              }
                              return next;
                            });
                          }
                        }}
                      >
                        {allReplaceGroupChecked ? 'Clear all' : 'Select all'}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const canAssign = assignableKeys.has(item.key);
                      const replaceChecked = replaceKeys.has(item.key) || selectedReplaceKeys.has(item.key);
                      return (
                        <label
                          key={`replace-${item.key}`}
                          className={[
                            'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 shadow-sm',
                            replaceChecked ? 'border-[#92400e]/40 bg-[#fff7ed]' : 'border-[#e8e8e8] bg-white',
                            !canAssign ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            className={PERM_CHECKBOX_REPLACE}
                            checked={replaceChecked}
                            disabled={busy || !canAssign}
                            onChange={(e) => {
                              const on = e.target.checked;
                              if (on) {
                                if (!replaceKeys.has(item.key)) {
                                  setSelectedReplaceKeys((curr) => new Set(curr).add(item.key));
                                }
                              } else if (replaceKeys.has(item.key)) {
                                const row = byMode.replace?.find((o) => o.permission_key === item.key);
                                if (row) void removeOverride(row);
                              } else {
                                setSelectedReplaceKeys((curr) => {
                                  const next = new Set(curr);
                                  next.delete(item.key);
                                  return next;
                                });
                              }
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-[#121212]">{item.label}</span>
                            <span className="text-[11.5px] leading-snug text-[#6b6b6b]">{item.description}</span>
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-[#92400e]">
              <span className="font-medium">{selectedReplaceKeys.size}</span> pending to add
              {replaceKeys.size > 0 ? (
                <span className="text-[#6b6b6b]"> · {replaceKeys.size} already on allowlist</span>
              ) : null}
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
                await load(true);
              }}
            >
              Add to allowlist
            </button>
          </div>
          {hasReplace ? (
            <button
              type="button"
              disabled={busy}
              className="mt-2 rounded-lg border border-[#92400e] bg-white px-3 py-2 text-[12.5px] font-medium text-[#92400e] disabled:opacity-50"
              onClick={() => void clearReplaceMode()}
            >
              Clear custom allowlist
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <label className="block text-[12px] font-medium text-[#6b6b6b]">
            Search permissions
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={ignoreEnter}
              placeholder="Search permissions..."
            />
          </label>
          <div className="mt-4 max-h-[min(420px,55vh)] space-y-4 overflow-y-auto pr-1">
            {pickerItems.length > 0 && groupedItems.length === 0 ? (
              <p className="text-[12px] text-[#9b9b9b]">No permissions match your search.</p>
            ) : null}
            {groupedItems.map((group) => {
              const assignableInGroup = group.items.filter((i) => assignableKeys.has(i.key));
              const restrict = tab === 'restrict';
              const persisted = restrict ? subtractiveKeys : additiveKeys;
              const modeKey = restrict ? 'subtractive' : 'additive';
              const allGroupChecked =
                assignableInGroup.length > 0 &&
                assignableInGroup.every((p) => persisted.has(p.key) || selectedAddKeys.has(p.key));
              return (
                <div key={group.group}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#121212]">{group.group}</p>
                    {assignableInGroup.length > 0 ? (
                      <button
                        type="button"
                        className={`shrink-0 text-[12px] underline underline-offset-2 ${restrict ? 'text-[#b91c1c]' : 'text-[#1A5FA8]'}`}
                        disabled={busy}
                        onClick={() => {
                          if (allGroupChecked) {
                            setSelectedAddKeys((curr) => {
                              const next = new Set(curr);
                              for (const p of assignableInGroup) next.delete(p.key);
                              return next;
                            });
                            const rows = (byMode[modeKey] ?? []).filter((o) =>
                              assignableInGroup.some((p) => p.key === o.permission_key),
                            );
                            void removeOverridesRows(rows);
                          } else {
                            setSelectedAddKeys((curr) => {
                              const next = new Set(curr);
                              for (const p of assignableInGroup) {
                                if (!persisted.has(p.key)) next.add(p.key);
                              }
                              return next;
                            });
                          }
                        }}
                      >
                        {allGroupChecked ? 'Clear all' : 'Select all'}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const canAssign = assignableKeys.has(item.key);
                      const persistedChecked = persisted.has(item.key);
                      const checked = persistedChecked || selectedAddKeys.has(item.key);
                      return (
                        <label
                          key={item.key}
                          className={[
                            'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 shadow-sm',
                            checked
                              ? restrict
                                ? 'border-[#fecaca] bg-[#fef2f2]'
                                : 'border-[#1A5FA8]/25 bg-[#EBF3FF]'
                              : 'border-[#e8e8e8] bg-white',
                            !canAssign ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          <input
                            type="checkbox"
                            className={restrict ? PERM_CHECKBOX_RESTRICT : PERM_CHECKBOX_ADD}
                            checked={checked}
                            disabled={busy || !canAssign}
                            onChange={(e) => {
                              const on = e.target.checked;
                              if (on) {
                                if (!persisted.has(item.key)) {
                                  setSelectedAddKeys((curr) => new Set(curr).add(item.key));
                                }
                              } else if (persisted.has(item.key)) {
                                const row = byMode[modeKey]?.find((o) => o.permission_key === item.key);
                                if (row) void removeOverride(row);
                              } else {
                                setSelectedAddKeys((curr) => {
                                  const next = new Set(curr);
                                  next.delete(item.key);
                                  return next;
                                });
                              }
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-[#121212]">{item.label}</span>
                            <span className="text-[11.5px] leading-snug text-[#6b6b6b]">{item.description}</span>
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
            <p className="mt-3 text-[12px] text-[#6b6b6b]">{permDescription([...selectedAddKeys][0]!)}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-[#6b6b6b]">
              <span className="font-medium text-[#121212]">{selectedAddKeys.size}</span> pending to apply
              {tab === 'give' && additiveKeys.size > 0 ? (
                <span className="text-[#9b9b9b]"> · {additiveKeys.size} extra access already saved</span>
              ) : null}
              {tab === 'restrict' && subtractiveKeys.size > 0 ? (
                <span className="text-[#9b9b9b]"> · {subtractiveKeys.size} restriction(s) already saved</span>
              ) : null}
            </p>
            <button
              type="button"
              disabled={busy || selectedAddKeys.size === 0}
              className={`rounded-lg px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-50 ${
                tab === 'restrict' ? 'bg-[#b91c1c]' : 'bg-[#121212]'
              }`}
              onClick={() => void addOverridesBatch([...selectedAddKeys])}
            >
              {tab === 'restrict' ? 'Apply restrictions' : 'Apply extra access'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[#e8e8e8] bg-[#f5f4f1] px-4 py-3 text-[12.5px]">
        <span className="font-medium text-[#166534]">Extra access granted: {preview.added.length}</span>
        <span className="font-medium text-[#b91c1c]">Access removed: {preview.removed.length}</span>
        {preview.roleIgnoredByReplace ? (
          <span className="font-medium text-[#92400e]">Advanced allowlist active (role inheritance off)</span>
        ) : null}
      </div>
        </div>
      </div>
    </section>
  );
}
