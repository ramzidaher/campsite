'use client';

import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
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
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'additive' | 'subtractive' | 'replace'>('additive');
  const [permKey, setPermKey] = useState('');

  const assignableKeys = useMemo(
    () => pickerItems.filter((i) => i.assignable_into_custom_role).map((i) => i.key),
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
    };
    if (!res.ok) {
      setLoadErr(data.error ?? 'Could not load permission overrides');
      return;
    }
    setOverrides(data.overrides ?? []);
    setPickerItems(data.permission_picker?.items ?? []);
  }, [targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addOverride() {
    if (!permKey.trim()) return;
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

  if (loadErr && overrides.length === 0 && pickerItems.length === 0) {
    return <p className="text-[12.5px] text-[#b91c1c]">{loadErr}</p>;
  }

  return (
    <div className="mt-5 border-t border-[#e8e8e8] pt-4">
      <h3 className="text-[13px] font-semibold text-[#121212]">Permission overrides</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-[#6b6b6b]">
        Fine-grained grants or revocations for this person. Server rules still apply — you cannot exceed your own access.
        {hasReplace ? (
          <span className="mt-1 block font-medium text-[#92400e]">
            Replace mode is active: their role permissions are ignored until replace rows are removed.
          </span>
        ) : null}
      </p>
      {loadErr ? <p className="mt-2 text-[12px] text-[#b91c1c]">{loadErr}</p> : null}

      <div className="mt-3 space-y-3 rounded-lg border border-[#e8e8e8] bg-[#faf9f6] p-3">
        {(['additive', 'subtractive', 'replace'] as const).map((m) => (
          <div key={m}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">{m}</p>
            {(byMode[m] ?? []).length === 0 ? (
              <p className="text-[12px] text-[#9b9b9b]">None</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {(byMode[m] ?? []).map((o) => (
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

      {hasReplace ? (
        <button
          type="button"
          disabled={busy}
          className="mt-2 text-[12px] font-medium text-[#92400e] underline underline-offset-2 disabled:opacity-50"
          onClick={() => void clearReplaceMode()}
        >
          Clear all replace overrides
        </button>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="block text-[12px] font-medium text-[#6b6b6b]">
          Mode
          <select
            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-2 text-[13px]"
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="additive">Additive (grant)</option>
            <option value="subtractive">Subtractive (revoke)</option>
            <option value="replace">Replace allowlist</option>
          </select>
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
            {assignableKeys.map((k) => (
              <option key={k} value={k}>
                {permLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !permKey}
        className="mt-3 rounded-lg bg-[#121212] px-3 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
        onClick={() => void addOverride()}
      >
        Add override
      </button>
    </div>
  );
}
