import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@campsite/types';

export type ViewerContext = {
  userId: string;
  orgId: string;
  status: string;
};

export async function getViewerContext(): Promise<ViewerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  return { userId: user.id, orgId: String(profile.org_id), status: String(profile.status) };
}

export async function viewerHasPermission(permission: PermissionKey): Promise<boolean> {
  const context = await getViewerContext();
  if (!context) return false;
  const keys = await getMyPermissions(context.orgId);
  return keys.includes(permission);
}

/** True if the viewer may open the org-wide recruitment request queue (RLS still applies). */
export async function viewerHasRecruitmentQueueAccess(): Promise<boolean> {
  const context = await getViewerContext();
  if (!context) return false;
  const keys = await getMyPermissions(context.orgId);
  return keys.some((k) => (['recruitment.view', 'recruitment.manage', 'recruitment.approve_request'] as PermissionKey[]).includes(k));
}

export async function viewerHasAnyAdminAccess(): Promise<boolean> {
  const supabase = await createClient();
  const context = await getViewerContext();
  if (!context) return false;
  const { data, error } = await supabase.rpc('get_my_permissions', { p_org_id: context.orgId });
  if (error || !Array.isArray(data)) return false;
  const keys = (data as Array<{ permission_key?: string }>).map((r) => String(r.permission_key ?? ''));
  return keys.some((k) => k.startsWith('members.') || k.startsWith('roles.') || k.startsWith('recruitment.') || k.startsWith('jobs.') || k.startsWith('applications.') || k.startsWith('offers.') || k.startsWith('interviews.'));
}

