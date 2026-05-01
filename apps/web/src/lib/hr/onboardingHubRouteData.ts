import { getCachedOnboardingHubRuns, getCachedOnboardingHubSharedData, getCachedOnboardingTemplateTasks } from '@/lib/hr/getCachedOnboardingHubData';

export async function getCachedOnboardingHubPageData(params: {
  orgId: string;
  userId: string;
  onlyOwnRuns: boolean;
  selectedTemplateId: string | null;
}) {
  const [sharedData, runs] = await Promise.all([
    getCachedOnboardingHubSharedData(params.orgId),
    getCachedOnboardingHubRuns(params.orgId, params.userId, params.onlyOwnRuns),
  ]);

  const templateTasks = params.selectedTemplateId
    ? await getCachedOnboardingTemplateTasks(params.orgId, params.selectedTemplateId)
    : [];

  return {
    sharedData,
    runs,
    templateTasks,
  };
}
