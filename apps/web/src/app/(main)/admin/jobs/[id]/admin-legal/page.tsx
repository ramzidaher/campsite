import { AdminJobAdminLegalClient } from '@/components/admin/AdminJobAdminLegalClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminJobAdminLegalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .single();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('jobs.edit'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [jobResult, offerTemplatesResult, contractTemplatesResult] = await Promise.all([
    supabase
      .from('job_listings')
      .select(
        'id, title, success_email_body, rejection_email_body, interview_invite_email_body, offer_template_id, contract_template_id'
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('offer_letter_templates')
      .select('id, name')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('offer_letter_templates')
      .select('id, name')
      .eq('org_id', orgId)
      .ilike('name', '%contract%')
      .order('updated_at', { ascending: false }),
  ]);

  const fallbackJobResult = jobResult.error
    ? await supabase
        .from('job_listings')
        .select('id, title')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
    : null;

  const jobRaw = fallbackJobResult?.data ?? jobResult.data;
  const job = jobRaw
    ? ({
        ...jobRaw,
        success_email_body: (jobRaw as { success_email_body?: string | null }).success_email_body ?? null,
        rejection_email_body: (jobRaw as { rejection_email_body?: string | null }).rejection_email_body ?? null,
        interview_invite_email_body: (jobRaw as { interview_invite_email_body?: string | null })
          .interview_invite_email_body ?? null,
        offer_template_id: (jobRaw as { offer_template_id?: string | null }).offer_template_id ?? null,
        contract_template_id: (jobRaw as { contract_template_id?: string | null }).contract_template_id ?? null,
      } as {
        id: string;
        title: string;
        success_email_body: string | null;
        rejection_email_body: string | null;
        interview_invite_email_body: string | null;
        offer_template_id: string | null;
        contract_template_id: string | null;
      })
    : null;

  const error = job ? null : fallbackJobResult?.error ?? jobResult.error;
  if (error || !job) notFound();

  return (
    <AdminJobAdminLegalClient
      jobId={job.id}
      jobTitle={job.title}
      successEmailBodyInitial={String(job.success_email_body ?? '')}
      rejectionEmailBodyInitial={String(job.rejection_email_body ?? '')}
      interviewInviteEmailBodyInitial={String(job.interview_invite_email_body ?? '')}
      offerTemplateIdInitial={String(job.offer_template_id ?? '')}
      contractTemplateIdInitial={String(job.contract_template_id ?? '')}
      offerTemplateOptions={(offerTemplatesResult.data ?? []) as { id: string; name: string | null }[]}
      contractTemplateOptions={(contractTemplatesResult.data ?? []) as { id: string; name: string | null }[]}
    />
  );
}
