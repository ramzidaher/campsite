import { ResourceDetailClient } from '@/components/resources/ResourceDetailClient';
import { parseStaffResourceFolderEmbed } from '@/lib/staffResourceFolderEmbed';
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

  const { data: row, error } = await supabase
    .from('staff_resources')
    .select(
      'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, folder_id, staff_resource_folders(id, name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row) notFound();

  const permissionKeys = await getMyPermissions(profile.org_id as string);
  const canManage = permissionKeys.includes('resources.manage');

  return (
    <ResourceDetailClient
      canManage={canManage}
      initial={{
        id: row.id as string,
        title: row.title as string,
        description: (row.description as string) ?? '',
        file_name: row.file_name as string,
        mime_type: row.mime_type as string,
        byte_size: Number(row.byte_size ?? 0),
        storage_path: row.storage_path as string,
        updated_at: row.updated_at as string,
        folder: parseStaffResourceFolderEmbed(row.staff_resource_folders),
      }}
    />
  );
}
