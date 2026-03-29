import {
  canViewDashboardSentBroadcastKpi,
  canViewDashboardStatTiles,
  canViewDashboardUnreadBroadcastKpi,
  dashboardAggregateScope,
} from '@campsite/types';

/** Mirrors product rules in `03-dashboard.md` — must stay aligned with `fetchDashboardStatCounts` (uses same types helper). */
describe('dashboardAggregateScope', () => {
  it('uses org scope for org_admin and legacy super_admin', () => {
    expect(dashboardAggregateScope('org_admin')).toBe('org');
    expect(dashboardAggregateScope('super_admin')).toBe('org');
  });

  it('uses dept scope for manager, coordinator, society_leader', () => {
    expect(dashboardAggregateScope('manager')).toBe('dept');
    expect(dashboardAggregateScope('coordinator')).toBe('dept');
    expect(dashboardAggregateScope('society_leader')).toBe('dept');
  });

  it('hides KPI tiles for administrator, duty_manager, and csa', () => {
    expect(dashboardAggregateScope('administrator')).toBe('none');
    expect(dashboardAggregateScope('duty_manager')).toBe('none');
    expect(dashboardAggregateScope('csa')).toBe('none');
    expect(canViewDashboardStatTiles('csa')).toBe(false);
  });

  it('hides sent-broadcast and unread KPIs for society_leader but keeps stat tiles for members', () => {
    expect(canViewDashboardStatTiles('society_leader')).toBe(true);
    expect(canViewDashboardSentBroadcastKpi('society_leader')).toBe(false);
    expect(canViewDashboardUnreadBroadcastKpi('society_leader')).toBe(false);
    expect(canViewDashboardSentBroadcastKpi('coordinator')).toBe(true);
    expect(canViewDashboardUnreadBroadcastKpi('coordinator')).toBe(true);
  });
});
