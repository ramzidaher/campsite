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
    .select('id, name, slug, logo_url, default_notifications_enabled, deactivation_requested_at, timezone')
    .eq('id', profile.org_id)
    .single();

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
      }}
    />
  );
}
