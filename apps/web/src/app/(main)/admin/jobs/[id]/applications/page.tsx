import { JobPipelineClient } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import type { PipelineApplicationRow } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function JobApplicationsPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const pathStartedAtMs = Date.now();
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, role, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('applications.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const permissionKeys = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'get_my_permissions',
    getMyPermissions(orgId),
    300
  );
  const canMoveStage         = permissionKeys.includes('applications.move_stage');
  const canBookInterviewSlot = permissionKeys.includes('interviews.book_slot');
  const canManageInterviews  = permissionKeys.includes('interviews.manage');
  const canAddInternalNotes  = permissionKeys.includes('applications.add_internal_notes');
  const canNotifyCandidate   = permissionKeys.includes('applications.notify_candidate');
  const canGenerateOffers    = permissionKeys.includes('offers.generate');
  const canSendEsignOffers   = permissionKeys.includes('offers.send_esign');

  const { data: job, error: jobErr } = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'job_listing_lookup',
    supabase
      .from('job_listings')
      .select('id, title, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
    350
  );

  if (jobErr || !job) notFound();

  const { data: apps, error: appsErr } = await withServerPerf(
    '/admin/jobs/[id]/applications',
    'job_applications_lookup',
    supabase
      .from('job_applications')
      .select(
        'id, candidate_name, candidate_email, stage, submitted_at, cv_storage_path, loom_url, staffsavvy_score, offer_letter_status'
      )
      .eq('job_listing_id', id)
      .eq('org_id', orgId)
      .order('submitted_at', { ascending: false })
      .limit(300),
    500
  );

  if (appsErr) notFound();

  const view = (
    <JobPipelineClient
      jobListingId={id}
      jobTitle={(job.title as string)?.trim() || 'Job'}
      initialApplications={(apps ?? []) as PipelineApplicationRow[]}
      canMoveStage={canMoveStage}
      canBookInterviewSlot={canBookInterviewSlot}
      canManageInterviews={canManageInterviews}
      canAddInternalNotes={canAddInternalNotes}
      canNotifyCandidate={canNotifyCandidate}
      canManageOffers={canGenerateOffers || canSendEsignOffers}
    />
  );
  warnIfSlowServerPath('/admin/jobs/[id]/applications', pathStartedAtMs);
  return view;
}
