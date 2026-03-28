import { AppShell } from '@/components/AppShell';
import { MainProviders } from '@/components/providers/MainProviders';
import { ThemeRoot } from '@/components/ThemeRoot';
import { canAccessOrgAdminArea, getMainShellAdminNavItems } from '@/lib/adminGates';
import { countPendingBroadcastApprovalsForViewer } from '@/lib/broadcasts/countPendingBroadcastApprovalsForViewer';
import { createClient } from '@/lib/supabase/server';
import { isApproverRole, isBroadcastApproverRole, isManagerRole } from '@campsite/types';

export const dynamic = 'force-dynamic';

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
    unassigned: 'Pending role',
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
  let orgLogoUrl: string | null = null;
  let userName = 'Account';
  let userAvatarUrl: string | null = null;
  let userRoleLabel = '';
  let hasTenantProfile = false;
  let deptLine: string | null = null;
  let unreadBroadcasts = 0;
  let pendingApprovalCount = 0;
  let pendingBroadcastApprovals = 0;
  let showManager = false;

  if (user) {
    const emailLocal = user.email?.split('@')[0]?.trim() ?? '';

    const [profileRes, unreadRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, org_id, full_name, avatar_url, organisations(name, logo_url)')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.rpc('broadcast_unread_count'),
    ]);

    const profile = profileRes.data;
    hasTenantProfile = Boolean(profile);
    const rawRole = profile?.role as string | null | undefined;
    profileRole = rawRole != null && String(rawRole).trim() !== '' ? String(rawRole).trim() : null;
    userName = hasTenantProfile
      ? (profile?.full_name as string)?.trim() || emailLocal || 'Account'
      : emailLocal || 'Finish setup';
    userAvatarUrl = (profile?.avatar_url as string | null) ?? null;
    userRoleLabel = profileRole ? roleLabel(profileRole) : '';

    const orgId = profile?.org_id as string | undefined;
    const needsPendingBadge = Boolean(orgId && profileRole && isApproverRole(profileRole));
    const needsBroadcastPendingBadge = Boolean(
      orgId && profileRole && isBroadcastApproverRole(profileRole)
    );

    const orgEmbed = profile?.organisations as
      | { name: string; logo_url: string | null }
      | { name: string; logo_url: string | null }[]
      | null
      | undefined;
    const orgRow = Array.isArray(orgEmbed) ? orgEmbed[0] : orgEmbed;
    if (orgRow?.name) orgName = orgRow.name;
    if (orgRow && 'logo_url' in orgRow) orgLogoUrl = orgRow.logo_url ?? null;

    const uc = unreadRes.data;
    if (typeof uc === 'number') unreadBroadcasts = uc;
    else if (uc !== null && uc !== undefined) unreadBroadcasts = Number(uc);

    const [udRes, pendingRes, broadcastPendingCount] = await Promise.all([
      orgId
        ? supabase
            .from('user_departments')
            .select('departments(name)')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      needsPendingBadge
        ? supabase.rpc('pending_approvals_nav_count')
        : Promise.resolve({ data: null as number | null }),
      needsBroadcastPendingBadge && orgId && profileRole
        ? countPendingBroadcastApprovalsForViewer(supabase, {
            userId: user.id,
            orgId,
            role: profileRole,
          })
        : Promise.resolve(0),
    ]);

    if (orgId) {
      const ud = udRes.data as { departments?: unknown } | null;
      const d = ud?.departments as { name: string } | { name: string }[] | null;
      deptLine = Array.isArray(d) ? d[0]?.name ?? null : d?.name ?? null;
    }

    const pc = pendingRes.data;
    if (typeof pc === 'number') pendingApprovalCount = pc;
    else if (pc !== null && pc !== undefined) pendingApprovalCount = Number(pc);

    if (typeof broadcastPendingCount === 'number') pendingBroadcastApprovals = broadcastPendingCount;

    showManager = isManagerRole(profileRole);
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
          orgLogoUrl={orgLogoUrl}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          userRoleLabel={userRoleLabel}
          hasTenantProfile={hasTenantProfile}
          deptLine={deptLine}
          profileRole={profileRole}
          unreadBroadcasts={unreadBroadcasts}
          pendingBroadcastApprovals={pendingBroadcastApprovals}
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
