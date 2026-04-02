import {
  parseFounderAuditEvents,
  parseFounderOrgs,
  parseFounderPermissionCatalogEntries,
  parseFounderRolePresets,
} from '../founderTypes';

describe('founderTypes parsers', () => {
  it('parses organisation governance fields', () => {
    const rows = parseFounderOrgs([
      {
        id: 'org-1',
        name: 'Org One',
        slug: 'org-one',
        is_active: true,
        plan_tier: 'pro',
        subscription_status: 'limited',
        is_locked: true,
        maintenance_mode: false,
        force_logout_after: '2026-06-01T00:00:00.000Z',
        created_at: '2026-06-01T00:00:00.000Z',
        logo_url: null,
        user_count: 10,
        broadcast_count: 5,
      },
    ]);
    expect(rows[0]).toMatchObject({
      id: 'org-1',
      plan_tier: 'pro',
      subscription_status: 'limited',
      is_locked: true,
      maintenance_mode: false,
      force_logout_after: '2026-06-01T00:00:00.000Z',
    });
  });

  it('parses permission catalog entries and ignores invalid rows', () => {
    const rows = parseFounderPermissionCatalogEntries([
      { key: 'jobs.manage', label: 'Manage jobs', category: 'jobs', version_no: 2, is_founder_only: false, is_archived: false },
      { label: 'Missing key' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('jobs.manage');
  });

  it('parses role presets with recommended keys', () => {
    const rows = parseFounderRolePresets([
      {
        id: 'preset-1',
        source_version_no: 7,
        key: 'hr_manager',
        name: 'HR Manager',
        description: 'Hiring role',
        target_use_case: 'Recruitment',
        recommended_permission_keys: ['jobs.view', 'applications.manage'],
        is_archived: false,
      },
    ]);
    expect(rows[0]).toMatchObject({
      id: 'preset-1',
      source_version_no: 7,
      recommended_permission_keys: ['jobs.view', 'applications.manage'],
    });
  });

  it('parses audit events', () => {
    const rows = parseFounderAuditEvents([
      {
        id: 'audit-1',
        actor_user_id: 'user-1',
        org_id: 'org-1',
        event_type: 'catalog.published',
        entity_type: 'permission_catalog_version',
        entity_id: '3',
        before_state: {},
        after_state: { version_no: 3 },
        metadata: {},
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]);
    expect(rows[0]?.event_type).toBe('catalog.published');
  });
});
