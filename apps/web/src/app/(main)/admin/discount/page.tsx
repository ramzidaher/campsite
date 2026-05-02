import { AdminDiscountRulesClient } from '@/components/admin/AdminDiscountRulesClient';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/adminGates';
import type { ProfileRole } from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminDiscountPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));
  if (!hasPermission(permissionKeys, 'discounts.view')) redirect('/forbidden');

  const { data: tiers } = await supabase
    .from('discount_tiers')
    .select('id, role, label, discount_value, valid_at')
    .eq('org_id', profile.org_id)
    .order('role');

  return (
    <AdminDiscountRulesClient
      orgId={profile.org_id as string}
      initialTiers={
        (tiers ?? []) as {
          id: string;
          role: ProfileRole;
          label: string;
          discount_value: string | null;
          valid_at: string | null;
        }[]
      }
    />
  );
}
