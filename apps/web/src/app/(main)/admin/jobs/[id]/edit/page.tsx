import type { JobScreeningQuestionPersist } from '@/app/(main)/admin/jobs/actions';
import { AdminJobEditClient } from '@/components/admin/AdminJobEditClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import type { ScreeningQuestionOption } from '@campsite/types';
import { redirect, notFound } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

function mapScreeningRow(r: Record<string, unknown>): JobScreeningQuestionPersist {
  const raw = r.options;
  let options: ScreeningQuestionOption[] | null = null;
  if (Array.isArray(raw)) {
    options = raw
      .map((o) => {
        const row = o as { id?: string; label?: string };
        return { id: String(row.id ?? '').trim(), label: String(row.label ?? '').trim() };
      })
      .filter((o) => o.id && o.label);
    if (options.length === 0) options = null;
  }
  return {
    id: String(r.id),
    sortOrder: Number(r.sort_order ?? 0),
    questionType: String(r.question_type),
    prompt: String(r.prompt ?? ''),
    helpText: String(r.help_text ?? ''),
    required: Boolean(r.required),
    maxLength: r.max_length == null ? null : Number(r.max_length),
    options,
  };
}

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

  const [{ data: orgRow }, { data: job, error }, { data: sqRows }, canHrSettings] = await Promise.all([
    supabase.from('organisations').select('slug').eq('id', orgId).single(),
    supabase
      .from('job_listings')
      .select(
        'id, title, slug, status, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, application_mode, allow_cv, allow_loom, allow_staffsavvy, allow_application_questions, recruitment_request_id, diversity_target_pct, diversity_included_codes, applications_close_at'
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('job_listing_screening_questions')
      .select('id, sort_order, question_type, prompt, help_text, required, options, max_length')
      .eq('job_listing_id', id)
      .order('sort_order', { ascending: true }),
    viewerHasPermission('hr.view_records'),
  ]);

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

  const initialScreeningQuestions = (sqRows ?? []).map((r) => mapScreeningRow(r as Record<string, unknown>));

  return (
    <AdminJobEditClient
      job={job as Parameters<typeof AdminJobEditClient>[0]['job']}
      orgSlug={orgSlug}
      requestHref={`/hr/hiring/requests/${reqId}`}
      publicMetrics={publicMetrics}
      eqCategoryOptions={eqCategoryOptions}
      initialScreeningQuestions={initialScreeningQuestions}
    />
  );
}
