import { OrgSettingsClient } from '@/components/admin/OrgSettingsClient';
import { createClient } from '@/lib/supabase/server';
import { canManageOrgSettings } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

export default async function OrgAdminSettingsPage() {
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

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!canManageOrgSettings(profile.role)) redirect('/admin');

  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug, logo_url, default_notifications_enabled, deactivation_requested_at')
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
      }}
    />
  );
}
