/**
 * Pure mirror of `public.actor_can_assign_role` (Phase 2) for unit tests and docs.
 * Source of truth: PostgreSQL function in migrations.
 */

export type RankedOrgRole = {
  id: string;
  key: string;
  rank_level: number;
  rank_order: number;
};

export function actorCanAssignRole(input: {
  actorIsPlatformFounder: boolean;
  /** All role rows currently assigned to the actor (same org, not archived). */
  actorAssignedRoles: RankedOrgRole[];
  targetRole: RankedOrgRole;
}): boolean {
  if (input.actorIsPlatformFounder) return true;

  const target = input.targetRole;
  if (target.key === 'org_admin') {
    return input.actorAssignedRoles.some((r) => r.key === 'org_admin');
  }

  const ranked = input.actorAssignedRoles.filter((r) => r.key !== 'org_admin');
  if (ranked.length === 0) return false;

  const maxLevel = Math.max(...ranked.map((r) => r.rank_level));
  const atPeak = ranked.filter((r) => r.rank_level === maxLevel);
  const actorMaxOrder = Math.max(...atPeak.map((r) => r.rank_order ?? 0));

  if (maxLevel > target.rank_level) return true;
  if (maxLevel === target.rank_level && actorMaxOrder >= (target.rank_order ?? 0)) return true;
  return false;
}
