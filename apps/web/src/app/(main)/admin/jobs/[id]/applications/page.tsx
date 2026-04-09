import { JobPipelineClient } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import type { PipelineApplicationRow } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

export default async function JobApplicationsPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('applications.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const [
    canMoveStage,
    canBookInterviewSlot,
    canManageInterviews,
    canAddInternalNotes,
    canNotifyCandidate,
    canGenerateOffers,
    canSendEsignOffers,
  ] = await Promise.all([
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'applications.move_stage', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'interviews.book_slot', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'interviews.manage', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'applications.add_internal_notes', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'applications.notify_candidate', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'offers.generate', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'offers.send_esign', p_context: {} })
      .then(({ data }) => !!data),
  ]);

  const { data: job, error: jobErr } = await supabase
    .from('job_listings')
    .select('id, title, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (jobErr || !job) notFound();

  const { data: apps, error: appsErr } = await supabase
    .from('job_applications')
    .select(
      'id, candidate_name, candidate_email, stage, submitted_at, cv_storage_path, loom_url, staffsavvy_score, offer_letter_status'
    )
    .eq('job_listing_id', id)
    .eq('org_id', orgId)
    .order('submitted_at', { ascending: false });

  if (appsErr) notFound();

  return (
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
}
