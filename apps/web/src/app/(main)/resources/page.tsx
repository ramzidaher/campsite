import { ResourcesListClient } from '@/components/resources/ResourcesListClient';
import { parseResourcesFolderParam } from '@/lib/resourcesFolderParam';
import { createClient } from '@/lib/supabase/server';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; q?: string; archived?: string }>;
}) {
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

  const permissionKeys = await getMyPermissions(profile.org_id as string);
  const canManage = permissionKeys.includes('resources.manage');

  const sp = await searchParams;
  const folderFilter = parseResourcesFolderParam(sp.folder);
  const initialSearch = typeof sp.q === 'string' ? sp.q : '';
  const viewArchived = canManage && (sp.archived === '1' || sp.archived === 'true');

  return (
    <ResourcesListClient
      orgId={profile.org_id as string}
      canManage={canManage}
      folderFilter={folderFilter}
      initialSearch={initialSearch}
      viewArchived={viewArchived}
    />
  );
}
