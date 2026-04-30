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
  await invalidateSharedCache('campsite:hr:performance', getOrgExactKey(orgId));
}

export async function invalidateOnboardingForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateSharedCache('campsite:hr:onboarding', `org:${orgId}:shared`),
    invalidateSharedCacheByPrefix('campsite:hr:onboarding:tasks', `org:${orgId}:template:`),
  ]);
}

export async function invalidateJobsForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:jobs:listings', getOrgExactKey(orgId));
}

export async function invalidateAdminApplicationsForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:jobs:applications', getOrgExactKey(orgId));
}

export async function invalidateRecruitmentQueueForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:jobs:recruitment', getOrgExactKey(orgId));
}

export async function invalidateInterviewScheduleForOrg(orgId: string): Promise<void> {
  await invalidateSharedCache('campsite:jobs:interviews', getOrgExactKey(orgId));
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
  ]);
}

export async function invalidateDepartmentRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDirectoryForOrg(orgId),
    invalidateOrgChartForOrg(orgId),
    invalidateJobsForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateRecruitmentQueueForOrg(orgId),
  ]);
}

export async function invalidateJobRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateJobsForOrg(orgId),
    invalidateAdminApplicationsForOrg(orgId),
    invalidateInterviewScheduleForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
  ]);
}

export async function invalidateRecruitmentRelatedCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateRecruitmentQueueForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
  ]);
}

export async function invalidateLeaveAttendanceCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDashboardStatsForOrg(orgId),
    invalidateHrDirectoryForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
  ]);
}

export async function invalidateProfileSurfaceForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateHrDirectoryForOrg(orgId),
    invalidateHrOverviewForOrg(orgId),
    invalidateOrgChartForOrg(orgId),
  ]);
}

export async function invalidateOrgSettingsCachesForOrg(orgId: string): Promise<void> {
  await Promise.all([
    invalidateJobsForOrg(orgId),
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
    invalidateAdminApplicationsForOrg(orgId),
    invalidateRecruitmentQueueForOrg(orgId),
    invalidateInterviewScheduleForOrg(orgId),
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
