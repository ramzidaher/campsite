import { NextRequest, NextResponse } from 'next/server';

import {
  invalidateAdminApplicationsForOrg,
  invalidateDepartmentRelatedCachesForOrg,
  invalidateInterviewRelatedCachesForOrg,
  invalidateJobRelatedCachesForOrg,
  invalidateLeaveAttendanceCachesForOrg,
  invalidateOnboardingForOrg,
  invalidateOrgSettingsCachesForOrg,
  invalidateOrgMemberCachesForOrg,
  invalidatePerformanceCyclesForOrg,
  invalidateProfileSurfaceForOrg,
  invalidateRecruitmentRelatedCachesForOrg,
  invalidateShellCacheForUser,
} from '@/lib/cache/cacheInvalidation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCOPES = new Set([
  'org-members',
  'org-settings',
  'departments',
  'jobs',
  'applications',
  'recruitment',
  'interviews',
  'onboarding',
  'performance',
  'hr-records',
  'leave-attendance',
  'attendance-self',
  'profile-self',
] as const);

type CacheInvalidationScope =
  | 'org-members'
  | 'org-settings'
  | 'departments'
  | 'jobs'
  | 'applications'
  | 'recruitment'
  | 'interviews'
  | 'onboarding'
  | 'performance'
  | 'hr-records'
  | 'leave-attendance'
  | 'attendance-self'
  | 'profile-self';

function hasAnyPermission(permissionKeys: string[], required: string[]): boolean {
  return required.some((key) => permissionKeys.includes(key));
}

function canInvalidateScope(scope: CacheInvalidationScope, permissionKeys: string[]): boolean {
  if (scope === 'profile-self' || scope === 'attendance-self') return true;
  if (scope === 'org-members') {
    return hasAnyPermission(permissionKeys, [
      'approvals.members.review',
      'members.edit_status',
      'members.edit_roles',
      'members.remove',
      'members.invite',
    ]);
  }
  if (scope === 'org-settings') {
    return permissionKeys.includes('org.settings.manage');
  }
  if (scope === 'departments') {
    return permissionKeys.includes('departments.view');
  }
  if (scope === 'jobs') {
    return hasAnyPermission(permissionKeys, [
      'jobs.create',
      'jobs.edit',
      'jobs.publish',
      'jobs.archive',
      'jobs.manage',
    ]);
  }
  if (scope === 'applications') {
    return hasAnyPermission(permissionKeys, [
      'applications.move_stage',
      'applications.notify_candidate',
      'applications.add_internal_notes',
      'applications.score_screening',
      'applications.manage',
      'interviews.book_slot',
      'interviews.manage',
    ]);
  }
  if (scope === 'recruitment') {
    return hasAnyPermission(permissionKeys, [
      'recruitment.manage',
      'recruitment.approve_request',
      'recruitment.create_request',
    ]);
  }
  if (scope === 'interviews') {
    return hasAnyPermission(permissionKeys, [
      'interviews.create_slot',
      'interviews.book_slot',
      'interviews.complete_slot',
      'interviews.manage',
    ]);
  }
  if (scope === 'onboarding') {
    return hasAnyPermission(permissionKeys, [
      'onboarding.manage_templates',
      'onboarding.manage_runs',
    ]);
  }
  if (scope === 'performance') {
    return permissionKeys.includes('performance.manage_cycles');
  }
  if (scope === 'hr-records') {
    return permissionKeys.includes('hr.manage_records');
  }
  if (scope === 'leave-attendance') {
    return hasAnyPermission(permissionKeys, [
      'leave.submit',
      'leave.approve_direct_reports',
      'leave.manage_org',
    ]);
  }
  return false;
}

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
  const permissionKeys = await getMyPermissions(orgId);
  const unauthorizedScope = uniqueScopes.find((scope) => !canInvalidateScope(scope, permissionKeys));
  if (unauthorizedScope) {
    return NextResponse.json(
      { error: `Not allowed to invalidate scope "${unauthorizedScope}".` },
      { status: 403 }
    );
  }

  if (uniqueShellUserIds.length > 0) {
    const admin = createServiceRoleClient();
    const { data: shellProfiles, error: shellProfilesError } = await admin
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .in('id', uniqueShellUserIds);
    if (shellProfilesError) {
      return NextResponse.json({ error: shellProfilesError.message }, { status: 400 });
    }

    const validShellUserIds = new Set(
      (shellProfiles ?? []).map((row) => String((row as { id?: unknown }).id ?? '').trim()).filter(Boolean)
    );
    if (validShellUserIds.size !== uniqueShellUserIds.length) {
      return NextResponse.json(
        { error: "shell_user_ids must belong to the caller's active organisation." },
        { status: 400 }
      );
    }

    const selfOnly = uniqueShellUserIds.every((userId) => userId === user.id);
    if (!selfOnly && !uniqueScopes.includes('org-members')) {
      return NextResponse.json(
        { error: "Invalidating other users' shell caches requires org-members scope." },
        { status: 403 }
      );
    }
    if (uniqueScopes.includes('profile-self') && !selfOnly) {
      return NextResponse.json(
        { error: 'profile-self scope may only target the current user shell cache.' },
        { status: 403 }
      );
    }
  }

  const tasks: Array<Promise<void>> = [];

  for (const scope of uniqueScopes) {
    if (scope === 'org-members') tasks.push(invalidateOrgMemberCachesForOrg(orgId));
    if (scope === 'org-settings') tasks.push(invalidateOrgSettingsCachesForOrg(orgId));
    if (scope === 'departments') tasks.push(invalidateDepartmentRelatedCachesForOrg(orgId));
    if (scope === 'jobs') tasks.push(invalidateJobRelatedCachesForOrg(orgId));
    if (scope === 'applications') tasks.push(invalidateAdminApplicationsForOrg(orgId));
    if (scope === 'recruitment') tasks.push(invalidateRecruitmentRelatedCachesForOrg(orgId));
    if (scope === 'interviews') tasks.push(invalidateInterviewRelatedCachesForOrg(orgId));
    if (scope === 'onboarding') tasks.push(invalidateOnboardingForOrg(orgId));
    if (scope === 'performance') tasks.push(invalidatePerformanceCyclesForOrg(orgId));
    if (scope === 'hr-records') tasks.push(invalidateProfileSurfaceForOrg(orgId));
    if (scope === 'leave-attendance') tasks.push(invalidateLeaveAttendanceCachesForOrg(orgId));
    if (scope === 'attendance-self') tasks.push(invalidateLeaveAttendanceCachesForOrg(orgId));
    if (scope === 'profile-self') tasks.push(invalidateProfileSurfaceForOrg(orgId));
  }

  for (const userId of uniqueShellUserIds) {
    tasks.push(invalidateShellCacheForUser(userId));
  }

  await Promise.all(tasks);
  return NextResponse.json({ ok: true });
}
