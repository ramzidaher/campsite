import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type JobAdminLegalPageData = {
  job: {
    id: string;
    title: string;
    success_email_body: string | null;
    rejection_email_body: string | null;
    interview_invite_email_body: string | null;
    offer_template_id: string | null;
    contract_template_id: string | null;
  } | null;
  offerTemplateOptions: Array<{ id: string; name: string | null }>;
  contractTemplateOptions: Array<{ id: string; name: string | null }>;
};

const JOB_ADMIN_LEGAL_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_JOB_ADMIN_LEGAL_PAGE_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);
const jobAdminLegalPageResponseCache = new Map<string, TtlCacheEntry<JobAdminLegalPageData>>();
const jobAdminLegalPageInFlight = new Map<string, Promise<JobAdminLegalPageData>>();
registerSharedCacheStore(
  'campsite:jobs:admin-legal',
  jobAdminLegalPageResponseCache,
  jobAdminLegalPageInFlight
);

function getJobAdminLegalPageCacheKey(orgId: string, jobId: string): string {
  return `org:${orgId}:job:${jobId}`;
}

export const getCachedJobAdminLegalPageData = cache(
  async (orgId: string, jobId: string): Promise<JobAdminLegalPageData> => {
    return getOrLoadSharedCachedValue({
      cache: jobAdminLegalPageResponseCache,
      inFlight: jobAdminLegalPageInFlight,
      key: getJobAdminLegalPageCacheKey(orgId, jobId),
      cacheNamespace: 'campsite:jobs:admin-legal',
      ttlMs: JOB_ADMIN_LEGAL_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [jobResult, offerTemplatesResult, contractTemplatesResult] = await Promise.all([
          supabase
            .from('job_listings')
            .select(
              'id, title, success_email_body, rejection_email_body, interview_invite_email_body, offer_template_id, contract_template_id'
            )
            .eq('id', jobId)
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
              .eq('id', jobId)
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
            } as JobAdminLegalPageData['job'])
          : null;

        return {
          job,
          offerTemplateOptions: (offerTemplatesResult.data ?? []) as Array<{ id: string; name: string | null }>,
          contractTemplateOptions: (contractTemplatesResult.data ?? []) as Array<{
            id: string;
            name: string | null;
          }>,
        };
      },
    });
  }
);
