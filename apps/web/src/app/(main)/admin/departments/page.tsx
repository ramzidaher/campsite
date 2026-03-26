import { AdminDepartmentsClient } from '@/components/admin/AdminDepartmentsClient';
import { createClient } from '@/lib/supabase/server';
import { canManageOrgDepartments } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

export default async function AdminDepartmentsPage() {
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
  if (!canManageOrgDepartments(profile.role)) redirect('/admin');

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, type, description, is_archived')
    .eq('org_id', profile.org_id)
    .order('type')
    .order('name');

  const deptIds = (departments ?? []).map((d) => d.id as string);
  const catsByDept: Record<string, { id: string; name: string }[]> = {};
  const managersByDept: Record<string, { user_id: string; full_name: string }[]> = {};
  const memberCountByDept: Record<string, number> = {};
  const broadcastPermsByDept: Record<string, { permission: string; min_role: string }[]> = {};

  if (deptIds.length) {
    const [{ data: cats }, { data: dms }, { data: profs }, { data: dbp }] = await Promise.all([
      supabase.from('dept_categories').select('id, name, dept_id').in('dept_id', deptIds),
      supabase.from('dept_managers').select('dept_id, user_id').in('dept_id', deptIds),
      supabase.from('profiles').select('id, full_name').eq('org_id', profile.org_id),
      supabase.from('dept_broadcast_permissions').select('dept_id, permission, min_role').in('dept_id', deptIds),
    ]);
    for (const row of dbp ?? []) {
      const did = row.dept_id as string;
      if (!broadcastPermsByDept[did]) broadcastPermsByDept[did] = [];
      broadcastPermsByDept[did].push({
        permission: row.permission as string,
        min_role: row.min_role as string,
      });
    }
    const nameByUser = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));
    for (const c of cats ?? []) {
      const did = c.dept_id as string;
      if (!catsByDept[did]) catsByDept[did] = [];
      catsByDept[did].push({ id: c.id as string, name: c.name as string });
    }
    for (const m of dms ?? []) {
      const did = m.dept_id as string;
      if (!managersByDept[did]) managersByDept[did] = [];
      managersByDept[did].push({
        user_id: m.user_id as string,
        full_name: nameByUser.get(m.user_id as string) ?? (m.user_id as string),
      });
    }

    const { data: udMembers } = await supabase.from('user_departments').select('dept_id').in('dept_id', deptIds);
    for (const row of udMembers ?? []) {
      const did = row.dept_id as string;
      memberCountByDept[did] = (memberCountByDept[did] ?? 0) + 1;
    }
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('org_id', profile.org_id)
    .eq('status', 'active')
    .order('full_name');

  return (
    <AdminDepartmentsClient
      orgId={profile.org_id}
      currentUserId={user.id}
      initialDepartments={(departments ?? []) as {
        id: string;
        name: string;
        type: string;
        description: string | null;
        is_archived: boolean;
      }[]}
      categoriesByDept={catsByDept}
      managersByDept={managersByDept}
      memberCountByDept={memberCountByDept}
      broadcastPermsByDept={broadcastPermsByDept}
      staffOptions={(staff ?? []) as { id: string; full_name: string; role: string }[]}
    />
  );
}
