import { DiscountTiersClient } from '@/components/settings/DiscountTiersClient';
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
  const { data: canViewDiscounts } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'discounts.view',
    p_context: {},
  });
  if (!canViewDiscounts) {
    redirect('/settings');
  }

  return <DiscountTiersClient orgId={profile.org_id} />;
}
