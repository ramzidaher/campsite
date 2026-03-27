/**
 * Pure helpers for who appears in pending-approval queues. Kept separate from `server-only` loaders for unit tests.
 */

/** User IDs that have at least one `user_departments` row in `deptIds` (manager/coordinator overlap vs `can_approve_profile`). */
export function userIdsWithMembershipInDepartments(
  rows: { user_id: string; dept_id: string }[],
  deptIds: string[]
): Set<string> {
  if (!deptIds.length) return new Set();
  const ds = new Set(deptIds);
  const out = new Set<string>();
  for (const row of rows) {
    if (ds.has(row.dept_id)) out.add(row.user_id);
  }
  return out;
}
