import { ReportsHomeClient } from '@/components/reports/ReportsHomeClient';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function ReportsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const permissionKeys = parseShellPermissionKeys(bundle);
  const canManage = permissionKeys.includes('reports.manage');
  const canView = canManage || permissionKeys.includes('reports.view');
  if (!canView) redirect('/dashboard');

  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 py-8 sm:px-7 font-sans text-[#121212]">
      <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Reports</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
        Build and run HR and Finance reports with saved views, scheduling, and scoped exports.
      </p>
      <div className="mt-8">
        <ReportsHomeClient canManage={canManage} />
      </div>
    </div>
  );
}
