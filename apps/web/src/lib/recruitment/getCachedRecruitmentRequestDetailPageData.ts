import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type RecruitmentRequestDetailRow = {
  id: string;
  job_title: string;
  grade_level: string;
  salary_band: string;
  reason_for_hire: string;
  start_date_needed: string;
  contract_type: string;
  ideal_candidate_profile: string;
  specific_requirements: string | null;
  business_case: string | null;
  headcount_type: string | null;
  cost_center: string | null;
  budget_approved: boolean | null;
  target_start_window: string | null;
  number_of_positions: number | null;
  regrade_status: string | null;
  approval_status: string | null;
  role_profile_link: string | null;
  advertisement_link: string | null;
  advert_release_date: string | null;
  advert_closing_date: string | null;
  shortlisting_dates: unknown;
  interview_schedule: unknown;
  eligibility: string | null;
  pay_rate: string | null;
  contract_length_detail: string | null;
  additional_advertising_channels: string | null;
  interview_panel_details: string | null;
  needs_advert_copy_help: boolean | null;
  status: string;
  urgency: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  department_id: string;
  departments: { name?: string } | { name?: string }[] | null;
  submitter: { full_name?: string } | { full_name?: string }[] | null;
};

export type RecruitmentRequestStatusEventRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
};

export type RecruitmentRequestLinkedJobRow = {
  id: string;
  status: string;
  slug: string;
};

export type RecruitmentRequestDetailPageData = {
  request: RecruitmentRequestDetailRow | null;
  events: RecruitmentRequestStatusEventRow[];
  jobListing: RecruitmentRequestLinkedJobRow | null;
  orgSlug: string;
};

const RECRUITMENT_REQUEST_DETAIL_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_RECRUITMENT_REQUEST_DETAIL_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const recruitmentRequestDetailResponseCache = new Map<string, TtlCacheEntry<RecruitmentRequestDetailPageData>>();
const recruitmentRequestDetailInFlight = new Map<string, Promise<RecruitmentRequestDetailPageData>>();
registerSharedCacheStore(
  'campsite:jobs:recruitment:detail',
  recruitmentRequestDetailResponseCache,
  recruitmentRequestDetailInFlight
);

function getRecruitmentRequestDetailCacheKey(orgId: string, requestId: string): string {
  return `org:${orgId}:request:${requestId}`;
}

export const getCachedRecruitmentRequestDetailPageData = cache(
  async (orgId: string, requestId: string): Promise<RecruitmentRequestDetailPageData> => {
    return getOrLoadSharedCachedValue({
      cache: recruitmentRequestDetailResponseCache,
      inFlight: recruitmentRequestDetailInFlight,
      key: getRecruitmentRequestDetailCacheKey(orgId, requestId),
      cacheNamespace: 'campsite:jobs:recruitment:detail',
      ttlMs: RECRUITMENT_REQUEST_DETAIL_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: request } = await supabase
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
          .eq('id', requestId)
          .eq('org_id', orgId)
          .maybeSingle();

        if (!request) {
          return {
            request: null,
            events: [],
            jobListing: null,
            orgSlug: '',
          };
        }

        const [{ data: evRows }, { data: orgRow }, { data: jobRows }] = await Promise.all([
          supabase
            .from('recruitment_request_status_events')
            .select(
              'id, from_status, to_status, note, created_at, actor:profiles!recruitment_request_status_events_changed_by_fkey(full_name)'
            )
            .eq('request_id', requestId)
            .eq('org_id', orgId)
            .order('created_at', { ascending: true }),
          supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
          supabase
            .from('job_listings')
            .select('id, status, slug, created_at')
            .eq('org_id', orgId)
            .eq('recruitment_request_id', requestId)
            .order('created_at', { ascending: false }),
        ]);

        const linkedJobs = (jobRows ?? []) as Array<{ id: string; status: string; slug: string }>;
        const jobListing =
          linkedJobs.find((row) => row.status === 'draft') ??
          linkedJobs.find((row) => row.status === 'live') ??
          null;

        return {
          request: request as RecruitmentRequestDetailRow,
          events: (evRows ?? []).map((row) => {
            const actorRaw = ((row as { actor?: unknown }).actor ?? null) as
              | { full_name?: string | null }
              | { full_name?: string | null }[]
              | null;
            const profiles = Array.isArray(actorRaw)
              ? actorRaw.map((entry) => ({
                  full_name: String(entry?.full_name ?? '').trim(),
                }))
              : actorRaw
              ? { full_name: String(actorRaw.full_name ?? '').trim() }
              : null;

            return {
              id: String((row as { id?: unknown }).id ?? ''),
              from_status: ((row as { from_status?: unknown }).from_status as string | null) ?? null,
              to_status: String((row as { to_status?: unknown }).to_status ?? ''),
              note: ((row as { note?: unknown }).note as string | null) ?? null,
              created_at: String((row as { created_at?: unknown }).created_at ?? ''),
              profiles,
            };
          }),
          jobListing,
          orgSlug: (orgRow?.slug as string | undefined)?.trim() ?? '',
        };
      },
    });
  }
);
