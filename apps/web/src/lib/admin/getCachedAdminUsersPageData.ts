import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { createClient } from '@/lib/supabase/server';

export type AdminUsersSearchParams = { status?: string; role?: string; dept?: string; q?: string };

export type AdminUsersPageData = {
  canEditRoles: boolean;
  canDeleteUsers: boolean;
  canOpenHrFile: boolean;
  assignableRoles: { id: string; key: string; label: string; is_system: boolean }[];
  roleFilterOptions: { key: string; label: string }[];
  managerChoices: { id: string; full_name: string }[];
  initialRows: {
    id: string;
    full_name: string;
    email: string | null;
    role: string;
    status: string;
    created_at: string;
    reports_to_user_id: string | null;
    departments: string[];
  }[];
  departments: { id: string; name: string; type: string; is_archived: boolean }[];
  defaultFilters: AdminUsersSearchParams;
  orgName: string;
  orgSlug: string;
  totalMemberCount: number;
};

const ADMIN_USERS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_USERS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminUsersPageResponseCache = new Map<string, TtlCacheEntry<AdminUsersPageData | null>>();
const adminUsersPageInFlight = new Map<string, Promise<AdminUsersPageData | null>>();
registerSharedCacheStore('campsite:admin:users', adminUsersPageResponseCache, adminUsersPageInFlight);

function normalizeSearchParam(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getAdminUsersPageCacheKey(orgId: string, userId: string, sp: AdminUsersSearchParams): string {
  return [
    `org:${orgId}`,
    `user:${userId}`,
    `status:${normalizeSearchParam(sp.status) ?? 'all'}`,
    `role:${normalizeSearchParam(sp.role) ?? 'all'}`,
    `dept:${normalizeSearchParam(sp.dept) ?? 'all'}`,
    `q:${normalizeSearchParam(sp.q) ?? ''}`,
  ].join(':');
}

async function loadAdminUsersPageData(
  userId: string,
  profileOrgId: string,
  permissionKeys: string[],
  sp: AdminUsersSearchParams
): Promise<AdminUsersPageData | null> {
  const supabase = await createClient();
  const canEditRoles = permissionKeys.includes('members.edit_roles');
  const canDeleteUsers = permissionKeys.includes('members.remove');
  const canOpenHrFile = permissionKeys.includes('hr.view_records') || permissionKeys.includes('hr.view_direct_reports');
  const canViewMembers = permissionKeys.includes('members.view');
  if (!canViewMembers) return null;

  const { data: assignableRows, error: assignableErr } = await withServerPerf(
    '/admin/users',
    'list_assignable_org_roles',
    supabase.rpc('list_assignable_org_roles', {
      p_org_id: profileOrgId,
    }),
    350
  );
  if (assignableErr) throw new Error(assignableErr.message);
  const assignableRoles = (assignableRows ?? []) as {
    id: string;
    key: string;
    label: string;
    is_system: boolean;
  }[];

  const { data: orgRolesForFilter } = await withServerPerf(
    '/admin/users',
    'org_roles_for_filter',
    supabase.from('org_roles').select('key, label').eq('org_id', profileOrgId).eq('is_archived', false).order('label'),
    350
  );
  const { data: orgMemberRolesRows } = await withServerPerf(
    '/admin/users',
    'org_member_roles_for_filter',
    supabase.from('profiles').select('role').eq('org_id', profileOrgId),
    300
  );

  const [{ data: orgRow }, { count: totalMemberCount }] = await Promise.all([
    supabase.from('organisations').select('name, slug').eq('id', profileOrgId).single(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', profileOrgId),
  ]);

  const orgName = (orgRow?.name as string) ?? 'Organisation';
  const orgSlug = (orgRow?.slug as string) ?? '';

  let q = supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at, reports_to_user_id')
    .eq('org_id', profileOrgId)
    .order('created_at', { ascending: false })
    .limit(350);

  if (sp.status && sp.status !== 'all' && ['pending', 'active', 'inactive'].includes(sp.status)) q = q.eq('status', sp.status);
  if (sp.role && sp.role !== 'all') q = q.eq('role', sp.role);
  if (sp.q?.trim()) {
    const raw = sp.q.trim();
    const escaped = raw.replace(/[%_]/g, '\\$&');
    q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }

  const { data: profiles, error } = await withServerPerf('/admin/users', 'profiles_query', q, 450);
  if (error) throw new Error(error.message);

  let filtered = profiles ?? [];
  if (sp.dept && sp.dept !== 'all') {
    const { data: ud } = await withServerPerf(
      '/admin/users',
      'dept_filter_user_ids',
      supabase.from('user_departments').select('user_id').eq('dept_id', sp.dept),
      300
    );
    const set = new Set((ud ?? []).map((u) => u.user_id as string));
    filtered = filtered.filter((p) => set.has(p.id as string));
  }

  const { data: departments } = await withServerPerf(
    '/admin/users',
    'departments_for_filter',
    supabase.from('departments').select('id, name, type, is_archived').eq('org_id', profileOrgId).order('name'),
    350
  );

  const userIds = filtered.map((p) => p.id as string);
  const deptByUser: Record<string, string[]> = {};
  if (userIds.length) {
    const { data: udj } = await supabase.from('user_departments').select('user_id, departments(name)').in('user_id', userIds);
    for (const r of udj ?? []) {
      const uid = r.user_id as string;
      const raw = r.departments as { name: string } | { name: string }[] | null;
      const deptRows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (!deptByUser[uid]) deptByUser[uid] = [];
      for (const d of deptRows) if (d?.name) deptByUser[uid].push(d.name);
    }
  }

  const { data: managerChoicesRows } = await withServerPerf(
    '/admin/users',
    'manager_choices',
    supabase.from('profiles').select('id, full_name').eq('org_id', profileOrgId).eq('status', 'active').order('full_name'),
    350
  );

  const memberRoleSet = new Set(
    (orgMemberRolesRows ?? [])
      .map((r) => String(r.role ?? '').trim())
      .filter((r) => r.length > 0 && r !== 'unassigned')
  );
  const fromOrgRoles = ((orgRolesForFilter ?? []) as { key: string; label: string }[]).filter((r) => memberRoleSet.has(r.key));
  const missingFromCatalog = [...memberRoleSet]
    .filter((roleKey) => !fromOrgRoles.some((r) => r.key === roleKey))
    .map((roleKey) => ({ key: roleKey, label: roleKey.replace(/_/g, ' ') }));

  return {
    canEditRoles: Boolean(canEditRoles),
    canDeleteUsers: Boolean(canDeleteUsers),
    canOpenHrFile,
    assignableRoles,
    roleFilterOptions: [...fromOrgRoles, ...missingFromCatalog].sort((a, b) => a.label.localeCompare(b.label)),
    managerChoices: (managerChoicesRows ?? []) as { id: string; full_name: string }[],
    initialRows: filtered.map((p) => ({
      id: p.id as string,
      full_name: p.full_name as string,
      email: (p.email as string | null) ?? null,
      role: p.role as string,
      status: p.status as string,
      created_at: p.created_at as string,
      reports_to_user_id: (p.reports_to_user_id as string | null) ?? null,
      departments: deptByUser[p.id as string] ?? [],
    })),
    departments: (departments ?? []) as { id: string; name: string; type: string; is_archived: boolean }[],
    defaultFilters: { q: sp.q, dept: sp.dept, status: sp.status, role: sp.role },
    orgName,
    orgSlug,
    totalMemberCount: totalMemberCount ?? 0,
  };
}

export const getCachedAdminUsersPageData = cache(
  async (
    userId: string,
    orgId: string,
    permissionKeys: string[],
    searchParams: AdminUsersSearchParams
  ): Promise<AdminUsersPageData | null> => {
    return getOrLoadSharedCachedValue({
      cache: adminUsersPageResponseCache,
      inFlight: adminUsersPageInFlight,
      key: getAdminUsersPageCacheKey(orgId, userId, searchParams),
      cacheNamespace: 'campsite:admin:users',
      ttlMs: ADMIN_USERS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => loadAdminUsersPageData(userId, orgId, permissionKeys, searchParams),
    });
  }
);
