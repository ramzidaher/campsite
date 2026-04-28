import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';

/** Nav lives in the main shell under “Manager” (same idea as `/admin`). */
export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const shellBundle = await getCachedMainShellLayoutBundle().catch(() => null);
  const orgId = shellBundleOrgId(shellBundle);
  const keys = parseShellPermissionKeys(shellBundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(shellBundle) !== 'active') redirect('/broadcasts');
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
