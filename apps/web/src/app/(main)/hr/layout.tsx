import { HrWorkspaceShell } from '@/components/hr/HrWorkspaceShell';
import { getMainShellHrNavItemsByPermissions } from '@/lib/adminGates';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

/**
 * HR chrome: reuse the cached main-shell bundle from `(main)/layout` (same request, React `cache()`).
 * Avoids an extra profiles row + `get_my_permissions` RPC here.
 */
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const permissionKeys = parseShellPermissionKeys(bundle);
  const hrNavItemsRaw = getMainShellHrNavItemsByPermissions(permissionKeys);
  const shellBadges = parseShellBadgeCounts(bundle);
  const recruitmentPendingReviewCount = shellBadges.recruitment_pending_review;
  const navItems =
    hrNavItemsRaw?.map((item) => {
      if (item.href === '/hr/hiring' && recruitmentPendingReviewCount > 0) {
        return { ...item, badge: recruitmentPendingReviewCount };
      }
      return item;
    }) ?? [];

  return <HrWorkspaceShell navItems={navItems}>{children}</HrWorkspaceShell>;
}
