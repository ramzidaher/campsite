import { createClient } from '@/lib/supabase/server';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

/** Nav lives in the main shell under “Manager” (same idea as `/admin`). */
export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const shellBundle = await getCachedMainShellLayoutBundle().catch(() => null);
  const shellOrgId =
    shellBundle && typeof shellBundle.org_id === 'string' ? shellBundle.org_id : null;
  const shellPermissionKeys = Array.isArray(shellBundle?.permission_keys)
    ? shellBundle.permission_keys.map((k) => String(k))
    : null;

  let keys = shellPermissionKeys ?? [];
  let orgId = shellOrgId;
  if (!orgId || !shellPermissionKeys) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
    orgId = profile.org_id;
    const { data: permissions } = await supabase.rpc('get_my_permissions', { p_org_id: orgId });
    keys = Array.isArray(permissions)
      ? (permissions as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''))
      : [];
  }

  if (!orgId) redirect('/broadcasts');
  const canAccessManagerWorkspace = keys.some(
    (k) =>
      k === 'recruitment.view' ||
      k === 'recruitment.create_request' ||
      k === 'recruitment.manage' ||
      k === 'recruitment.approve_request' ||
      k === 'departments.view' ||
      k === 'teams.view' ||
      k === 'approvals.members.review'
  );
  if (!canAccessManagerWorkspace) redirect('/broadcasts');

  return <div className="min-w-0 w-full px-5 py-7 pb-10 sm:px-[28px]">{children}</div>;
}
