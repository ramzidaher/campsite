/**
 * Pure mirror of hierarchy gates on `user_permission_override_*` RPCs (Phase 4):
 * effective org admins may target anyone in the org; others may target only reports.
 */

import { isReportsDescendantInOrg } from './departmentIsolationPolicy';

export function actorMayManageUserPermissionOverrides(input: {
  actorId: string;
  targetUserId: string;
  isEffectiveOrgAdmin: boolean;
  orgUserIds: ReadonlySet<string>;
  reportsToByUserId: ReadonlyMap<string, string | null | undefined>;
}): boolean {
  if (input.isEffectiveOrgAdmin) return true;
  return isReportsDescendantInOrg({
    orgUserIds: input.orgUserIds,
    ancestorId: input.actorId,
    descendantId: input.targetUserId,
    reportsToByUserId: input.reportsToByUserId,
  });
}
