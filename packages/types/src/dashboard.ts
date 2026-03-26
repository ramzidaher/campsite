import { isOrgAdminRole } from './roles';

/** Org-wide dashboard tiles (total broadcasts, active members). UI/loader only — not RLS. */
export function canViewOrgWideDashboardStats(role: string | null | undefined): boolean {
  const r = role?.trim();
  if (!r) return false;
  return isOrgAdminRole(r) || r === 'manager' || r === 'coordinator';
}
