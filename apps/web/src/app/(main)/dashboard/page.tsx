import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { loadDashboardHome } from '@/lib/dashboard/loadDashboardHome';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';
import { canComposeBroadcastByPermissions, type PermissionKey } from '@campsite/types';
import { redirect } from 'next/navigation';

function greeting(hour: number, name: string) {
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.org_id) {
    if (await isPlatformFounder(supabase, user.id)) {
      redirect('/founders');
    }
    redirect('/login');
  }
  if (profile.status !== 'active') redirect('/pending');

  const { data: permissionRows } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id as string });
  const permissionKeys = ((permissionRows ?? []) as Array<{ permission_key?: string }>)
    .map((row) => String(row.permission_key ?? ''))
    .filter((key): key is PermissionKey => key.length > 0);
  const data = await loadDashboardHome(supabase, user.id, profile.org_id as string, {
    full_name: profile.full_name as string | null,
    role: profile.role as string,
  });

  const hour = new Date().getHours();
  const greetingLine = `${greeting(hour, data.userName)} 👋`;

  const canViewOrgDirectory = permissionKeys.includes('members.view');
  const canCompose = canComposeBroadcastByPermissions(permissionKeys);
  const showPrimaryComposeCta = canCompose && permissionKeys.includes('broadcasts.publish_without_approval');

  return (
    <DashboardHome
      data={data}
      greetingLine={greetingLine}
      canCompose={canCompose}
      showPrimaryComposeCta={showPrimaryComposeCta}
      membersStatHref={canViewOrgDirectory ? '/admin/users' : null}
    />
  );
}
