/**
 * Pure helpers mirroring Phase 3 RLS / RPC rules for tests and documentation.
 * Source of truth for enforcement remains PostgreSQL policies and RPCs.
 */

export function profileVisibleUnderDepartmentIsolation(input: {
  viewerId: string;
  targetId: string;
  viewerDepartmentIds: ReadonlySet<string>;
  targetDepartmentIds: ReadonlySet<string>;
  isEffectiveOrgAdmin: boolean;
}): boolean {
  const { viewerId, targetId, viewerDepartmentIds, targetDepartmentIds, isEffectiveOrgAdmin } = input;
  if (viewerId === targetId) return true;
  if (isEffectiveOrgAdmin) return true;
  for (const d of targetDepartmentIds) {
    if (viewerDepartmentIds.has(d)) return true;
  }
  return false;
}

export function isReportsDescendantInOrg(input: {
  orgUserIds: ReadonlySet<string>;
  ancestorId: string;
  descendantId: string;
  reportsToByUserId: ReadonlyMap<string, string | null | undefined>;
  maxDepth?: number;
}): boolean {
  const { orgUserIds, ancestorId, descendantId, reportsToByUserId, maxDepth = 100 } = input;
  if (ancestorId === descendantId) return false;
  let current: string | null | undefined = descendantId;
  let depth = 0;
  while (current != null && depth < maxDepth) {
    if (!orgUserIds.has(current)) return false;
    const next: string | null = reportsToByUserId.get(current) ?? null;
    if (next === ancestorId) return true;
    current = next;
    depth += 1;
  }
  return false;
}

/** Hide manager identity in directory when viewer cannot see that profile. */
export function maskManagerForDirectoryRow(input: {
  reportsToUserId: string | null;
  reportsToName: string | null;
  managerVisible: boolean;
}): { reportsToUserId: string | null; reportsToName: string | null } {
  if (!input.reportsToUserId) return { reportsToUserId: null, reportsToName: null };
  if (input.managerVisible) {
    return { reportsToUserId: input.reportsToUserId, reportsToName: input.reportsToName };
  }
  return { reportsToUserId: null, reportsToName: null };
}

export function pendingMemberApproversableByDeptManager(input: {
  pendingUserDepartmentIds: ReadonlySet<string>;
  viewerManagedDepartmentIds: ReadonlySet<string>;
  isEffectiveOrgAdmin: boolean;
  isPlatformFounder: boolean;
}): boolean {
  if (input.isPlatformFounder || input.isEffectiveOrgAdmin) return true;
  for (const d of input.pendingUserDepartmentIds) {
    if (input.viewerManagedDepartmentIds.has(d)) return true;
  }
  return false;
}
