import {
  invalidateSharedCache,
  invalidateSharedCacheByPrefix,
} from '@/lib/cache/sharedCache';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  invalidateAllCachedMainShellLayoutBundles,
  invalidateCachedMainShellLayoutBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';

function getOrgExactKey(orgId: string): string {
  return `org:${orgId}`;
}

function getHrOverviewKeys(orgId: string): string[] {
  const keys: string[] = [];
  for (const includeJobs of [false, true]) {
    for (const includeApplications of [false, true]) {
      for (const includeMembers of [false, true]) {
        for (const includeInterviews of [false, true]) {
          keys.push(
            [
              `org:${orgId}`,
              `jobs:${includeJobs ? '1' : '0'}`,
              `applications:${includeApplications ? '1' : '0'}`,
              `members:${includeMembers ? '1' : '0'}`,
              `interviews:${includeInterviews ? '1' : '0'}`,
            ].join(':')
          );
        }
      }
    }
  }
  return keys;
}

export async function invalidateHrDashboardStatsForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:hr:dashboard', getOrgExactKey(orgId));
}

export async function invalidateHrDirectoryForOrg(orgId: string): Promise<void> {
  await invalidateSharedCacheByPrefix('campsite:hr:directory', `org:${orgId}:`);
}

export async function invalidateHrOverviewForOrg(orgId: string): Promise<void> {
  await Promise.all(
    getHrOverviewKeys(orgId).map((key) => invalidateSharedCache('campsite:hr:overview', key))
  );
}

export async function invalidateOrgChartForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:hr:org-chart', getOrgExactKey(orgId));
}

export async function invalidatePerformanceCyclesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateSharedCache('campsite:hr:performance', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hr:performance:cycle', `org:${orgId}:cycle:`),
    invalidateSharedCacheByPrefix('campsite:performance:review-detail', `org:${orgId}:review:`),
    invalidateSharedCacheByPrefix('campsite:performance:index', `org:${orgId}:`),
  ]);
}

export async function invalidateOnboardingForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateSharedCache('campsite:hr:onboarding', `org:${orgId}:shared`),
    invalidateSharedCacheByPrefix('campsite:hr:onboarding:tasks', `org:${orgId}:template:`),
    invalidateSharedCacheByPrefix('campsite:hr:onboarding:run', `org:${orgId}:run:`),
    invalidateSharedCacheByPrefix('campsite:hr:onboarding:runs', `org:${orgId}:`),
    invalidateSharedCacheByPrefix('campsite:onboarding:employee', `org:${orgId}:`),
  ]);
}

export async function invalidateJobsForOrg(orgId: string): Promise<void> {
  await invalidateSharedCacheByPrefix('campsite:jobs:listings', getOrgExactKey(orgId));
}

export async function invalidatePublicJobsForOrg(orgId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: orgRow } = await admin.from('organisations').select('slug').eq('id', orgId).maybeSingle();
  const orgSlug = String((orgRow as { slug?: string | null } | null)?.slug ?? '').trim();
  if (!orgSlug) return;
  await invalidateSharedCacheByPrefix('campsite:public:jobs:list', `org:${orgSlug}:`);
}

export async function invalidateAdminApplicationsForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateSharedCacheByPrefix('campsite:jobs:applications', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:recruitment:application-notifications', `org:${orgId}:`),
    invalidateSharedCacheByPrefix('campsite:jobs:detail:applications:access', `org:${orgId}:`),
  ]);
}

export async function invalidateRecruitmentQueueForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateSharedCacheByPrefix('campsite:jobs:recruitment', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:recruitment:detail', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hr:recruitment:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hiring:application-forms:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hiring:application-forms:preview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hiring:application-forms:edit', getOrgExactKey(orgId)),
  ]);
}

export async function invalidateInterviewScheduleForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:jobs:interviews', getOrgExactKey(orgId));
}

export async function invalidateOneOnOneComplianceForOrg(orgId: string): Promise<void> {
  await invalidateSharedCacheByPrefix('campsite:hr:one-on-ones:compliance', `org:${orgId}:`);
}

export async function invalidateBroadcastCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateSharedCacheByPrefix('campsite:broadcasts:detail', `org:${orgId}:`),
    invalidateSharedCacheByPrefix('campsite:broadcasts:edit', `org:${orgId}:`),
  ]);
}

export async function invalidateOrgMemberCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDashboardStatsForOrg(orgId),
    invalidateHrDirectoryForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
    invalidateOrgChartForOrg(orgId),
    invalidateOnboardingForOrg(orgId),
    invalidateJobsForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateInterviewScheduleForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:admin:users', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:employee', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:employee:limited', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:dashboard:home', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hr:absence-reporting', getOrgExactKey(orgId)),
    invalidateOneOnOneComplianceForOrg(orgId),
    invalidateBroadcastCachesForOrg(orgId),
  ]);
}

export async function invalidateDepartmentRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDirectoryForOrg(orgId),
    invalidateOrgChartForOrg(orgId),
    invalidateJobsForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateRecruitmentQueueForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:manager:dashboard', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:manager:system-overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:system-overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:teams', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:manager:workspace-directory', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:categories', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:dashboard:home', getOrgExactKey(orgId)),
  ]);
}

export async function invalidateJobRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateJobsForOrg(orgId),
    invalidatePublicJobsForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:admin:broadcasts', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:admin-legal', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:detail:edit', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:detail:applications', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:detail:applications:access', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:offer-templates', getOrgExactKey(orgId)),
    invalidateInterviewScheduleForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
  ]);
}

export async function invalidateRecruitmentRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateRecruitmentQueueForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:admin:offer-templates', getOrgExactKey(orgId)),
  ]);
}

export async function invalidateLeaveAttendanceCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDashboardStatsForOrg(orgId),
    invalidateHrDirectoryForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:hr:absence-reporting', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:leave:page', getOrgExactKey(orgId)),
  ]);
}

export async function invalidateProfileSurfaceForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDirectoryForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
    invalidateOrgChartForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:profile:employee-file', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:other-tab', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:personal-tab', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:employee', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:employee:limited', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:dashboard:home', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hr:recruitment:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:settings:page', 'user:'),
  ]);
}

export async function invalidateOrgSettingsCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateJobsForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:hr:metric-alerts', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:leave:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:performance:index', `org:${orgId}:`),
    invalidateSharedCacheByPrefix('campsite:manager:dashboard', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:manager:system-overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:system-overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:settings', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:leave', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:home', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:custom-fields', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:rota', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:settings:page', 'user:'),
    invalidateSharedCacheByPrefix('campsite:dashboard:home', getOrgExactKey(orgId)),
    invalidateShellCachesForOrg(orgId),
  ]);
}

export async function invalidateInterviewRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateInterviewScheduleForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
  ]);
}

export async function invalidateAllKnownSharedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDashboardStatsForOrg(orgId),
    invalidateHrDirectoryForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
    invalidateOrgChartForOrg(orgId),
    invalidatePerformanceCyclesForOrg(orgId),
    invalidateOnboardingForOrg(orgId),
    invalidateJobsForOrg(orgId),
    invalidatePublicJobsForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:jobs:detail:edit', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:detail:applications', getOrgExactKey(orgId)),
    invalidateRecruitmentQueueForOrg(orgId),
    invalidateInterviewScheduleForOrg(orgId),
    invalidateSharedCacheByPrefix('campsite:admin:users', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:employee-file', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:other-tab', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:profile:personal-tab', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:manager:dashboard', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:manager:system-overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:employee', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:system-overview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:teams', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:manager:workspace-directory', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:categories', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:settings', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:leave', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:home', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:offer-templates', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:hr:custom-fields', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:rota', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:settings:page', 'user:'),
    invalidateSharedCacheByPrefix('campsite:dashboard:home', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hr:recruitment:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hiring:application-forms:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hiring:application-forms:preview', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hiring:application-forms:edit', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:onboarding:employee', `org:${orgId}:`),
    invalidateSharedCacheByPrefix('campsite:hr:absence-reporting', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:hr:metric-alerts', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:leave:page', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:admin:broadcasts', getOrgExactKey(orgId)),
    invalidateSharedCacheByPrefix('campsite:jobs:admin-legal', getOrgExactKey(orgId)),
    invalidateOneOnOneComplianceForOrg(orgId),
    invalidateBroadcastCachesForOrg(orgId),
  ]);
}

export async function invalidateShellCacheForUser(userId: string): Promise<void> {
  await invalidateCachedMainShellLayoutBundle(userId);
}

export async function invalidateShellCachesForUsers(userIds: string[]): Promise<void> {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  if (uniqueUserIds.length === 0) return;
  await Promise.all(uniqueUserIds.map((userId) => invalidateCachedMainShellLayoutBundle(userId)));
}

export async function invalidateShellCachesForOrg(orgId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from('profiles').select('id').eq('org_id', orgId);
    if (error) throw error;

    const userIds = [...new Set((data ?? []).map((row) => String(row.id ?? '').trim()).filter(Boolean))];
    if (userIds.length === 0) return;

    await invalidateShellCachesForUsers(userIds);
  } catch {
    await invalidateAllCachedMainShellLayoutBundles();
  }
}

export async function invalidateAllShellCaches(): Promise<void> {
  await invalidateAllCachedMainShellLayoutBundles();
}
