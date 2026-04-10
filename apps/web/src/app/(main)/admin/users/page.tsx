import { AdminUsersClient } from '@/components/admin/AdminUsersClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; role?: string; dept?: string; q?: string }>;
}) {
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
  const { data: canViewMembers } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'members.view',
    p_context: {},
  });
  if (!canViewMembers) redirect('/admin');

  const { data: canEditRoles } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'members.edit_roles',
    p_context: {},
  });

  const { data: assignableRows, error: assignableErr } = await supabase.rpc('list_assignable_org_roles', {
    p_org_id: profile.org_id,
  });
  if (assignableErr) {
    return <p className="text-sm text-red-300">{assignableErr.message}</p>;
  }
  const assignableRoles = (assignableRows ?? []) as {
    id: string;
    key: string;
    label: string;
    is_system: boolean;
  }[];

  const { data: orgRolesForFilter } = await supabase
    .from('org_roles')
    .select('key, label')
    .eq('org_id', profile.org_id)
    .eq('is_archived', false)
    .order('label');

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
    .limit(500);

  if (sp.status && sp.status !== 'all' && ['pending', 'active', 'inactive'].includes(sp.status)) {
    q = q.eq('status', sp.status);
  }
  if (sp.role && sp.role !== 'all') {
    q = q.eq('role', sp.role);
  }

  const { data: profiles, error } = await q;
  if (error) {
    return <p className="text-sm text-red-300">{error.message}</p>;
  }

  let rows = profiles ?? [];
  if (sp.q?.trim()) {
    const low = sp.q.trim().toLowerCase();
    rows = rows.filter(
      (p) =>
        (p.full_name as string)?.toLowerCase().includes(low) ||
        (p.email as string | null)?.toLowerCase().includes(low)
    );
  }

  let filtered = rows;
  if (sp.dept && sp.dept !== 'all') {
    const { data: ud } = await supabase.from('user_departments').select('user_id').eq('dept_id', sp.dept);
    const set = new Set((ud ?? []).map((u) => u.user_id as string));
    filtered = rows.filter((p) => set.has(p.id as string));
  }

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, type, is_archived')
    .eq('org_id', profile.org_id)
    .order('name');

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

  const { data: managerChoicesRows } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', profile.org_id)
    .eq('status', 'active')
    .order('full_name');

  return (
    <AdminUsersClient
      currentUserId={user.id}
      canEditRoles={Boolean(canEditRoles)}
      assignableRoles={assignableRoles}
      roleFilterOptions={(orgRolesForFilter ?? []) as { key: string; label: string }[]}
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
    />
  );
}
