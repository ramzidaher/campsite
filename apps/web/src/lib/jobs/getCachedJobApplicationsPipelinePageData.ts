import { cache } from 'react';

import type { PipelineApplicationRow } from '@/app/(main)/admin/jobs/[id]/applications/JobPipelineClient';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type JobApplicationsPipelinePageData = {
  job: (Record<string, unknown> & { offer_template_id: string | null }) | null;
  applications: PipelineApplicationRow[];
  panelProfiles: { id: string; full_name: string | null; email: string | null }[];
  requestedInterviewSchedule: Array<Record<string, unknown>>;
};

const JOB_APPLICATIONS_PIPELINE_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_JOB_APPLICATIONS_PIPELINE_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const jobApplicationsPipelinePageResponseCache = new Map<string, TtlCacheEntry<JobApplicationsPipelinePageData>>();
const jobApplicationsPipelinePageInFlight = new Map<string, Promise<JobApplicationsPipelinePageData>>();
registerSharedCacheStore(
  'campsite:jobs:detail:applications',
  jobApplicationsPipelinePageResponseCache,
  jobApplicationsPipelinePageInFlight
);

function getJobApplicationsPipelinePageCacheKey(orgId: string, jobId: string): string {
  return `org:${orgId}:job:${jobId}`;
}

export const getCachedJobApplicationsPipelinePageData = cache(
  async (orgId: string, jobId: string): Promise<JobApplicationsPipelinePageData> => {
    return getOrLoadSharedCachedValue({
      cache: jobApplicationsPipelinePageResponseCache,
      inFlight: jobApplicationsPipelinePageInFlight,
      key: getJobApplicationsPipelinePageCacheKey(orgId, jobId),
      cacheNamespace: 'campsite:jobs:detail:applications',
      ttlMs: JOB_APPLICATIONS_PIPELINE_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: jobWithNewCols, error: jobErrWithNewCols } = await supabase
          .from('job_listings')
          .select(
            `
            id,
            title,
            status,
            offer_template_id,
            recruitment_request_id,
            recruitment_requests (
              interview_schedule
            )
          `
          )
          .eq('id', jobId)
          .eq('org_id', orgId)
          .maybeSingle();

        const fallbackJobResult = jobErrWithNewCols
          ? await supabase
              .from('job_listings')
              .select(
                `
                id,
                title,
                status,
                recruitment_request_id,
                recruitment_requests (
                  interview_schedule
                )
              `
              )
              .eq('id', jobId)
              .eq('org_id', orgId)
              .maybeSingle()
          : null;

        const jobRaw = fallbackJobResult?.data ?? jobWithNewCols;
        const job = jobRaw
          ? ({
              ...jobRaw,
              offer_template_id: (jobRaw as { offer_template_id?: string | null }).offer_template_id ?? null,
            } as Record<string, unknown> & { offer_template_id: string | null })
          : null;

        if (!job) {
          return {
            job: null,
            applications: [],
            panelProfiles: [],
            requestedInterviewSchedule: [],
          };
        }

        const [{ data: apps, error: appsErr }, { data: aggRows }, { data: profiles }] = await Promise.all([
          supabase
            .from('job_applications')
            .select(
              'id, candidate_name, candidate_email, stage, submitted_at, cv_storage_path, loom_url, staffsavvy_score, offer_letter_status'
            )
            .eq('job_listing_id', jobId)
            .eq('org_id', orgId)
            .order('submitted_at', { ascending: false })
            .limit(300),
          supabase.rpc('get_job_listing_screening_aggregates', { p_job_listing_id: jobId }),
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('org_id', orgId)
            .eq('status', 'active')
            .order('full_name', { ascending: true }),
        ]);

        if (appsErr) {
          throw new Error(appsErr.message);
        }

        const aggMap = new Map<string, { overall_avg: number | null; distinct_scorer_count: number }>();
        if (Array.isArray(aggRows)) {
          for (const r of aggRows) {
            const row = r as {
              job_application_id: string;
              overall_avg: number | string | null;
              distinct_scorer_count: number | string | null;
            };
            aggMap.set(String(row.job_application_id), {
              overall_avg: row.overall_avg == null || row.overall_avg === '' ? null : Number(row.overall_avg),
              distinct_scorer_count: Number(row.distinct_scorer_count ?? 0),
            });
          }
        }

        const applications: PipelineApplicationRow[] = (apps ?? []).map((app) => {
          const row = app as Record<string, unknown>;
          const appId = String(row.id);
          const agg = aggMap.get(appId);
          return {
            id: appId,
            candidate_name: String(row.candidate_name ?? ''),
            candidate_email: String(row.candidate_email ?? ''),
            stage: String(row.stage ?? ''),
            submitted_at: String(row.submitted_at ?? ''),
            cv_storage_path: (row.cv_storage_path as string | null) ?? null,
            loom_url: (row.loom_url as string | null) ?? null,
            staffsavvy_score: (row.staffsavvy_score as number | null) ?? null,
            offer_letter_status: (row.offer_letter_status as string | null) ?? null,
            screening_overall_avg: agg?.overall_avg ?? null,
            screening_scorer_count: agg?.distinct_scorer_count ?? 0,
          };
        });

        const recruitmentRel = (job as Record<string, unknown>).recruitment_requests;
        const recruitment = Array.isArray(recruitmentRel)
          ? (recruitmentRel[0] as { interview_schedule?: unknown } | undefined)
          : (recruitmentRel as { interview_schedule?: unknown } | null);
        const requestedInterviewSchedule = Array.isArray(recruitment?.interview_schedule)
          ? (recruitment.interview_schedule as Array<Record<string, unknown>>)
          : [];

        return {
          job,
          applications,
          panelProfiles: (profiles ?? []) as { id: string; full_name: string | null; email: string | null }[],
          requestedInterviewSchedule,
        };
      },
    });
  }
);
