import { BroadcastEditForm } from '@/components/broadcasts/BroadcastEditForm';
import { getCachedBroadcastEditPageData } from '@/lib/broadcasts/getCachedBroadcastEditPageData';
import {
  shellBundleOrgId,
  shellBundleProfileFullName,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { notFound, redirect } from 'next/navigation';

export default async function BroadcastEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await withServerPerf('/broadcasts/[id]/edit', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const viewerUserIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const viewerUserId = typeof viewerUserIdRaw === 'string' ? viewerUserIdRaw : '';
  if (!viewerUserId) redirect('/login');

  const pageData = await withServerPerf(
    '/broadcasts/[id]/edit',
    'cached_broadcast_edit_page_data',
    getCachedBroadcastEditPageData(orgId, viewerUserId, id),
    650
  );

  if (!pageData) notFound();
  if (!pageData.mayEdit) redirect(`/broadcasts/${id}`);

  return (
    <BroadcastEditForm
      broadcastId={pageData.id}
      userId={viewerUserId}
      initialTitle={pageData.title}
      initialBody={pageData.body}
      initialCoverUrl={pageData.coverImageUrl}
      status={pageData.status}
      initialScheduledAt={pageData.scheduledAt}
      viewerDisplayName={shellBundleProfileFullName(bundle)}
    />
  );
}
