import { effectivePermissionWithOverrides, type OverrideRow } from '@/lib/authz/overrideComposition';
import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';

/**
 * Case-insensitive permission search: every whitespace-separated term must appear somewhere in
 * key, label, or description (order-independent). Safe if label/description are null/undefined.
 */
export function permissionPickerMatchesQuery(
  item: Pick<PermissionPickerItem, 'key' | 'label' | 'description'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${item.key} ${item.label ?? ''} ${item.description ?? ''}`.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

export type EffectiveAccessSummary = {
  inherited: string[];
  added: string[];
  removed: string[];
  effective: string[];
  roleIgnoredByReplace: boolean;
};

export function groupPermissionPickerItems(items: PermissionPickerItem[]): Array<{ group: string; items: PermissionPickerItem[] }> {
  const byGroup = new Map<string, PermissionPickerItem[]>();
  for (const item of items) {
    const group = item.key.includes('.') ? item.key.split('.')[0]!.replace(/_/g, ' ') : 'other';
    const title = group.charAt(0).toUpperCase() + group.slice(1);
    const arr = byGroup.get(title) ?? [];
    arr.push(item);
    byGroup.set(title, arr);
  }

  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, groupedItems]) => ({
      group,
      items: groupedItems.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '')),
    }));
}

export function buildEffectiveAccessSummary(input: {
  overrideRows: readonly OverrideRow[];
  baseRolePermissionKeys: readonly string[];
  candidatePermissionKeys: readonly string[];
}): EffectiveAccessSummary {
  const base = new Set(input.baseRolePermissionKeys);
  const keys = [...new Set(input.candidatePermissionKeys)];
  const inherited: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const effective: string[] = [];

  for (const key of keys) {
    const before = base.has(key);
    const after = effectivePermissionWithOverrides({
      permissionKey: key,
      roleGrantedKeys: base,
      overrideRows: input.overrideRows,
    });
    if (before) inherited.push(key);
    if (after) effective.push(key);
    if (!before && after) added.push(key);
    if (before && !after) removed.push(key);
  }

  const roleIgnoredByReplace = input.overrideRows.some((o) => o.mode === 'replace');
  return { inherited, added, removed, effective, roleIgnoredByReplace };
}
