import { JobPipelineClient } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import type { PipelineApplicationRow } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect, notFound } from 'next/navigation';

export default async function JobApplicationsPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const pathStartedAtMs = Date.now();
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  /** Reuses `(main)/layout` cache  avoids duplicate profile + `get_my_permissions` round trips. */
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

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');
  let isAssignedPanelist = false;
  if (!hasApplicationsView) {
    const { data: panelRow } = await supabase
      .from('job_listing_panelists')
      .select('id')
      .eq('org_id', orgId)
      .eq('job_listing_id', id)
      .eq('profile_id', user.id)
      .maybeSingle();
    isAssignedPanelist = Boolean(panelRow?.id);
    if (!isAssignedPanelist) redirect('/broadcasts');
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

  const { data: jobWithNewCols, error: jobErrWithNewCols } = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'job_listing_lookup',
    supabase
      .from('job_listings')
      .select(
        `
        id,
        title,
        status,
        offer_template_id,
        recruitment_request_id,
        recruitment_requests (
          interview_schedule
        )
      `
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
    350
  );

  const fallbackJobResult = jobErrWithNewCols
    ? await withServerPerf(
        '/admin/jobs/[id]/applications',
        'job_listing_lookup_fallback',
        supabase
          .from('job_listings')
          .select(
            `
            id,
            title,
            status,
            recruitment_request_id,
            recruitment_requests (
              interview_schedule
            )
          `
          )
          .eq('id', id)
          .eq('org_id', orgId)
          .maybeSingle(),
        350
      )
    : null;

  const jobRaw = fallbackJobResult?.data ?? jobWithNewCols;
  const job = jobRaw
    ? ({
        ...jobRaw,
        offer_template_id: (jobRaw as { offer_template_id?: string | null }).offer_template_id ?? null,
      } as (typeof jobRaw & { offer_template_id: string | null }))
    : null;
  const jobErr = job ? null : fallbackJobResult?.error ?? jobErrWithNewCols;

  if (jobErr || !job) notFound();

  const [{ data: apps, error: appsErr }, { data: aggRows }, { data: profiles }] = await Promise.all([
    withServerPerf(
      '/admin/jobs/[id]/applications',
      'job_applications_lookup',
      supabase
        .from('job_applications')
        .select(
          'id, candidate_name, candidate_email, stage, submitted_at, cv_storage_path, loom_url, staffsavvy_score, offer_letter_status, candidate_user_id'
        )
        .eq('job_listing_id', id)
        .eq('org_id', orgId)
        .order('submitted_at', { ascending: false })
        .limit(300),
      500
    ),
    withServerPerf(
      '/admin/jobs/[id]/applications',
      'job_screening_aggregates',
      supabase.rpc('get_job_listing_screening_aggregates', { p_job_listing_id: id }),
      400
    ),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
  ]);

  if (appsErr) notFound();

  const aggMap = new Map<
    string,
    { overall_avg: number | null; distinct_scorer_count: number }
  >();
  if (Array.isArray(aggRows)) {
    for (const r of aggRows) {
      const row = r as {
        job_application_id: string;
        overall_avg: number | string | null;
        distinct_scorer_count: number | string | null;
      };
      aggMap.set(String(row.job_application_id), {
        overall_avg:
          row.overall_avg == null || row.overall_avg === ''
            ? null
            : Number(row.overall_avg),
        distinct_scorer_count: Number(row.distinct_scorer_count ?? 0),
      });
    }
  }

  const enrichedApps: PipelineApplicationRow[] = (apps ?? []).map((a) => {
    const row = a as Record<string, unknown>;
    const aid = String(row.id);
    const agg = aggMap.get(aid);
    return {
      id: aid,
      candidate_name: String(row.candidate_name ?? ''),
      candidate_email: String(row.candidate_email ?? ''),
      stage: String(row.stage ?? ''),
      submitted_at: String(row.submitted_at ?? ''),
      cv_storage_path: (row.cv_storage_path as string | null) ?? null,
      loom_url: (row.loom_url as string | null) ?? null,
      staffsavvy_score: (row.staffsavvy_score as number | null) ?? null,
      offer_letter_status: (row.offer_letter_status as string | null) ?? null,
      screening_overall_avg: agg?.overall_avg ?? null,
      screening_scorer_count: agg?.distinct_scorer_count ?? 0,
      is_account_linked: Boolean((row.candidate_user_id as string | null | undefined) ?? null),
    };
  });

  const recruitmentRel = (job as Record<string, unknown>).recruitment_requests;
  const recruitment = Array.isArray(recruitmentRel)
    ? (recruitmentRel[0] as { interview_schedule?: unknown } | undefined)
    : (recruitmentRel as { interview_schedule?: unknown } | null);
  const requestedInterviewSchedule = Array.isArray(recruitment?.interview_schedule)
    ? (recruitment?.interview_schedule as Array<Record<string, unknown>>)
    : [];

  const view = (
    <JobPipelineClient
      jobListingId={id}
      jobTitle={(job.title as string)?.trim() || 'Job'}
      initialApplications={enrichedApps}
      canMoveStage={canMoveStage}
      canBookInterviewSlot={canBookInterviewSlot}
      canManageInterviews={canManageInterviews}
      canCreateInterviewSlot={canCreateInterviewSlot}
      canAddInternalNotes={canAddInternalNotes}
      canNotifyCandidate={canNotifyCandidate}
      canManageOffers={canGenerateOffers || canSendEsignOffers}
      canScoreScreening={canScoreScreening}
      panelProfiles={(profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]}
      requestedInterviewSchedule={requestedInterviewSchedule}
      preferredOfferTemplateId={String((job as { offer_template_id?: string | null }).offer_template_id ?? '').trim() || null}
    />
  );
  warnIfSlowServerPath('/admin/jobs/[id]/applications', pathStartedAtMs);
  return view;
}
