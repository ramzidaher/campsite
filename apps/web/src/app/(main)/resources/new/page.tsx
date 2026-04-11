import { ResourceNewClient } from '@/components/resources/ResourceNewClient';
import { parseResourcesFolderParam } from '@/lib/resourcesFolderParam';
import { createClient } from '@/lib/supabase/server';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ResourceNewPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
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
  if (!permissionKeys.includes('resources.manage')) {
    redirect('/resources');
  }

  const sp = await searchParams;
  const defaultFolder = parseResourcesFolderParam(sp.folder);

  return (
    <ResourceNewClient
      orgId={profile.org_id as string}
      userId={profile.id as string}
      defaultFolder={defaultFolder}
    />
  );
}
