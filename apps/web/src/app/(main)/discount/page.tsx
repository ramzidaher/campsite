import { DiscountCardClient } from '@/components/discount/DiscountCardClient';
import { createClient } from '@/lib/supabase/server';
import { canVerifyStaffDiscountQr } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function DiscountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');

  const canScan = canVerifyStaffDiscountQr(profile.role);

  const { data: org } = await supabase
    .from('organisations')
    .select('name')
    .eq('id', profile.org_id)
    .maybeSingle();

  return (
    <DiscountCardClient
      profile={{
        id: profile.id,
        org_id: profile.org_id,
        role: profile.role,
        full_name: profile.full_name,
      }}
      orgName={(org?.name as string | null) ?? null}
      canScan={canScan}
    />
  );
}
