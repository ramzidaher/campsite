import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { userIdsWithMembershipInDepartments } from '@/lib/admin/pendingApprovalScope';

export type PendingApprovalRow = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  role: string;
  departments: string[];
};

type PendingProfileScoped = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: string | null;
};

/** Pending rows after org + role scope rules; no department-name enrichment. */
async function scopedPendingProfiles(
  supabase: SupabaseClient,
  viewerId: string,
  orgId: string,
  viewerRole: string
): Promise<PendingProfileScoped[]> {
  const { data: pending } = await supabase
    .from('profiles')
    .select('id,full_name,email,created_at,role')
    .eq('org_id', orgId)
    .eq('status', 'pending');

  let list = (pending ?? []) as PendingProfileScoped[];

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
      const { data: ud } = await supabase.from('user_departments').select('user_id, dept_id').in('dept_id', deptIds);
      const allowed = userIdsWithMembershipInDepartments(
        (ud ?? []) as { user_id: string; dept_id: string }[],
        deptIds
      );
      list = list.filter((p) => allowed.has(p.id as string));
    }
  }

  return list;
}

/** Fast count for nav badges — same scope as {@link loadPendingApprovalRows}, skips per-user dept joins. */
export async function countPendingApprovalsForViewer(
  supabase: SupabaseClient,
  viewerId: string,
  orgId: string,
  viewerRole: string
): Promise<number> {
  const list = await scopedPendingProfiles(supabase, viewerId, orgId, viewerRole);
  return list.length;
}

/** Pending profiles the viewer may approve (managers see only their departments). */
export async function loadPendingApprovalRows(
  supabase: SupabaseClient,
  viewerId: string,
  orgId: string,
  viewerRole: string
): Promise<PendingApprovalRow[]> {
  const list = await scopedPendingProfiles(supabase, viewerId, orgId, viewerRole);

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
    id: p.id,
    full_name: p.full_name ?? '',
    email: p.email ?? null,
    created_at: p.created_at,
    role: p.role ?? 'unassigned',
    departments: deptNames[p.id] ?? [],
  }));
}
