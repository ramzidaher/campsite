import { AdminJobEditClient } from '@/components/admin/AdminJobEditClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

export default async function AdminJobEditPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!(await viewerHasPermission('jobs.edit'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: orgRow }, { data: job, error }] = await Promise.all([
    supabase.from('organisations').select('slug').eq('id', orgId).single(),
    supabase
      .from('job_listings')
      .select(
        'id, title, slug, status, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, application_mode, allow_cv, allow_loom, allow_staffsavvy, recruitment_request_id'
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);

  if (error || !job) notFound();

  const orgSlug = (orgRow?.slug as string | undefined)?.trim() ?? '';
  const reqId = job.recruitment_request_id as string;

  return (
    <AdminJobEditClient
      job={job as Parameters<typeof AdminJobEditClient>[0]['job']}
      orgSlug={orgSlug}
      requestHref={`/hr/recruitment/${reqId}`}
    />
  );
}
