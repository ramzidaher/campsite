import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

/** Org tenant admin routes; nav lives in the main shell under “Admin”. */
export default async function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const hasAdminAccess = permissionKeys.some(
    (key) =>
      key.startsWith('members.') ||
      key.startsWith('roles.') ||
      key.startsWith('recruitment.') ||
      key.startsWith('jobs.') ||
      key.startsWith('applications.') ||
      key.startsWith('offers.') ||
      key.startsWith('interviews.')
  );
  if (!hasAdminAccess) redirect('/broadcasts');

  return <div className="min-w-0">{children}</div>;
}
