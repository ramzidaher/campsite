export type FounderOrg = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
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
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
      logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
      user_count: typeof row.user_count === 'number' ? row.user_count : 0,
      broadcast_count: typeof row.broadcast_count === 'number' ? row.broadcast_count : 0,
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
