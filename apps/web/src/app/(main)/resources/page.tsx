import { ResourcesListClient } from '@/components/resources/ResourcesListClient';
import { createClient } from '@/lib/supabase/server';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function ResourcesPage() {
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

  return (
    <ResourcesListClient orgId={profile.org_id as string} canManage={canManage} />
  );
}
