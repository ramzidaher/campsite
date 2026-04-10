import { DiscountScannerClient } from '@/components/discount/DiscountScannerClient';
import { createClient } from '@/lib/supabase/server';
import { canVerifyStaffDiscountQr } from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function DiscountScanPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');
  if (!canVerifyStaffDiscountQr(profile.role)) {
    redirect('/discount');
  }

  return <DiscountScannerClient />;
}
