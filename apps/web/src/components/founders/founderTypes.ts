export type FounderOrg = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan_tier?: string;
  subscription_status?: string;
  is_locked?: boolean;
  maintenance_mode?: boolean;
  force_logout_after?: string | null;
  /** Set when subscription is or was in trial; ISO timestamp */
  subscription_trial_started_at?: string | null;
  /** Trial access ends at; ISO timestamp */
  subscription_trial_ends_at?: string | null;
  created_at: string;
  logo_url: string | null;
  user_count: number;
  broadcast_count: number;
};

export type FounderMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  org_id: string;
  org_name: string;
  org_slug: string;
};

export type FounderOrgProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type FounderPermissionCatalogEntry = {
  version_no: number;
  key: string;
  label: string;
  description: string;
  category: string;
  is_founder_only: boolean;
  is_archived: boolean;
};

export type FounderRolePreset = {
  id: string;
  source_version_no: number;
  key: string;
  name: string;
  description: string;
  target_use_case: string;
  recommended_permission_keys: string[];
  is_archived: boolean;
};

export type FounderAuditEvent = {
  id: string;
  actor_user_id: string | null;
  org_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  before_state: unknown;
  after_state: unknown;
  metadata: unknown;
  created_at: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function parseFounderOrgs(json: unknown): FounderOrg[] {
  if (!Array.isArray(json)) return [];
  const out: FounderOrg[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const name = row.name;
    const slug = row.slug;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof slug !== 'string') continue;
    out.push({
      id,
      name,
      slug,
      is_active: Boolean(row.is_active),
      plan_tier: typeof row.plan_tier === 'string' ? row.plan_tier : 'starter',
      subscription_status: typeof row.subscription_status === 'string' ? row.subscription_status : 'active',
      is_locked: Boolean(row.is_locked),
      maintenance_mode: Boolean(row.maintenance_mode),
      force_logout_after: typeof row.force_logout_after === 'string' ? row.force_logout_after : null,
      subscription_trial_started_at:
        typeof row.subscription_trial_started_at === 'string' ? row.subscription_trial_started_at : null,
      subscription_trial_ends_at:
        typeof row.subscription_trial_ends_at === 'string' ? row.subscription_trial_ends_at : null,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
      user_count: typeof row.user_count === 'number' ? row.user_count : 0,
      broadcast_count: typeof row.broadcast_count === 'number' ? row.broadcast_count : 0,
    });
  }
  return out;
}

export function parseFounderPermissionCatalogEntries(json: unknown): FounderPermissionCatalogEntry[] {
  if (!Array.isArray(json)) return [];
  const out: FounderPermissionCatalogEntry[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    if (typeof row.key !== 'string') continue;
    out.push({
      version_no: typeof row.version_no === 'number' ? row.version_no : 0,
      key: row.key,
      label: typeof row.label === 'string' ? row.label : '',
      description: typeof row.description === 'string' ? row.description : '',
      category: typeof row.category === 'string' ? row.category : 'other',
      is_founder_only: Boolean(row.is_founder_only),
      is_archived: Boolean(row.is_archived),
    });
  }
  return out;
}

export function parseFounderRolePresets(json: unknown): FounderRolePreset[] {
  if (!Array.isArray(json)) return [];
  const out: FounderRolePreset[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    if (typeof row.id !== 'string' || typeof row.key !== 'string') continue;
    out.push({
      id: row.id,
      source_version_no: typeof row.source_version_no === 'number' ? row.source_version_no : 0,
      key: row.key,
      name: typeof row.name === 'string' ? row.name : '',
      description: typeof row.description === 'string' ? row.description : '',
      target_use_case: typeof row.target_use_case === 'string' ? row.target_use_case : '',
      recommended_permission_keys: Array.isArray(row.recommended_permission_keys)
        ? row.recommended_permission_keys.filter((x): x is string => typeof x === 'string')
        : [],
      is_archived: Boolean(row.is_archived),
    });
  }
  return out;
}

export function parseFounderAuditEvents(json: unknown): FounderAuditEvent[] {
  if (!Array.isArray(json)) return [];
  const out: FounderAuditEvent[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    if (typeof row.id !== 'string') continue;
    out.push({
      id: row.id,
      actor_user_id: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
      org_id: typeof row.org_id === 'string' ? row.org_id : null,
      event_type: typeof row.event_type === 'string' ? row.event_type : '',
      entity_type: typeof row.entity_type === 'string' ? row.entity_type : '',
      entity_id: typeof row.entity_id === 'string' ? row.entity_id : '',
      before_state: row.before_state,
      after_state: row.after_state,
      metadata: row.metadata,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
    });
  }
  return out;
}

export function parseFounderMembers(json: unknown): FounderMember[] {
  if (!Array.isArray(json)) return [];
  const out: FounderMember[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const org_id = row.org_id;
    const org_name = row.org_name;
    const org_slug = row.org_slug;
    if (
      typeof id !== 'string' ||
      typeof org_id !== 'string' ||
      typeof org_name !== 'string' ||
      typeof org_slug !== 'string'
    ) {
      continue;
    }
    out.push({
      id,
      full_name: typeof row.full_name === 'string' ? row.full_name : '',
      email: typeof row.email === 'string' ? row.email : null,
      role: typeof row.role === 'string' ? row.role : '',
      status: typeof row.status === 'string' ? row.status : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      org_id,
      org_name,
      org_slug,
    });
  }
  return out;
}

export type FounderBroadcast = {
  id: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  title: string;
  body: string;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  sender_name: string | null;
  sender_email: string | null;
};

export type FounderRotaShift = {
  id: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  user_id: string | null;
  staff_name: string | null;
  role_label: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
  source: string;
};

export function parseFounderBroadcasts(json: unknown): FounderBroadcast[] {
  if (!Array.isArray(json)) return [];
  const out: FounderBroadcast[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const org_id = row.org_id;
    if (typeof id !== 'string' || typeof org_id !== 'string') continue;
    out.push({
      id,
      org_id,
      org_name: typeof row.org_name === 'string' ? row.org_name : '',
      org_slug: typeof row.org_slug === 'string' ? row.org_slug : '',
      title: typeof row.title === 'string' ? row.title : '',
      body: typeof row.body === 'string' ? row.body : '',
      status: typeof row.status === 'string' ? row.status : '',
      sent_at: typeof row.sent_at === 'string' ? row.sent_at : null,
      scheduled_at: typeof row.scheduled_at === 'string' ? row.scheduled_at : null,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      sender_name: typeof row.sender_name === 'string' ? row.sender_name : null,
      sender_email: typeof row.sender_email === 'string' ? row.sender_email : null,
    });
  }
  return out;
}

export function parseFounderRotaShifts(json: unknown): FounderRotaShift[] {
  if (!Array.isArray(json)) return [];
  const out: FounderRotaShift[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const org_id = row.org_id;
    if (typeof id !== 'string' || typeof org_id !== 'string') continue;
    out.push({
      id,
      org_id,
      org_name: typeof row.org_name === 'string' ? row.org_name : '',
      org_slug: typeof row.org_slug === 'string' ? row.org_slug : '',
      user_id: typeof row.user_id === 'string' ? row.user_id : null,
      staff_name: typeof row.staff_name === 'string' ? row.staff_name : null,
      role_label: typeof row.role_label === 'string' ? row.role_label : null,
      start_time: typeof row.start_time === 'string' ? row.start_time : '',
      end_time: typeof row.end_time === 'string' ? row.end_time : '',
      notes: typeof row.notes === 'string' ? row.notes : null,
      source: typeof row.source === 'string' ? row.source : 'manual',
    });
  }
  return out;
}

export function parseFounderOrgProfiles(json: unknown): FounderOrgProfile[] {
  if (!Array.isArray(json)) return [];
  const out: FounderOrgProfile[] = [];
  for (const row of json) {
    if (!isRecord(row)) continue;
    const id = row.id;
    if (typeof id !== 'string') continue;
    out.push({
      id,
      full_name: typeof row.full_name === 'string' ? row.full_name : '',
      email: typeof row.email === 'string' ? row.email : null,
      role: typeof row.role === 'string' ? row.role : '',
      status: typeof row.status === 'string' ? row.status : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
    });
  }
  return out;
}
