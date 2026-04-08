import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionPickerItem } from '@/lib/authz/customRolePickerContract';
import { CUSTOM_ROLE_PICKER_SCHEMA_VERSION } from '@/lib/authz/customRolePickerContract';

/**
 * Builds permission picker rows: assignable_into_custom_role = viewer effectively has this key
 * (via has_permission / get_my_permissions semantics).
 */
export async function buildPermissionPickerItems(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ items: PermissionPickerItem[]; schema_version: typeof CUSTOM_ROLE_PICKER_SCHEMA_VERSION }> {
  const [{ data: catalog, error: catErr }, { data: mine, error: mineErr }] = await Promise.all([
    supabase
      .from('permission_catalog')
      .select('key, label, description, is_founder_only')
      .order('key'),
    supabase.rpc('get_my_permissions', { p_org_id: orgId }),
  ]);
  if (catErr) throw new Error(catErr.message);
  if (mineErr) throw new Error(mineErr.message);

  const granted = new Set<string>();
  for (const row of mine ?? []) {
    const key =
      typeof row === 'object' && row !== null && 'permission_key' in row
        ? String((row as { permission_key: string }).permission_key)
        : String(row);
    if (key) granted.add(key);
  }

  const items: PermissionPickerItem[] = (catalog ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description ?? '',
    is_founder_only: Boolean(row.is_founder_only),
    assignable_into_custom_role: granted.has(row.key),
  }));

  return { items, schema_version: CUSTOM_ROLE_PICKER_SCHEMA_VERSION };
}
