import { NextRequest, NextResponse } from 'next/server';

import {
  invalidateAdminApplicationsForOrg,
  invalidateInterviewRelatedCachesForOrg,
  invalidateJobRelatedCachesForOrg,
  invalidateOnboardingForOrg,
  invalidateOrgMemberCachesForOrg,
  invalidatePerformanceCyclesForOrg,
  invalidateRecruitmentRelatedCachesForOrg,
  invalidateShellCacheForUser,
} from '@/lib/cache/cacheInvalidation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCOPES = new Set([
  'org-members',
  'jobs',
  'applications',
  'recruitment',
  'interviews',
  'onboarding',
  'performance',
] as const);

type CacheInvalidationScope =
  | 'org-members'
  | 'jobs'
  | 'applications'
  | 'recruitment'
  | 'interviews'
  | 'onboarding'
  | 'performance';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!me?.org_id || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { scopes?: string[]; shell_user_ids?: string[] }
    | null;
  const scopes = Array.isArray(body?.scopes) ? body.scopes : [];
  const shellUserIds = Array.isArray(body?.shell_user_ids) ? body.shell_user_ids : [];

  if (scopes.some((scope) => !ALLOWED_SCOPES.has(scope as CacheInvalidationScope))) {
    return NextResponse.json({ error: 'Invalid cache invalidation scope.' }, { status: 400 });
  }
  const uniqueScopes = [...new Set(scopes as CacheInvalidationScope[])];

  const uniqueShellUserIds = [...new Set(shellUserIds.map((value) => value.trim()).filter(Boolean))];
  for (const userId of uniqueShellUserIds) {
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'Invalid shell_user_id.' }, { status: 400 });
    }
  }

  const orgId = me.org_id as string;
  const tasks: Array<Promise<void>> = [];

  for (const scope of uniqueScopes) {
    if (scope === 'org-members') tasks.push(invalidateOrgMemberCachesForOrg(orgId));
    if (scope === 'jobs') tasks.push(invalidateJobRelatedCachesForOrg(orgId));
    if (scope === 'applications') tasks.push(invalidateAdminApplicationsForOrg(orgId));
    if (scope === 'recruitment') tasks.push(invalidateRecruitmentRelatedCachesForOrg(orgId));
    if (scope === 'interviews') tasks.push(invalidateInterviewRelatedCachesForOrg(orgId));
    if (scope === 'onboarding') tasks.push(invalidateOnboardingForOrg(orgId));
    if (scope === 'performance') tasks.push(invalidatePerformanceCyclesForOrg(orgId));
  }

  for (const userId of uniqueShellUserIds) {
    tasks.push(invalidateShellCacheForUser(userId));
  }

  await Promise.all(tasks);
  return NextResponse.json({ ok: true });
}
