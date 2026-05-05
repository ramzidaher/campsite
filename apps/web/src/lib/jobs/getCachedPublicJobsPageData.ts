import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { advertClosingDateToApplicationsCloseAtIso } from '@/lib/datetime/advertClosingDateToApplicationsCloseAtIso';
import { createClient } from '@/lib/supabase/server';

type PublicJobListRow = {
  job_listing_id: string;
  slug: string;
  org_name: string;
  title: string;
  department_name: string;
  grade_level: string;
  salary_band: string;
  contract_type: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  published_at: string | null;
};

type PublicJobTimelineRow = {
  id: string;
  recruitment_request_id: string | null;
  applications_close_at: string | null;
  start_date_needed: string | null;
  shortlisting_dates: unknown;
  interview_dates: unknown;
};

type RecruitmentTimelineRow = {
  id: string;
  advert_closing_date: string | null;
  shortlisting_dates: unknown;
  interview_schedule: unknown;
  start_date_needed: string | null;
};

function parseDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function parseInterviewDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (typeof row === 'string') return row.trim();
      const rec = row as { date?: unknown; interviewDate?: unknown; interview_date?: unknown } | null;
      return String(rec?.date ?? rec?.interviewDate ?? rec?.interview_date ?? '').trim();
    })
    .filter(Boolean);
}

export type PublicJobsPageData = {
  liveCount: number;
  deptCount: number;
  rows: PublicJobListRow[];
  hasNext: boolean;
  orgLookup: {
    name: string | null;
    logo_url: string | null;
    brand_preset_key: string | null;
    brand_tokens: unknown;
    brand_policy: unknown;
  } | null;
  timelineByJobId: Record<string, PublicJobTimelineRow>;
};

const PUBLIC_JOBS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PUBLIC_JOBS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const publicJobsPageResponseCache = new Map<string, TtlCacheEntry<PublicJobsPageData>>();
const publicJobsPageInFlight = new Map<string, Promise<PublicJobsPageData>>();
registerSharedCacheStore('campsite:public:jobs:list', publicJobsPageResponseCache, publicJobsPageInFlight);

function getPublicJobsPageCacheKey(
  orgSlug: string,
  search: string,
  department: string,
  contract: string,
  limit: number,
  offset: number
): string {
  return `org:${orgSlug}:q:${search || '-'}:dept:${department || '-'}:contract:${contract || '-'}:limit:${limit}:offset:${offset}`;
}

export const getCachedPublicJobsPageData = cache(
  async (
    orgSlug: string,
    search: string,
    department: string,
    contract: string,
    limit: number,
    offset: number
  ): Promise<PublicJobsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: publicJobsPageResponseCache,
      inFlight: publicJobsPageInFlight,
      key: getPublicJobsPageCacheKey(orgSlug, search, department, contract, limit, offset),
      cacheNamespace: 'campsite:public:jobs:list',
      ttlMs: PUBLIC_JOBS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: summaryRows }, { data, error }, { data: orgLookup }] = await Promise.all([
          supabase.rpc('public_job_listings_org_summary', { p_org_slug: orgSlug }),
          supabase.rpc('public_job_listings', {
            p_org_slug: orgSlug,
            p_search: search || null,
            p_department: department || null,
            p_contract_type: contract || null,
            p_limit: limit + 1,
            p_offset: offset,
          }),
          supabase
            .from('organisations')
            .select('name, logo_url, brand_preset_key, brand_tokens, brand_policy, timezone')
            .eq('slug', orgSlug)
            .maybeSingle(),
        ]);
        if (error) {
          return {
            liveCount: 0,
            deptCount: 0,
            rows: [],
            hasNext: false,
            orgLookup: null,
            timelineByJobId: {},
          };
        }

        const summary = summaryRows?.[0] as { live_job_count?: number; department_count?: number } | undefined;
        const liveCount = Number(summary?.live_job_count ?? 0);
        const deptCount = Number(summary?.department_count ?? 0);
        const fullRows = ((data as PublicJobListRow[] | null) ?? []);
        const rows = fullRows.slice(0, limit);
        const hasNext = fullRows.length > limit;
        const listingIds = rows.map((row) => row.job_listing_id);
        const orgTimeZone =
          String((orgLookup as { timezone?: string | null } | null)?.timezone ?? '').trim() || null;

        const timelineMap = new Map<string, PublicJobTimelineRow>();
        if (listingIds.length > 0) {
          const timelineWithNewCols = await supabase
            .from('job_listings')
            .select(
              'id, recruitment_request_id, applications_close_at, start_date_needed, shortlisting_dates, interview_dates'
            )
            .in('id', listingIds);
          const fallbackTimelineRows = timelineWithNewCols.error
            ? await supabase.from('job_listings').select('id, recruitment_request_id').in('id', listingIds)
            : null;
          const timelineRows = (fallbackTimelineRows?.data ?? timelineWithNewCols.data ?? []) as Array<
            Record<string, unknown>
          >;

          const requestIds = Array.from(
            new Set(
              timelineRows
                .map((row) => String(row.recruitment_request_id ?? '').trim())
                .filter(Boolean)
            )
          );
          const requestMap = new Map<string, RecruitmentTimelineRow>();
          if (requestIds.length > 0) {
            const { data: reqRows } = await supabase
              .from('recruitment_requests')
              .select('id, advert_closing_date, shortlisting_dates, interview_schedule, start_date_needed')
              .in('id', requestIds);
            for (const req of (reqRows ?? []) as RecruitmentTimelineRow[]) {
              requestMap.set(String(req.id), req);
            }
          }

          for (const row of timelineRows) {
            const reqId = String(row.recruitment_request_id ?? '').trim();
            const req = reqId ? requestMap.get(reqId) : undefined;
            const jobShortlisting = parseDateList(row.shortlisting_dates);
            const jobInterviewDates = parseDateList(row.interview_dates);
            timelineMap.set(String(row.id), {
              id: String(row.id ?? ''),
              recruitment_request_id: reqId || null,
              applications_close_at:
                String(row.applications_close_at ?? '').trim() ||
                advertClosingDateToApplicationsCloseAtIso(req?.advert_closing_date ?? null, orgTimeZone),
              start_date_needed:
                String(row.start_date_needed ?? '').trim() || String(req?.start_date_needed ?? '').trim() || null,
              shortlisting_dates: jobShortlisting.length > 0 ? jobShortlisting : (req?.shortlisting_dates ?? []),
              interview_dates:
                jobInterviewDates.length > 0 ? jobInterviewDates : parseInterviewDateList(req?.interview_schedule),
            });
          }
        }

        return {
          liveCount,
          deptCount,
          rows,
          hasNext,
          orgLookup: orgLookup
            ? {
                name: (orgLookup.name as string | null) ?? null,
                logo_url: (orgLookup.logo_url as string | null) ?? null,
                brand_preset_key: (orgLookup.brand_preset_key as string | null) ?? null,
                brand_tokens: orgLookup.brand_tokens ?? null,
                brand_policy: orgLookup.brand_policy ?? null,
              }
            : null,
          timelineByJobId: Object.fromEntries(timelineMap.entries()),
        };
      },
    });
  }
);
