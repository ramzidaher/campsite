import {
  canComposeBroadcast,
  isBroadcastApproverRole,
  isBroadcastDraftOnlyRole,
} from '@campsite/types';

/**
 * Contract tests for `packages/types/src/broadcasts.ts`.
 * DB enforces `broadcast_form_allowed` / RLS — these gates must stay aligned for tab UX and composer entry.
 */
describe('broadcast role helpers', () => {
  describe('canComposeBroadcast', () => {
    it('allows staff broadcast roles and org admin', () => {
      for (const role of [
        'administrator',
        'duty_manager',
        'csa',
        'coordinator',
        'manager',
        'org_admin',
        'super_admin',
        'society_leader',
      ]) {
        expect(canComposeBroadcast(role)).toBe(true);
      }
    });

    it('denies roles without composer access', () => {
      expect(canComposeBroadcast('unassigned')).toBe(false);
    });
  });

  describe('isBroadcastDraftOnlyRole', () => {
    it('is true only for duty manager and CSA', () => {
      expect(isBroadcastDraftOnlyRole('duty_manager')).toBe(true);
      expect(isBroadcastDraftOnlyRole('csa')).toBe(true);
    });

    it('is false for administrator (full send path like manager)', () => {
      expect(isBroadcastDraftOnlyRole('administrator')).toBe(false);
    });

    it('is false for coordinator and manager', () => {
      expect(isBroadcastDraftOnlyRole('coordinator')).toBe(false);
      expect(isBroadcastDraftOnlyRole('manager')).toBe(false);
    });
  });

  describe('isBroadcastApproverRole', () => {
    it('is true for managers and org admins', () => {
      expect(isBroadcastApproverRole('manager')).toBe(true);
      expect(isBroadcastApproverRole('org_admin')).toBe(true);
      expect(isBroadcastApproverRole('super_admin')).toBe(true);
    });

    it('is false for coordinator and CSA (not broadcast approvers)', () => {
      expect(isBroadcastApproverRole('coordinator')).toBe(false);
      expect(isBroadcastApproverRole('csa')).toBe(false);
      expect(isBroadcastApproverRole('administrator')).toBe(false);
    });
  });
});
