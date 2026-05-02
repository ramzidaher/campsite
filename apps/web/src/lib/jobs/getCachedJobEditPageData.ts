import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type JobEditPageData = {
  orgSlug: string;
  job: Record<string, unknown> | null;
  applicationFormOptions: { id: string; name: string | null }[];
  eqCategoryOptions: { code: string; label: string }[];
  publicMetrics: { impressions: number; applyStarts: number; applySubmits: number } | null;
};

const JOB_EDIT_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_JOB_EDIT_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const jobEditPageResponseCache = new Map<string, TtlCacheEntry<JobEditPageData>>();
const jobEditPageInFlight = new Map<string, Promise<JobEditPageData>>();
registerSharedCacheStore('campsite:jobs:detail:edit', jobEditPageResponseCache, jobEditPageInFlight);

function getJobEditPageCacheKey(orgId: string, jobId: string, includeHrSettings: boolean): string {
  return `org:${orgId}:job:${jobId}:hr:${includeHrSettings ? '1' : '0'}`;
}

export const getCachedJobEditPageData = cache(
  async (orgId: string, jobId: string, includeHrSettings: boolean): Promise<JobEditPageData> => {
    return getOrLoadSharedCachedValue({
      cache: jobEditPageResponseCache,
      inFlight: jobEditPageInFlight,
      key: getJobEditPageCacheKey(orgId, jobId, includeHrSettings),
      cacheNamespace: 'campsite:jobs:detail:edit',
      ttlMs: JOB_EDIT_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [orgRowResult, jobResultWithExtendedCols, formSetsResult] = await Promise.all([
          supabase.from('organisations').select('slug').eq('id', orgId).single(),
          supabase
            .from('job_listings')
            .select(
              'id, title, slug, status, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, application_mode, allow_cv, allow_loom, allow_staffsavvy, allow_application_questions, recruitment_request_id, diversity_target_pct, diversity_included_codes, applications_close_at, application_question_set_id, hide_posted_date, scheduled_publish_at, shortlisting_dates, interview_dates, start_date_needed, role_profile_link'
            )
            .eq('id', jobId)
            .eq('org_id', orgId)
            .maybeSingle(),
          supabase
            .from('org_application_question_sets')
            .select('id, name')
            .eq('org_id', orgId)
            .order('name', { ascending: true }),
        ]);

        const fallbackJobResult = jobResultWithExtendedCols.error
          ? await supabase
              .from('job_listings')
              .select(
                'id, title, slug, status, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, application_mode, allow_cv, allow_loom, allow_staffsavvy, allow_application_questions, recruitment_request_id, diversity_target_pct, diversity_included_codes, applications_close_at, application_question_set_id'
              )
              .eq('id', jobId)
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
            } as Record<string, unknown>)
          : null;

        let eqCategoryOptions: { code: string; label: string }[] = [];
        if (includeHrSettings) {
          const { data: settingsJson } = await supabase.rpc('org_hr_metric_settings_get');
          const row = settingsJson as { eq_category_codes?: unknown } | null;
          const raw = row?.eq_category_codes;
          if (Array.isArray(raw)) {
            eqCategoryOptions = raw
              .map((entry) => ({
                code: String((entry as { code?: string }).code ?? '').trim(),
                label: String((entry as { label?: string }).label ?? '').trim(),
              }))
              .filter((entry) => entry.code && entry.label);
          }
        }

        let publicMetrics: { impressions: number; applyStarts: number; applySubmits: number } | null = null;
        if ((job?.status as string | undefined) === 'live') {
          const { data: metricRows } = await supabase.rpc('get_job_listing_public_metrics_summary', {
            p_job_listing_id: jobId,
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

        return {
          orgSlug: (orgRowResult.data?.slug as string | undefined)?.trim() ?? '',
          job,
          applicationFormOptions: (formSetsResult.data ?? []) as { id: string; name: string | null }[],
          eqCategoryOptions,
          publicMetrics,
        };
      },
    });
  }
);
