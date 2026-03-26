import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingApprovalRow = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  role: string;
  departments: string[];
};

/** Pending profiles the viewer may approve (managers see only their departments). */
export async function loadPendingApprovalRows(
  supabase: SupabaseClient,
  viewerId: string,
  orgId: string,
  viewerRole: string
): Promise<PendingApprovalRow[]> {
  const { data: pending } = await supabase
    .from('profiles')
    .select('id,full_name,email,created_at,role')
    .eq('org_id', orgId)
    .eq('status', 'pending');

  let list = pending ?? [];

  if (viewerRole === 'manager' || viewerRole === 'coordinator') {
    let deptIds: string[] = [];
    if (viewerRole === 'manager') {
      const { data: managed } = await supabase.from('dept_managers').select('dept_id').eq('user_id', viewerId);
      deptIds = (managed ?? []).map((m) => m.dept_id as string);
    } else {
      const { data: ud } = await supabase.from('user_departments').select('dept_id').eq('user_id', viewerId);
      deptIds = [...new Set((ud ?? []).map((u) => u.dept_id as string))];
    }
    if (!deptIds.length) {
      list = [];
    } else {
      const { data: ud } = await supabase.from('user_departments').select('user_id').in('dept_id', deptIds);
      const allowed = new Set((ud ?? []).map((u) => u.user_id as string));
      list = list.filter((p) => allowed.has(p.id as string));
    }
  }

  const ids = list.map((p) => p.id as string);
  const deptNames: Record<string, string[]> = {};
  if (ids.length) {
    const { data: ud } = await supabase
      .from('user_departments')
      .select('user_id, departments(name)')
      .in('user_id', ids);
    for (const row of ud ?? []) {
      const uid = row.user_id as string;
      if (!deptNames[uid]) deptNames[uid] = [];
      const d = row.departments as { name: string } | { name: string }[] | null;
      if (Array.isArray(d)) {
        d.forEach((x) => {
          if (x?.name) deptNames[uid].push(x.name);
        });
      } else if (d && 'name' in d && d.name) {
        deptNames[uid].push(d.name);
      }
    }
  }

  return list.map((p) => ({
    id: p.id as string,
    full_name: (p.full_name as string) ?? '',
    email: (p.email as string | null) ?? null,
    created_at: p.created_at as string,
    role: (p.role as string) ?? 'csa',
    departments: deptNames[p.id as string] ?? [],
  }));
}
