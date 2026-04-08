import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';

/**
 * Ensures every requested key is in the catalog snapshot and assignable for this viewer.
 * Used by API routes for fast 400s; database RPCs enforce the same rules for direct callers.
 */
export function validateCustomRolePermissionKeys(
  requestedKeys: string[],
  pickerItems: PermissionPickerItem[],
): { ok: true } | { ok: false; error: string; invalid_keys?: string[] } {
  const assignable = new Set(
    pickerItems.filter((i) => i.assignable_into_custom_role).map((i) => i.key),
  );
  const invalid: string[] = [];
  for (const raw of requestedKeys) {
    const k = String(raw ?? '').trim();
    if (k === '') continue;
    if (!assignable.has(k)) invalid.push(k);
  }
  if (invalid.length) {
    return {
      ok: false,
      error: 'Permission set includes keys you cannot assign or unknown keys',
      invalid_keys: invalid,
    };
  }
  return { ok: true };
}
