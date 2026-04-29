import { AdminRecruitmentDetailClient } from '@/components/admin/AdminRecruitmentDetailClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminRecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) redirect('/hr/hiring/requests');

  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewQueue = permissionKeys.some((key) =>
    ['recruitment.view', 'recruitment.manage', 'recruitment.approve_request'].includes(key)
  );
  if (!canViewQueue) redirect('/broadcasts');

  const supabase = await createClient();

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
      business_case,
      headcount_type,
      cost_center,
      budget_approved,
      target_start_window,
      number_of_positions,
      regrade_status,
      approval_status,
      role_profile_link,
      advertisement_link,
      advert_release_date,
      advert_closing_date,
      shortlisting_dates,
      interview_schedule,
      eligibility,
      pay_rate,
      contract_length_detail,
      additional_advertising_channels,
      interview_panel_details,
      needs_advert_copy_help,
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

  if (reqErr || !req) redirect('/hr/hiring/requests');

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
      .eq('org_id', orgId)
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
