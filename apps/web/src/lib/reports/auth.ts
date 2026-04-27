import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getMainShellLayoutBundleForViewer } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createSupabaseForApiRequest, getUserFromApiRequest } from '@/lib/supabase/apiRouteAuth';
import { createClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@campsite/types';

function reportsCapabilityFlags(permissions: PermissionKey[]) {
  const canManage = permissions.includes('reports.manage');
  const canView = canManage || permissions.includes('reports.view');
  const orgWideDataAccess =
    canManage ||
    permissions.includes('hr.view_records') ||
    permissions.includes('payroll.manage') ||
    permissions.includes('payroll.view');
  return { canManage, canView, orgWideDataAccess };
}

export type ReportsViewer = {
  userId: string;
  orgId: string;
  departmentId: string | null;
  permissions: PermissionKey[];
  canView: boolean;
  canManage: boolean;
  orgWideDataAccess: boolean;
};

type ReportsAuthProfile = { org_id: string | null; status: string | null; department_id: string | null };
type ReportsAuthSupabase = {
  from: (table: 'profiles') => {
    select: (columns: string) => {
      eq: (column: 'id', value: string) => {
        maybeSingle: () => Promise<{ data: ReportsAuthProfile | null }>;
      };
    };
  };
};

async function buildReportsViewer(userId: string, supabase: ReportsAuthSupabase): Promise<ReportsViewer | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, department_id')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;

  const orgId = String(profile.org_id);
  const permissions = await getMyPermissions(orgId, supabase);
  const { canManage, canView, orgWideDataAccess } = reportsCapabilityFlags(permissions);

  return {
    userId,
    orgId,
    departmentId: profile.department_id ? String(profile.department_id) : null,
    permissions,
    canView,
    canManage,
    orgWideDataAccess,
  };
}

export async function getReportsViewer(): Promise<ReportsViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return buildReportsViewer(user.id, supabase);
}

export async function getReportsViewerFromRequest(req: Request): Promise<ReportsViewer | null> {
  const user = await getUserFromApiRequest(req);
  if (!user) return null;
  const supabase = await createSupabaseForApiRequest(req);
  if (!supabase) return null;
  const direct = await buildReportsViewer(user.id, supabase);
  if (direct) return direct;

  // Fallback: derive org + permissions from the shell structural RPC when
  // profile row reads are blocked by route-context auth quirks.
  const serverClient = await createClient();
  const { data: serverProfile } = await serverClient
    .from('profiles')
    .select('org_id, status, department_id')
    .eq('id', user.id)
    .maybeSingle();
  const serverDepartmentId =
    serverProfile?.department_id != null ? String(serverProfile.department_id) : null;
  const shell = await getMainShellLayoutBundleForViewer(serverClient, user.id);
  const orgId = shellBundleOrgId(shell);
  if (!orgId || shellBundleProfileStatus(shell) !== 'active') return null;
  const permissions = parseShellPermissionKeys(shell);
  const { canManage, canView, orgWideDataAccess } = reportsCapabilityFlags(permissions);

  return {
    userId: user.id,
    orgId,
    departmentId: serverDepartmentId,
    permissions,
    canView,
    canManage,
    orgWideDataAccess,
  };
}
