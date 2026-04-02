import { createClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@campsite/types';

export async function hasServerPermission(permission: PermissionKey, orgId?: string | null): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId ?? null,
    p_permission_key: permission,
    p_context: {},
  });
  if (error) return false;
  return Boolean(data);
}

