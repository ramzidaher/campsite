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

export function shellBundleHasProfile(data: unknown): boolean {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return b['has_profile'] === true;
}

export function shellBundleProfileRole(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['profile_role'];
  return typeof v === 'string' ? v : null;
}

export function shellBundleProfileFullName(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['profile_full_name'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function shellBundleProfilePreferredName(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['profile_preferred_name'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function shellBundleProfileAvatarUrl(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['profile_avatar_url'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function shellBundleEmail(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['email'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function shellBundleUiMode(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['ui_mode'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function shellBundleOrgName(data: unknown): string | null {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const v = b['org_name'];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
