import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { userIdsWithMembershipInDepartments } from '@/lib/admin/pendingApprovalScope';
import { withServerPerf } from '@/lib/perf/serverPerf';

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
  const { data: pending } = await withServerPerf(
    '/admin/pending',
    'pending_profiles_base',
    supabase
      .from('profiles')
      .select('id,full_name,email,created_at,role')
      .eq('org_id', orgId)
      .eq('status', 'pending'),
    350
  );

  let list = (pending ?? []) as PendingProfileScoped[];

  if (viewerRole === 'manager' || viewerRole === 'coordinator') {
    let deptIds: string[] = [];
    if (viewerRole === 'manager') {
      const { data: managed } = await withServerPerf(
        '/admin/pending',
        'managed_dept_ids',
        supabase.from('dept_managers').select('dept_id').eq('user_id', viewerId),
        300
      );
      deptIds = (managed ?? []).map((m) => m.dept_id as string);
    } else {
      const { data: ud } = await withServerPerf(
        '/admin/pending',
        'coordinator_dept_ids',
        supabase.from('user_departments').select('dept_id').eq('user_id', viewerId),
        300
      );
      deptIds = [...new Set((ud ?? []).map((u) => u.dept_id as string))];
    }
    if (!deptIds.length) {
      list = [];
    } else {
      const { data: ud } = await withServerPerf(
        '/admin/pending',
        'dept_memberships_for_scope',
        supabase.from('user_departments').select('user_id, dept_id').in('dept_id', deptIds),
        350
      );
      const allowed = userIdsWithMembershipInDepartments(
        (ud ?? []) as { user_id: string; dept_id: string }[],
        deptIds
      );
      list = list.filter((p) => allowed.has(p.id as string));
    }
  }

  return list;
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
    const { data: ud } = await withServerPerf(
      '/admin/pending',
      'pending_user_departments_enrichment',
      supabase
        .from('user_departments')
        .select('user_id, departments(name)')
        .in('user_id', ids),
      350
    );
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
