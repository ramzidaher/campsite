import { cache } from 'react';
import type { PermissionKey } from '@campsite/types';
import { createClient } from './server';

/**
 * Returns all permission keys for the current user in the given org.
 *
 * Wrapped with React cache() so layout and child pages share one DB call per
 * request. The layout fetches permissions for nav display; pages fetching them
 * again (e.g. for access control) now get a free cache hit.
 */
export const getMyPermissions = cache(async (orgId: string): Promise<PermissionKey[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_my_permissions', { p_org_id: orgId });
  if (!Array.isArray(data)) return [];
  return data.map((p) =>
    String((p as { permission_key?: string }).permission_key ?? '')
  ) as PermissionKey[];
});
