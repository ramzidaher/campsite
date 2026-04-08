/**
 * Pure mirror of the core composition order in `public.has_permission` (Phase 4)
 * for overrides + role grants. Subtractive always wins; replace mode ignores base role grants.
 * Source of truth: PostgreSQL `has_permission` in migrations.
 */

export type OverrideRow = { mode: 'additive' | 'subtractive' | 'replace'; permission_key: string };

export function effectivePermissionWithOverrides(input: {
  permissionKey: string;
  /** Permissions granted by the user's active role row(s) before overrides. */
  roleGrantedKeys: ReadonlySet<string>;
  overrideRows: readonly OverrideRow[];
}): boolean {
  const key = input.permissionKey;
  const subtractive = new Set(
    input.overrideRows.filter((o) => o.mode === 'subtractive').map((o) => o.permission_key),
  );
  if (subtractive.has(key)) return false;

  const hasReplace = input.overrideRows.some((o) => o.mode === 'replace');
  if (hasReplace) {
    const replaceOrAdditive = new Set(
      input.overrideRows
        .filter((o) => o.mode === 'replace' || o.mode === 'additive')
        .map((o) => o.permission_key),
    );
    return replaceOrAdditive.has(key);
  }

  if (input.roleGrantedKeys.has(key)) return true;
  const additiveOnly = new Set(
    input.overrideRows.filter((o) => o.mode === 'additive').map((o) => o.permission_key),
  );
  return additiveOnly.has(key);
}
