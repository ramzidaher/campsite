import { OrgSettingsClient } from '@/components/admin/OrgSettingsClient';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/adminGates';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function OrgAdminSettingsPage() {
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
  if (!hasPermission(permissionKeys, 'roles.manage')) redirect('/admin');

  const { data: org } = await supabase
    .from('organisations')
    .select(
      'id, name, slug, logo_url, default_notifications_enabled, deactivation_requested_at, timezone, brand_preset_key, brand_tokens, brand_policy'
    )
    .eq('id', profile.org_id)
    .single();
  const { data: orgCelebrationModes } = await supabase
    .from('org_celebration_modes')
    .select(
      'id,mode_key,label,is_enabled,display_order,auto_start_month,auto_start_day,auto_end_month,auto_end_day,gradient_override,emoji_primary,emoji_secondary'
    )
    .eq('org_id', profile.org_id)
    .order('display_order', { ascending: true })
    .order('label', { ascending: true });

  if (!org) redirect('/admin');

  return (
    <OrgSettingsClient
      initial={{
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        logo_url: (org.logo_url as string | null) ?? null,
        default_notifications_enabled: org.default_notifications_enabled as boolean,
        deactivation_requested_at: (org.deactivation_requested_at as string | null) ?? null,
        timezone: (org.timezone as string | null) ?? null,
        brand_preset_key: (org.brand_preset_key as string | null) ?? null,
        brand_tokens: (org.brand_tokens as Record<string, string> | null) ?? null,
        brand_policy: (org.brand_policy as string | null) ?? null,
      }}
      initialCelebrationModes={
        (orgCelebrationModes ?? []) as Array<{
          id: string;
          mode_key: string;
          label: string;
          is_enabled: boolean;
          display_order: number;
          auto_start_month: number | null;
          auto_start_day: number | null;
          auto_end_month: number | null;
          auto_end_day: number | null;
          gradient_override: string | null;
          emoji_primary: string | null;
          emoji_secondary: string | null;
        }>
      }
    />
  );
}
