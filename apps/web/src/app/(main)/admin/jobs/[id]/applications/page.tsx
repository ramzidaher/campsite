import { JobPipelineClient } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import { getCachedJobApplicationsAccessData } from '@/lib/jobs/getCachedJobApplicationsAccessData';
import { getCachedJobApplicationsPipelinePageData } from '@/lib/jobs/getCachedJobApplicationsPipelinePageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect, notFound } from 'next/navigation';

export default async function JobApplicationsPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const pathStartedAtMs = Date.now();
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  /** Reuses `(main)/layout` cache — avoids duplicate profile + `get_my_permissions` round trips. */
  const bundle = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const hasApplicationsView = permissionKeys.includes('applications.view');
  const userIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
  if (!userId) redirect('/login');

  let isAssignedPanelist = false;
  if (!hasApplicationsView) {
    const accessData = await withServerPerf(
      '/admin/jobs/[id]/applications',
      'cached_job_applications_access_data',
      getCachedJobApplicationsAccessData(orgId, id, userId),
      500
    );
    isAssignedPanelist = accessData.isAssignedPanelist;
    if (!isAssignedPanelist) redirect('/forbidden');
  }

  const canMoveStage = permissionKeys.includes('applications.move_stage') || isAssignedPanelist;
  const canBookInterviewSlot = permissionKeys.includes('interviews.book_slot') || isAssignedPanelist;
  const canManageInterviews  = permissionKeys.includes('interviews.manage');
  const canCreateInterviewSlot = permissionKeys.includes('interviews.create_slot');
  const canAddInternalNotes  = permissionKeys.includes('applications.add_internal_notes');
  const canNotifyCandidate   = permissionKeys.includes('applications.notify_candidate');
  const canGenerateOffers    = permissionKeys.includes('offers.generate');
  const canSendEsignOffers   = permissionKeys.includes('offers.send_esign');
  const canScoreScreening =
    permissionKeys.includes('applications.score_screening') ||
    permissionKeys.includes('applications.manage') ||
    isAssignedPanelist;

  const pageData = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'cached_job_applications_pipeline_page_data',
    getCachedJobApplicationsPipelinePageData(orgId, id),
    700
  );
  const job = pageData.job;
  if (!job) notFound();

  const view = (
    <JobPipelineClient
      jobListingId={id}
      jobTitle={(job.title as string)?.trim() || 'Job'}
      initialApplications={pageData.applications}
      canMoveStage={canMoveStage}
      canBookInterviewSlot={canBookInterviewSlot}
      canManageInterviews={canManageInterviews}
      canCreateInterviewSlot={canCreateInterviewSlot}
      canAddInternalNotes={canAddInternalNotes}
      canNotifyCandidate={canNotifyCandidate}
      canManageOffers={canGenerateOffers || canSendEsignOffers}
      canScoreScreening={canScoreScreening}
      panelProfiles={pageData.panelProfiles}
      requestedInterviewSchedule={pageData.requestedInterviewSchedule}
      preferredOfferTemplateId={String((job as { offer_template_id?: string | null }).offer_template_id ?? '').trim() || null}
    />
  );
  warnIfSlowServerPath('/admin/jobs/[id]/applications', pathStartedAtMs);
  return view;
}
