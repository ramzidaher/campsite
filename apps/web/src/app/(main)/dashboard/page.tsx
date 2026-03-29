import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { loadDashboardHome } from '@/lib/dashboard/loadDashboardHome';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';
import {
  canComposeBroadcast,
  isBroadcastDraftOnlyRole,
  isOrgAdminRole,
  type ProfileRole,
} from '@campsite/types';
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

  const role = profile.role as ProfileRole;
  const data = await loadDashboardHome(supabase, user.id, profile.org_id as string, {
    full_name: profile.full_name as string | null,
    role: profile.role as string,
  });

  const hour = new Date().getHours();
  const greetingLine = `${greeting(hour, data.userName)} 👋`;

  const canViewOrgDirectory = isOrgAdminRole(role);
  const canCompose = canComposeBroadcast(role);
  const showPrimaryComposeCta = canCompose && !isBroadcastDraftOnlyRole(role);

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
