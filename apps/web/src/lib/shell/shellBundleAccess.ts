import type { PermissionKey } from '@campsite/types';

/** Permission keys from `main_shell_layout_structural` (same shape as merged shell bundle). */
export function parseShellPermissionKeys(data: unknown): PermissionKey[] {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const raw = b['permission_keys'];
  if (!Array.isArray(raw)) return [];
  return raw.map(String) as PermissionKey[];
}

export function shellBundleOrgId(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['org_id'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function shellBundleProfileStatus(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['profile_status'];
  return typeof v === 'string' ? v : null;
}
