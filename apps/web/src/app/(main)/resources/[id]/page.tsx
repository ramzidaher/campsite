import { ResourceDetailClient } from '@/components/resources/ResourceDetailClient';
import { parseStaffResourceFolderEmbed } from '@/lib/staffResourceFolderEmbed';
import {
  isMissingArchivedAtColumn,
  STAFF_RESOURCE_DETAIL_SELECT_LEGACY,
  STAFF_RESOURCE_DETAIL_SELECT_WITH_ARCHIVE,
} from '@/lib/staffResourceArchiveCompat';
import { createClient } from '@/lib/supabase/server';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { notFound, redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');

  let row = await supabase
    .from('staff_resources')
    .select(STAFF_RESOURCE_DETAIL_SELECT_WITH_ARCHIVE)
    .eq('id', id)
    .maybeSingle();

  let archiveSupported = true;
  if (row.error && isMissingArchivedAtColumn(row.error)) {
    archiveSupported = false;
    row = await supabase
      .from('staff_resources')
      .select(STAFF_RESOURCE_DETAIL_SELECT_LEGACY)
      .eq('id', id)
      .maybeSingle();
  }

  if (row.error || !row.data) notFound();
  const data = row.data;

  const permissionKeys = await getMyPermissions(profile.org_id as string);
  const canManage = permissionKeys.includes('resources.manage');

  return (
    <div className="font-sans min-h-0 bg-[var(--campsite-bg,#faf9f6)] text-[var(--campsite-text,#121212)]">
      <ResourceDetailClient
        canManage={canManage}
        archiveSupported={archiveSupported}
        initial={{
          id: data.id as string,
          title: data.title as string,
          description: (data.description as string) ?? '',
          file_name: data.file_name as string,
          mime_type: data.mime_type as string,
          byte_size: Number(data.byte_size ?? 0),
          storage_path: data.storage_path as string,
          updated_at: data.updated_at as string,
          archived_at: archiveSupported ? ((data.archived_at as string | null) ?? null) : null,
          folder: parseStaffResourceFolderEmbed(data.staff_resource_folders),
        }}
      />
    </div>
  );
}
