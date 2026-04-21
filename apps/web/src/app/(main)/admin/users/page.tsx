import { AdminUsersClient } from '@/components/admin/AdminUsersClient';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; role?: string; dept?: string; q?: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const permissionKeys = await withServerPerf('/admin/users', 'get_my_permissions', getMyPermissions(profile.org_id as string), 300);
  const canViewMembers = permissionKeys.includes('members.view');
  if (!canViewMembers) redirect('/admin');

  const canEditRoles   = permissionKeys.includes('members.edit_roles');
  const canOpenHrFile  = permissionKeys.includes('hr.view_records') || permissionKeys.includes('hr.view_direct_reports');

  const { data: assignableRows, error: assignableErr } = await withServerPerf(
    '/admin/users',
    'list_assignable_org_roles',
    supabase.rpc('list_assignable_org_roles', {
      p_org_id: profile.org_id,
    }),
    350
  );
  if (assignableErr) {
    return <p className="text-sm text-red-300">{assignableErr.message}</p>;
  }
  const assignableRoles = (assignableRows ?? []) as {
    id: string;
    key: string;
    label: string;
    is_system: boolean;
  }[];

  const { data: orgRolesForFilter } = await withServerPerf(
    '/admin/users',
    'org_roles_for_filter',
    supabase
      .from('org_roles')
      .select('key, label')
      .eq('org_id', profile.org_id)
      .eq('is_archived', false)
      .order('label'),
    350
  );
  const { data: orgMemberRolesRows } = await withServerPerf(
    '/admin/users',
    'org_member_roles_for_filter',
    supabase
      .from('profiles')
      .select('role')
      .eq('org_id', profile.org_id),
    300
  );

  const [{ data: orgRow }, { count: totalMemberCount }] = await Promise.all([
    supabase.from('organisations').select('name, slug').eq('id', profile.org_id).single(),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id),
  ]);

  const orgName = (orgRow?.name as string) ?? 'Organisation';
  const orgSlug = (orgRow?.slug as string) ?? '';

  let q = supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at, reports_to_user_id')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(350);

  if (sp.status && sp.status !== 'all' && ['pending', 'active', 'inactive'].includes(sp.status)) {
    q = q.eq('status', sp.status);
  }
  if (sp.role && sp.role !== 'all') {
    q = q.eq('role', sp.role);
  }

  // Push basic text search down to DB to reduce in-memory filtering costs.
  if (sp.q?.trim()) {
    const raw = sp.q.trim();
    const escaped = raw.replace(/[%_]/g, '\\$&');
    q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }

  const { data: profiles, error } = await withServerPerf('/admin/users', 'profiles_query', q, 450);
  if (error) {
    return <p className="text-sm text-red-300">{error.message}</p>;
  }

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
    supabase
      .from('departments')
      .select('id, name, type, is_archived')
      .eq('org_id', profile.org_id)
      .order('name'),
    350
  );

  const userIds = filtered.map((p) => p.id as string);
  const deptByUser: Record<string, string[]> = {};
  if (userIds.length) {
    const { data: udj } = await supabase
      .from('user_departments')
      .select('user_id, departments(name)')
      .in('user_id', userIds);
    for (const r of udj ?? []) {
      const uid = r.user_id as string;
      const raw = r.departments as { name: string } | { name: string }[] | null;
      const deptRows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (!deptByUser[uid]) deptByUser[uid] = [];
      for (const d of deptRows) {
        if (d?.name) deptByUser[uid].push(d.name);
      }
    }
  }

  const { data: managerChoicesRows } = await withServerPerf(
    '/admin/users',
    'manager_choices',
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', profile.org_id)
      .eq('status', 'active')
      .order('full_name'),
    350
  );

  const view = (
    // Keep the role filter focused on roles that actually exist on current org members.
    // This avoids showing unused template/system roles in the dropdown.
    <AdminUsersClient
      currentUserId={user.id}
      canEditRoles={Boolean(canEditRoles)}
      assignableRoles={assignableRoles}
      roleFilterOptions={(() => {
        const memberRoleSet = new Set(
          (orgMemberRolesRows ?? [])
            .map((r) => String(r.role ?? '').trim())
            .filter((r) => r.length > 0 && r !== 'unassigned')
        );
        const fromOrgRoles = ((orgRolesForFilter ?? []) as { key: string; label: string }[]).filter((r) =>
          memberRoleSet.has(r.key)
        );
        const missingFromCatalog = [...memberRoleSet]
          .filter((roleKey) => !fromOrgRoles.some((r) => r.key === roleKey))
          .map((roleKey) => ({
            key: roleKey,
            label: roleKey.replace(/_/g, ' '),
          }));
        return [...fromOrgRoles, ...missingFromCatalog].sort((a, b) => a.label.localeCompare(b.label));
      })()}
      managerChoices={(managerChoicesRows ?? []) as { id: string; full_name: string }[]}
      initialRows={filtered.map((p) => ({
        id: p.id as string,
        full_name: p.full_name as string,
        email: (p.email as string | null) ?? null,
        role: p.role as string,
        status: p.status as string,
        created_at: p.created_at as string,
        reports_to_user_id: (p.reports_to_user_id as string | null) ?? null,
        departments: deptByUser[p.id as string] ?? [],
      }))}
      departments={(departments ?? []) as { id: string; name: string; type: string; is_archived: boolean }[]}
      defaultFilters={{
        q: sp.q,
        dept: sp.dept,
        status: sp.status,
        role: sp.role,
      }}
      orgName={orgName}
      orgSlug={orgSlug}
      totalMemberCount={totalMemberCount ?? 0}
      canOpenHrFile={canOpenHrFile}
    />
  );
  warnIfSlowServerPath('/admin/users', pathStartedAtMs);
  return view;
}
