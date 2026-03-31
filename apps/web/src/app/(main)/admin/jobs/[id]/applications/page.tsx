import { JobPipelineClient } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import type { PipelineApplicationRow } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import { canAccessOrgAdminArea } from '@/lib/adminGates';
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
  if (!canAccessOrgAdminArea(profile.role)) redirect('/broadcasts');

  const orgId = profile.org_id as string;

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
    />
  );
}
