import { DiscountTiersClient } from '@/components/settings/DiscountTiersClient';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function DiscountTiersPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');
  const orgId = profile.org_id as string;
  const permissionKeys = await getMyPermissions(orgId);
  if (!permissionKeys.includes('discounts.view')) redirect('/settings');

  return <DiscountTiersClient orgId={orgId} />;
}
