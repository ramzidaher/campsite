import { AppShell } from '@/components/AppShell';
import { MainProviders } from '@/components/providers/MainProviders';
import { ThemeRoot } from '@/components/ThemeRoot';
import { getPendingApprovalCount } from '@/lib/dashboard/loadDashboardHome';
import { canAccessOrgAdminArea, getMainShellAdminNavItems } from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import { isApproverRole } from '@campsite/types';

function roleLabel(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'Org admin',
    super_admin: 'Org admin',
    manager: 'Manager',
    coordinator: 'Coordinator',
    administrator: 'Administrator',
    duty_manager: 'Duty manager',
    csa: 'CSA',
    society_leader: 'Society leader',
  };
  return m[role] ?? role;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileRole: string | null = null;
  let orgName = 'Organisation';
  let userName = 'Member';
  let userRoleLabel = '';
  let deptLine: string | null = null;
  let unreadBroadcasts = 0;
  let pendingApprovalCount = 0;
  let showManager = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, org_id, full_name')
      .eq('id', user.id)
      .maybeSingle();

    const rawRole = profile?.role as string | null | undefined;
    profileRole = rawRole != null && String(rawRole).trim() !== '' ? String(rawRole).trim() : null;
    userName = (profile?.full_name as string)?.trim() || 'Member';
    userRoleLabel = profileRole ? roleLabel(profileRole) : '';

    if (profile?.org_id) {
      const orgId = profile.org_id as string;
      const { data: org } = await supabase.from('organisations').select('name').eq('id', orgId).maybeSingle();
      orgName = (org?.name as string) ?? orgName;

      const { data: ud } = await supabase
        .from('user_departments')
        .select('departments(name)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      const d = ud?.departments as { name: string } | { name: string }[] | null;
      deptLine = Array.isArray(d) ? d[0]?.name ?? null : d?.name ?? null;

      if (profileRole && isApproverRole(profileRole)) {
        pendingApprovalCount = await getPendingApprovalCount(supabase, user.id, orgId, profileRole);
      }
    }

    const { data: uc } = await supabase.rpc('broadcast_unread_count');
    if (typeof uc === 'number') unreadBroadcasts = uc;
    else if (uc !== null && uc !== undefined) unreadBroadcasts = Number(uc);

    showManager = profileRole === 'manager';
  }

  const adminNavItemsRaw = getMainShellAdminNavItems(profileRole);
  const adminNavItems =
    adminNavItemsRaw?.map((item) =>
      item.href === '/admin/pending' && pendingApprovalCount > 0
        ? { ...item, badge: pendingApprovalCount }
        : item
    ) ?? null;

  const showStandaloneApprovals =
    Boolean(profileRole && isApproverRole(profileRole)) && !canAccessOrgAdminArea(profileRole);

  return (
    <ThemeRoot>
      <MainProviders>
        <AppShell
          orgName={orgName}
          userName={userName}
          userRoleLabel={userRoleLabel}
          deptLine={deptLine}
          profileRole={profileRole}
          unreadBroadcasts={unreadBroadcasts}
          pendingApprovalCount={pendingApprovalCount}
          showManager={showManager}
          adminNavItems={adminNavItems}
          showStandaloneApprovals={showStandaloneApprovals}
        >
          {children}
        </AppShell>
      </MainProviders>
    </ThemeRoot>
  );
}
