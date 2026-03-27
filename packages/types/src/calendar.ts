import { isOrgAdminRole } from './roles';

/**
 * Manual / rota-linked `calendar_events` (not broadcast-sourced rows).
 * Matches RLS `calendar_events_insert_managed`, `calendar_events_update`, `calendar_events_delete`.
 */
export function canManageCalendarManualEvents(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'manager' || isOrgAdminRole(r);
}
