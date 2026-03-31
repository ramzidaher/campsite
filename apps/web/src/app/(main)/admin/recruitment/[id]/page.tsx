import { AdminRecruitmentDetailClient } from '@/components/admin/AdminRecruitmentDetailClient';
import { canAccessOrgAdminArea } from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminRecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) redirect('/admin/recruitment');

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

  const { data: req, error: reqErr } = await supabase
    .from('recruitment_requests')
    .select(
      `
      id,
      job_title,
      grade_level,
      salary_band,
      reason_for_hire,
      start_date_needed,
      contract_type,
      ideal_candidate_profile,
      specific_requirements,
      status,
      urgency,
      archived_at,
      created_at,
      updated_at,
      created_by,
      department_id,
      departments(name),
      submitter:profiles!recruitment_requests_created_by_fkey(full_name)
    `
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (reqErr || !req) redirect('/admin/recruitment');

  const [{ data: evRows }, { data: orgRow }, { data: jobRows }] = await Promise.all([
    supabase
      .from('recruitment_request_status_events')
      .select(
        'id, from_status, to_status, note, created_at, actor:profiles!recruitment_request_status_events_changed_by_fkey(full_name)'
      )
      .eq('request_id', id)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
    supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
    supabase
      .from('job_listings')
      .select('id, status, slug, created_at')
      .eq('recruitment_request_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const jlist = jobRows ?? [];
  const jobListing =
    jlist.find((r) => (r.status as string) === 'draft') ??
    jlist.find((r) => (r.status as string) === 'live') ??
    null;

  const orgSlug = (orgRow?.slug as string | undefined)?.trim() ?? '';

  const events = (evRows ?? []).map((row) => ({
    id: row.id as string,
    from_status: row.from_status as string | null,
    to_status: row.to_status as string,
    note: row.note as string | null,
    created_at: row.created_at as string,
    profiles: row.actor as { full_name: string } | { full_name: string }[] | null,
  }));

  return (
    <AdminRecruitmentDetailClient
      request={req as Parameters<typeof AdminRecruitmentDetailClient>[0]['request']}
      events={events}
      jobListing={
        jobListing
          ? {
              id: jobListing.id as string,
              status: jobListing.status as string,
              slug: jobListing.slug as string,
            }
          : null
      }
      orgSlug={orgSlug}
    />
  );
}
