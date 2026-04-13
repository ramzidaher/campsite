import { AdminCategoriesClient } from '@/components/admin/AdminCategoriesClient';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/adminGates';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminCategoriesPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));
  if (!hasPermission(permissionKeys, 'departments.view')) redirect('/admin');

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, type')
    .eq('org_id', profile.org_id)
    .eq('is_archived', false)
    .order('name');

  const deptIds = (departments ?? []).map((d) => d.id as string);
  const catsByDept: Record<string, { id: string; name: string }[]> = {};

  if (deptIds.length) {
    const { data: cats } = await supabase.from('broadcast_channels').select('id, name, dept_id').in('dept_id', deptIds);
    for (const c of cats ?? []) {
      const did = c.dept_id as string;
      if (!catsByDept[did]) catsByDept[did] = [];
      catsByDept[did].push({ id: c.id as string, name: c.name as string });
    }
  }

  return (
    <AdminCategoriesClient
      initialDepartments={(departments ?? []) as { id: string; name: string; type: string }[]}
      categoriesByDept={catsByDept}
    />
  );
}
