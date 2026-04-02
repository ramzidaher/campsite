import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionKey } from '@campsite/types';

import { relTime } from '@/lib/format/relTime';

export type AdminOverviewActivity = {
  id: string;
  icon: string;
  text: string;
  timeLabel: string;
};

export type AdminOverviewRoleRow = {
  role: string;
  label: string;
  count: number;
};

export type AdminOverviewModel = {
  orgName: string;
  accessLine: string;
  roleLabel: string;
  viewerRole: string;
  totalMembers: number;
  newMembersWeek: number;
  pendingCount: number;
  broadcasts30d: number;
  broadcastsPrev30d: number;
  draftBroadcastsCount: number;
  deptTotal: number;
  deptSocietiesAndClubs: number;
  deptDepartments: number;
  roleBreakdown: AdminOverviewRoleRow[];
  activities: AdminOverviewActivity[];
  canManageUsers: boolean;
  canManageBroadcasts: boolean;
  canManageDepartments: boolean;
  canManageSettings: boolean;
};

const ROLE_ORDER = [
  'unassigned',
  'org_admin',
  'super_admin',
  'manager',
  'coordinator',
  'administrator',
  'duty_manager',
  'csa',
  'society_leader',
] as const;

const ROLE_LABEL: Record<string, string> = {
  unassigned: 'Pending role',
  org_admin: 'Org admin',
  super_admin: 'Org admin (legacy)',
  manager: 'Manager',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
  duty_manager: 'Duty manager',
  csa: 'CSA',
  society_leader: 'Society leader',
};

function roleDisplayLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.replace(/_/g, ' ');
}

export async function loadAdminOverview(
  supabase: SupabaseClient,
  orgId: string,
  profile: { role: string; full_name: string | null; permissions: PermissionKey[] }
): Promise<AdminOverviewModel> {
  const { data: orgRow } = await supabase.from('organisations').select('name').eq('id', orgId).single();
  const orgName = (orgRow?.name as string) ?? 'Organisation';

  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d60 = new Date(now);
  d60.setDate(d60.getDate() - 60);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const roleLabel = roleDisplayLabel(profile.role);
  const canManageUsers = profile.permissions.includes('members.view');
  const canManageBroadcasts = profile.permissions.includes('broadcasts.view');
  const canManageDepartments = profile.permissions.includes('departments.view');
  const canManageSettings = profile.permissions.includes('members.edit_status');
  const accessLine = `Permission-based admin access · ${orgName} · ${roleLabel}`;

  const [
    { count: totalMembers },
    { count: newMembersWeek },
    { count: pendingCount },
    { count: broadcasts30d },
    { count: broadcastsPrev30d },
    { count: draftBroadcastsCount },
    { data: deptRows },
    { data: roleRows },
    { data: recentBroadcasts },
    { data: recentProfiles },
    { data: scanRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active')
      .gte('created_at', weekAgo.toISOString()),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending'),
    supabase
      .from('broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'sent')
      .gte('sent_at', d30.toISOString()),
    supabase
      .from('broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'sent')
      .gte('sent_at', d60.toISOString())
      .lt('sent_at', d30.toISOString()),
    supabase
      .from('broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['draft', 'pending_approval']),
    supabase.from('departments').select('type').eq('org_id', orgId).eq('is_archived', false),
    supabase.from('profiles').select('role').eq('org_id', orgId).eq('status', 'active'),
    supabase
      .from('broadcasts')
      .select('id,title,sent_at,created_by')
      .eq('org_id', orgId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('id,full_name,status,created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(4),
    profile.permissions.includes('members.view')
      ? supabase
          .from('scan_logs')
          .select('id,created_at,scanned_display_name,token_valid')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(2)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const rows = (deptRows ?? []) as { type: string }[];
  const deptDepartments = rows.filter((r) => r.type === 'department').length;
  const deptSocietiesAndClubs = rows.filter((r) => r.type === 'society' || r.type === 'club').length;
  const deptTotal = rows.length;

  const counts: Record<string, number> = {};
  for (const r of (roleRows ?? []) as { role: string }[]) {
    const k = r.role;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const roleBreakdown: AdminOverviewRoleRow[] = [];
  for (const role of ROLE_ORDER) {
    const c = counts[role] ?? 0;
    if (c > 0) roleBreakdown.push({ role, label: ROLE_LABEL[role] ?? role, count: c });
  }
  const seen = new Set(roleBreakdown.map((r) => r.role));
  const extra = Object.entries(counts)
    .filter(([k, c]) => !seen.has(k) && c > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [role, c] of extra) {
    roleBreakdown.push({ role, label: roleDisplayLabel(role), count: c });
  }

  const creatorIds = [...new Set((recentBroadcasts ?? []).map((b) => b.created_by as string))];
  let nameById: Record<string, string> = {};
  if (creatorIds.length) {
    const { data: creators } = await supabase
      .from('profiles')
      .select('id,full_name')
      .in('id', creatorIds);
    for (const c of creators ?? []) {
      nameById[c.id as string] = ((c.full_name as string) ?? 'Someone').trim() || 'Someone';
    }
  }

  type Act = AdminOverviewActivity & { at: number };
  const activities: Act[] = [];

  for (const b of recentBroadcasts ?? []) {
    const sent = b.sent_at as string | null;
    if (!sent) continue;
    const t = new Date(sent).getTime();
    const who = nameById[b.created_by as string] ?? 'Someone';
    const title = (b.title as string) ?? 'Broadcast';
    activities.push({
      id: `b-${b.id}`,
      icon: '📡',
      text: `${who} sent “${title.length > 48 ? `${title.slice(0, 48)}...` : title}”`,
      timeLabel: relTime(sent),
      at: t,
    });
  }

  for (const p of recentProfiles ?? []) {
    const created = p.created_at as string;
    const t = new Date(created).getTime();
    const name = ((p.full_name as string) ?? 'A member').trim() || 'A member';
    const st = p.status as string;
    const line =
      st === 'pending'
        ? `${name} registered - pending verification`
        : `${name} joined the organisation`;
    activities.push({
      id: `p-${p.id}`,
      icon: '👤',
      text: line,
      timeLabel: relTime(created),
      at: t,
    });
  }

  if (profile.permissions.includes('members.view')) {
    for (const s of scanRows ?? []) {
      const created = s.created_at as string;
      const ok = s.token_valid === true;
      const label = (s.scanned_display_name as string)?.trim() || 'Member';
      activities.push({
        id: `s-${s.id}`,
        icon: '🎫',
        text: ok ? `Discount scan verified for ${label}` : `Discount scan attempt (${label})`,
        timeLabel: relTime(created),
        at: new Date(created).getTime(),
      });
    }
  }

  activities.sort((a, b) => b.at - a.at);
  const topActivities = activities.slice(0, 7).map(({ at: _a, ...rest }) => rest);

  return {
    orgName,
    accessLine,
    roleLabel,
    viewerRole: profile.role,
    totalMembers: totalMembers ?? 0,
    newMembersWeek: newMembersWeek ?? 0,
    pendingCount: pendingCount ?? 0,
    broadcasts30d: broadcasts30d ?? 0,
    broadcastsPrev30d: broadcastsPrev30d ?? 0,
    draftBroadcastsCount: draftBroadcastsCount ?? 0,
    deptTotal,
    deptSocietiesAndClubs,
    deptDepartments,
    roleBreakdown,
    activities: topActivities,
    canManageUsers,
    canManageBroadcasts,
    canManageDepartments,
    canManageSettings,
  };
}
