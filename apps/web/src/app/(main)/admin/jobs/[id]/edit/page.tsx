import { AdminJobEditClient } from '@/components/admin/AdminJobEditClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminJobEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('jobs.edit'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [orgRowResult, jobResultWithExtendedCols, formSetsResult, canHrSettings] = await Promise.all([
    supabase.from('organisations').select('slug').eq('id', orgId).single(),
    supabase
      .from('job_listings')
      .select(
        'id, title, slug, status, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, application_mode, allow_cv, allow_loom, allow_staffsavvy, allow_application_questions, recruitment_request_id, diversity_target_pct, diversity_included_codes, applications_close_at, application_question_set_id, hide_posted_date, scheduled_publish_at, shortlisting_dates, interview_dates, start_date_needed, role_profile_link'
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('org_application_question_sets')
      .select('id, name')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
    viewerHasPermission('hr.view_records'),
  ]);
  const orgRow = orgRowResult.data;
  const formSets = formSetsResult.data;

  const fallbackJobResult = jobResultWithExtendedCols.error
    ? await supabase
        .from('job_listings')
        .select(
          'id, title, slug, status, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, application_mode, allow_cv, allow_loom, allow_staffsavvy, allow_application_questions, recruitment_request_id, diversity_target_pct, diversity_included_codes, applications_close_at, application_question_set_id'
        )
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
    : null;

  const jobRaw = fallbackJobResult?.data ?? jobResultWithExtendedCols.data;
  const job = jobRaw
    ? ({
        ...jobRaw,
        hide_posted_date: (jobRaw as { hide_posted_date?: boolean | null }).hide_posted_date ?? false,
        scheduled_publish_at: (jobRaw as { scheduled_publish_at?: string | null }).scheduled_publish_at ?? null,
        shortlisting_dates: (jobRaw as { shortlisting_dates?: unknown }).shortlisting_dates ?? [],
        interview_dates: (jobRaw as { interview_dates?: unknown }).interview_dates ?? [],
        start_date_needed: (jobRaw as { start_date_needed?: string | null }).start_date_needed ?? null,
        role_profile_link: (jobRaw as { role_profile_link?: string | null }).role_profile_link ?? null,
      } as Parameters<typeof AdminJobEditClient>[0]['job'])
    : null;
  const error = job ? null : fallbackJobResult?.error ?? jobResultWithExtendedCols.error;

  if (error || !job) notFound();

  let eqCategoryOptions: { code: string; label: string }[] = [];
  if (canHrSettings) {
    const { data: settingsJson } = await supabase.rpc('org_hr_metric_settings_get');
    const row = settingsJson as { eq_category_codes?: unknown } | null;
    const raw = row?.eq_category_codes;
    if (Array.isArray(raw)) {
      eqCategoryOptions = raw
        .map((e) => ({
          code: String((e as { code?: string }).code ?? '').trim(),
          label: String((e as { label?: string }).label ?? '').trim(),
        }))
        .filter((e) => e.code && e.label);
    }
  }

  const orgSlug = (orgRow?.slug as string | undefined)?.trim() ?? '';
  const reqId = job.recruitment_request_id as string;

  let publicMetrics: { impressions: number; applyStarts: number; applySubmits: number } | null = null;
  if ((job.status as string) === 'live') {
    const { data: metricRows } = await supabase.rpc('get_job_listing_public_metrics_summary', {
      p_job_listing_id: id,
    });
    const m = metricRows?.[0] as
      | {
          impression_count: number | string;
          apply_start_count: number | string;
          apply_submit_count: number | string;
        }
      | undefined;
    if (m) {
      publicMetrics = {
        impressions: Number(m.impression_count ?? 0),
        applyStarts: Number(m.apply_start_count ?? 0),
        applySubmits: Number(m.apply_submit_count ?? 0),
      };
    }
  }

  return (
    <AdminJobEditClient
      job={job}
      orgSlug={orgSlug}
      requestHref={`/hr/hiring/requests/${reqId}`}
      publicMetrics={publicMetrics}
      eqCategoryOptions={eqCategoryOptions}
      applicationFormOptions={(formSets ?? []) as { id: string; name: string | null }[]}
    />
  );
}
