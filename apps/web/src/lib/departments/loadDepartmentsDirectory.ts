import type { SupabaseClient } from '@supabase/supabase-js';

export type DeptRow = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_archived: boolean;
};

export type DeptMemberRow = { user_id: string; full_name: string; role: string };

export type DepartmentsDirectoryBundle = {
  departments: DeptRow[];
  categoriesByDept: Record<string, { id: string; name: string }[]>;
  teamsByDept: Record<string, { id: string; name: string }[]>;
  /** deptId -> userId -> teamId (sub-team within that department) */
  memberTeamByDept: Record<string, Record<string, string | null>>;
  managersByDept: Record<string, { user_id: string; full_name: string }[]>;
  memberCountByDept: Record<string, number>;
  membersByDept: Record<string, DeptMemberRow[]>;
  broadcastPermsByDept: Record<string, { permission: string; min_role: string }[]>;
  staffOptions: { id: string; full_name: string; role: string }[];
};

/**
 * Loads department grid + detail payloads for Admin → Departments or Manager → Departments.
 * When `deptIds` is set, only those departments are returned (managers: managed depts only).
 */
export async function loadDepartmentsDirectory(
  supabase: SupabaseClient,
  orgId: string,
  deptIdsFilter: string[] | null
): Promise<DepartmentsDirectoryBundle> {
  let deptQuery = supabase
    .from('departments')
    .select('id, name, type, description, is_archived')
    .eq('org_id', orgId)
    .order('type')
    .order('name');

  if (deptIdsFilter !== null) {
    if (deptIdsFilter.length === 0) {
      return {
        departments: [],
        categoriesByDept: {},
        teamsByDept: {},
        memberTeamByDept: {},
        managersByDept: {},
        memberCountByDept: {},
        membersByDept: {},
        broadcastPermsByDept: {},
        staffOptions: [],
      };
    }
    deptQuery = deptQuery.in('id', deptIdsFilter);
  }

  const { data: departments } = await deptQuery;
  const deptIds = (departments ?? []).map((d) => d.id as string);

  const catsByDept: Record<string, { id: string; name: string }[]> = {};
  const teamsByDept: Record<string, { id: string; name: string }[]> = {};
  const memberTeamByDept: Record<string, Record<string, string | null>> = {};
  const managersByDept: Record<string, { user_id: string; full_name: string }[]> = {};
  const memberCountByDept: Record<string, number> = {};
  const membersByDept: Record<string, DeptMemberRow[]> = {};
  const broadcastPermsByDept: Record<string, { permission: string; min_role: string }[]> = {};

  if (!deptIds.length) {
    const { data: staffEmpty } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name');
    return {
      departments: (departments ?? []) as DeptRow[],
      categoriesByDept: catsByDept,
      teamsByDept,
      memberTeamByDept,
      managersByDept,
      memberCountByDept,
      membersByDept,
      broadcastPermsByDept,
      staffOptions: (staffEmpty ?? []) as { id: string; full_name: string; role: string }[],
    };
  }

  const [catsRes, teamsRes, dmsRes, dbpRes, udRes, staffRes] = await Promise.all([
    supabase.from('dept_categories').select('id, name, dept_id').in('dept_id', deptIds),
    supabase.from('dept_teams').select('id, name, dept_id').in('dept_id', deptIds).order('name'),
    supabase.from('dept_managers').select('dept_id, user_id').in('dept_id', deptIds),
    supabase.from('dept_broadcast_permissions').select('dept_id, permission, min_role').in('dept_id', deptIds),
    supabase.from('user_departments').select('dept_id, user_id').in('dept_id', deptIds),
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  const profById = new Map((staffRes.data ?? []).map((p) => [p.id as string, p]));

  for (const row of dbpRes.error ? [] : dbpRes.data ?? []) {
    const did = row.dept_id as string;
    if (!broadcastPermsByDept[did]) broadcastPermsByDept[did] = [];
    broadcastPermsByDept[did].push({
      permission: row.permission as string,
      min_role: row.min_role as string,
    });
  }

  for (const c of catsRes.data ?? []) {
    const did = c.dept_id as string;
    if (!catsByDept[did]) catsByDept[did] = [];
    catsByDept[did].push({ id: c.id as string, name: c.name as string });
  }

  const teamDeptById = new Map<string, string>();
  for (const t of teamsRes.data ?? []) {
    const did = t.dept_id as string;
    const tid = t.id as string;
    teamDeptById.set(tid, did);
    if (!teamsByDept[did]) teamsByDept[did] = [];
    teamsByDept[did].push({ id: tid, name: t.name as string });
  }

  const allTeamIds = [...teamDeptById.keys()];
  if (allTeamIds.length) {
    const { data: udtRows } = await supabase.from('user_dept_teams').select('user_id, team_id').in('team_id', allTeamIds);
    for (const row of udtRows ?? []) {
      const uid = row.user_id as string;
      const tid = row.team_id as string;
      const deptId = teamDeptById.get(tid);
      if (!deptId) continue;
      if (!memberTeamByDept[deptId]) memberTeamByDept[deptId] = {};
      memberTeamByDept[deptId][uid] = tid;
    }
  }

  for (const m of dmsRes.data ?? []) {
    const did = m.dept_id as string;
    if (!managersByDept[did]) managersByDept[did] = [];
    const uid = m.user_id as string;
    const pr = profById.get(uid);
    managersByDept[did].push({
      user_id: uid,
      full_name: (pr?.full_name as string) ?? uid,
    });
  }

  for (const row of udRes.data ?? []) {
    const did = row.dept_id as string;
    memberCountByDept[did] = (memberCountByDept[did] ?? 0) + 1;
  }

  for (const row of udRes.data ?? []) {
    const did = row.dept_id as string;
    const uid = row.user_id as string;
    const pr = profById.get(uid);
    if (!pr) continue;
    if (!membersByDept[did]) membersByDept[did] = [];
    membersByDept[did].push({
      user_id: uid,
      full_name: (pr.full_name as string) ?? uid,
      role: (pr.role as string) ?? '',
    });
  }

  for (const did of deptIds) {
    const list = membersByDept[did];
    if (list?.length) {
      list.sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }));
    }
  }

  return {
    departments: (departments ?? []) as DeptRow[],
    categoriesByDept: catsByDept,
    teamsByDept,
    memberTeamByDept,
    managersByDept,
    memberCountByDept,
    membersByDept,
    broadcastPermsByDept,
    staffOptions: (staffRes.data ?? []) as { id: string; full_name: string; role: string }[],
  };
}
