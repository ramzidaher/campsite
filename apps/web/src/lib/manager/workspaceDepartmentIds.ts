import type { SupabaseClient } from '@supabase/supabase-js';
import { withServerPerf } from '@/lib/perf/serverPerf';

/**
 * Departments visible in the manager/coordinator workspace: managers via `dept_managers`,
 * coordinators via `user_departments`.
 */
export async function loadWorkspaceDepartmentIds(
  supabase: SupabaseClient,
  userId: string,
  role: string | null | undefined
): Promise<string[]> {
  const r = role?.trim();
  if (r === 'manager') {
    const { data } = await withServerPerf(
      '/manager/workspace',
      'workspace_dept_ids_manager',
      supabase.from('dept_managers').select('dept_id').eq('user_id', userId),
      300
    );
    return [...new Set((data ?? []).map((row) => row.dept_id as string))];
  }
  if (r === 'coordinator') {
    const { data } = await withServerPerf(
      '/manager/workspace',
      'workspace_dept_ids_coordinator',
      supabase.from('user_departments').select('dept_id').eq('user_id', userId),
      300
    );
    return [...new Set((data ?? []).map((row) => row.dept_id as string))];
  }
  return [];
}
