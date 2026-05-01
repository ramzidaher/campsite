import { AdminRotaView } from '@/components/admin/AdminRotaView';
import { getCachedAdminRotaPageData } from '@/lib/admin/getCachedAdminRotaPageData';
import { shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminRotaPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  const data = await getCachedAdminRotaPageData(orgId);

  return <AdminRotaView data={data} />;
}
