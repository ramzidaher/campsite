import { DiscountTiersClient } from '@/components/settings/DiscountTiersClient';
import { createClient } from '@/lib/supabase/server';
import { isOrgAdminRole } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function DiscountTiersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');
  if (!isOrgAdminRole(profile.role)) {
    redirect('/settings');
  }

  return <DiscountTiersClient orgId={profile.org_id} />;
}
