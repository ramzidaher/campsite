import { BroadcastDetailView } from '@/components/broadcasts/BroadcastDetailView';
import { getCachedBroadcastDetailPageData } from '@/lib/broadcasts/getCachedBroadcastDetailPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { notFound, redirect } from 'next/navigation';

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await withServerPerf('/broadcasts/[id]', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const viewerUserIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const viewerUserId = typeof viewerUserIdRaw === 'string' ? viewerUserIdRaw : '';
  if (!viewerUserId) redirect('/login');

  const pageData = await withServerPerf(
    '/broadcasts/[id]',
    'cached_broadcast_detail_page_data',
    getCachedBroadcastDetailPageData(orgId, viewerUserId, id),
    800
  );
  if (!pageData) notFound();

  return (
    <BroadcastDetailView
      userId={viewerUserId}
      orgId={orgId}
      showAdminChannelNote={permissionKeys.includes('broadcasts.publish_without_approval')}
      canSetCover={pageData.canSetCover}
      navigation={pageData.navigation}
      mayEdit={pageData.mayEdit}
      initialReplies={pageData.initialReplies}
      initial={pageData.initial}
    />
  );
}
