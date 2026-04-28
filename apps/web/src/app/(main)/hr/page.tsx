import { HrOverviewSnapshotClient } from '@/components/hr/HrOverviewSnapshotClient';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMainShellHrNavItemsByPermissions } from '@/lib/adminGates';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';

export default async function HrOverviewPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!getMainShellHrNavItemsByPermissions(permissionKeys)?.length) redirect('/broadcasts');

  const badges = parseShellBadgeCounts(bundle);
  return (
    <div className="font-sans text-[#121212]">
      <div className="mb-7">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">People</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-[#6b6b6b]">
          Hiring and people metrics at a glance — same type styles as Time off. Open a card to jump in; use{' '}
          <Link href="/leave" className="font-medium text-[#121212] underline-offset-2 hover:underline">
            Time off
          </Link>{' '}
          for balances and requests.
        </p>
      </div>
      <HrOverviewSnapshotClient permissionKeys={permissionKeys} badges={badges} />
    </div>
  );
}
