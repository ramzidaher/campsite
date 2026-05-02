import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@campsite/types';

export type ViewerContext = {
  orgId: string;
  status: string;
  permissionKeys: PermissionKey[];
};

export async function getViewerContext(): Promise<ViewerContext | null> {
  const shellBundle = await getCachedMainShellLayoutBundle().catch(() => null);
  if (shellBundle) {
    const orgId = shellBundleOrgId(shellBundle);
    const status = shellBundleProfileStatus(shellBundle);
    if (orgId && status === 'active') {
      return {
        orgId,
        status,
        permissionKeys: parseShellPermissionKeys(shellBundle),
      };
    }
  }

  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  const orgId = String(profile.org_id);
  return {
    orgId,
    status: String(profile.status),
    permissionKeys: await getMyPermissions(orgId),
  };
}

export async function viewerHasPermission(permission: PermissionKey): Promise<boolean> {
  const context = await getViewerContext();
  if (!context) return false;
  return context.permissionKeys.includes(permission);
}

/** True if the viewer may open the org-wide recruitment request queue (RLS still applies). */
export async function viewerHasRecruitmentQueueAccess(): Promise<boolean> {
  const context = await getViewerContext();
  if (!context) return false;
  return context.permissionKeys.some((k) =>
    (['recruitment.view', 'recruitment.manage', 'recruitment.approve_request'] as PermissionKey[]).includes(k)
  );
}

export async function viewerHasAnyAdminAccess(): Promise<boolean> {
  const context = await getViewerContext();
  if (!context) return false;
  return context.permissionKeys.some(
    (k) =>
      k.startsWith('members.') ||
      k.startsWith('roles.') ||
      k.startsWith('recruitment.') ||
      k.startsWith('jobs.') ||
      k.startsWith('applications.') ||
      k.startsWith('offers.') ||
      k.startsWith('interviews.')
  );
}
