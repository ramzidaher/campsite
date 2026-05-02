import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

type FormRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  updated_at: string | null;
  job_title: string | null;
  grade_level: string | null;
  department_id: string | null;
  departments: { name: string } | { name: string }[] | null;
};

type JobRow = {
  id: string;
  title: string | null;
  grade_level: string | null;
  status: string | null;
  application_question_set_id: string | null;
  departments: { name: string } | { name: string }[] | null;
};

export type HiringApplicationFormsTableRow = {
  id: string;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  formJobTitle: string | null;
  formGrade: string | null;
  formDepartment: string | null;
  questionCount: number;
  linkedJobs: Array<{
    id: string;
    title: string;
    grade: string | null;
    status: string | null;
    department: string | null;
  }>;
};

export type HiringApplicationFormsPageData = {
  rows: HiringApplicationFormsTableRow[];
};

const HIRING_APPLICATION_FORMS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HIRING_APPLICATION_FORMS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const hiringApplicationFormsPageResponseCache = new Map<string, TtlCacheEntry<HiringApplicationFormsPageData>>();
const hiringApplicationFormsPageInFlight = new Map<string, Promise<HiringApplicationFormsPageData>>();
registerSharedCacheStore(
  'campsite:hiring:application-forms:page',
  hiringApplicationFormsPageResponseCache,
  hiringApplicationFormsPageInFlight
);

function getHiringApplicationFormsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedHiringApplicationFormsPageData = cache(
  async (orgId: string): Promise<HiringApplicationFormsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: hiringApplicationFormsPageResponseCache,
      inFlight: hiringApplicationFormsPageInFlight,
      key: getHiringApplicationFormsPageCacheKey(orgId),
      cacheNamespace: 'campsite:hiring:application-forms:page',
      ttlMs: HIRING_APPLICATION_FORMS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: forms }, { data: jobs }, { data: items }] = await Promise.all([
          supabase
            .from('org_application_question_sets')
            .select('id, name, created_at, updated_at, job_title, grade_level, department_id, departments(name)')
            .eq('org_id', orgId)
            .order('updated_at', { ascending: false }),
          supabase
            .from('job_listings')
            .select('id, title, grade_level, status, application_question_set_id, departments(name)')
            .eq('org_id', orgId),
          supabase.from('org_application_question_set_items').select('set_id').eq('org_id', orgId),
        ]);

        const questionCountBySet = new Map<string, number>();
        for (const row of items ?? []) {
          const setId = String((row as { set_id?: string | null }).set_id ?? '');
          if (!setId) continue;
          questionCountBySet.set(setId, (questionCountBySet.get(setId) ?? 0) + 1);
        }

        const linkedJobsBySet = new Map<string, JobRow[]>();
        for (const job of (jobs ?? []) as JobRow[]) {
          const setId = String(job.application_question_set_id ?? '').trim();
          if (!setId) continue;
          const arr = linkedJobsBySet.get(setId) ?? [];
          arr.push(job);
          linkedJobsBySet.set(setId, arr);
        }

        const rows = ((forms ?? []) as FormRow[]).map((form) => {
          const linkedJobs = linkedJobsBySet.get(form.id) ?? [];
          const jobsWithDepartment = linkedJobs.map((job) => ({
            id: job.id,
            title: String(job.title ?? '').trim(),
            grade: String(job.grade_level ?? '').trim() || null,
            status: job.status,
            department: (Array.isArray(job.departments) ? job.departments[0]?.name : job.departments?.name) ?? null,
          }));
          return {
            id: form.id,
            name: form.name,
            createdAt: form.created_at,
            updatedAt: form.updated_at,
            formJobTitle: String(form.job_title ?? '').trim() || null,
            formGrade: String(form.grade_level ?? '').trim() || null,
            formDepartment: (Array.isArray(form.departments) ? form.departments[0]?.name : form.departments?.name) ?? null,
            questionCount: questionCountBySet.get(form.id) ?? 0,
            linkedJobs: jobsWithDepartment,
          } satisfies HiringApplicationFormsTableRow;
        });

        return { rows };
      },
    });
  }
);
