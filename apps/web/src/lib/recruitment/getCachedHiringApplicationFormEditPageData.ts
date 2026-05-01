import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

type ApplicationFormItemRow = {
  options: unknown;
  question_type: string | null;
  prompt: string | null;
  help_text: string | null;
  required: boolean | null;
  is_page_break: boolean | null;
  scoring_enabled: boolean | null;
  scoring_scale_max?: number | null;
  initially_hidden: boolean | null;
  locked: boolean | null;
  max_length: number | null;
};

type ApplicationFormSetRow = {
  id: string;
  name: string | null;
  job_title: string | null;
  grade_level: string | null;
  department_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type JobRow = {
  title: string | null;
  grade_level: string | null;
};

export type HiringApplicationFormEditPageData = {
  setRow: ApplicationFormSetRow;
  rows: ApplicationFormItemRow[];
  departments: DepartmentRow[];
  jobRows: JobRow[];
} | null;

const HIRING_APPLICATION_FORM_EDIT_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HIRING_APPLICATION_FORM_EDIT_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const hiringApplicationFormEditPageResponseCache = new Map<
  string,
  TtlCacheEntry<HiringApplicationFormEditPageData>
>();
const hiringApplicationFormEditPageInFlight = new Map<
  string,
  Promise<HiringApplicationFormEditPageData>
>();
registerSharedCacheStore(
  'campsite:hiring:application-forms:edit',
  hiringApplicationFormEditPageResponseCache,
  hiringApplicationFormEditPageInFlight
);

function getHiringApplicationFormEditPageCacheKey(orgId: string, formId: string): string {
  return `org:${orgId}:form:${formId}`;
}

export const getCachedHiringApplicationFormEditPageData = cache(
  async (orgId: string, formId: string): Promise<HiringApplicationFormEditPageData> => {
    return getOrLoadSharedCachedValue({
      cache: hiringApplicationFormEditPageResponseCache,
      inFlight: hiringApplicationFormEditPageInFlight,
      key: getHiringApplicationFormEditPageCacheKey(orgId, formId),
      cacheNamespace: 'campsite:hiring:application-forms:edit',
      ttlMs: HIRING_APPLICATION_FORM_EDIT_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [setRowResult, rowsResultWithScale, departmentsResult, jobRowsResult] = await Promise.all([
          supabase
            .from('org_application_question_sets')
            .select('id, name, job_title, grade_level, department_id')
            .eq('id', formId)
            .eq('org_id', orgId)
            .maybeSingle(),
          supabase
            .from('org_application_question_set_items')
            .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, scoring_scale_max, initially_hidden, locked')
            .eq('set_id', formId)
            .order('sort_order', { ascending: true }),
          supabase.from('departments').select('id, name').eq('org_id', orgId).order('name', { ascending: true }),
          supabase
            .from('job_listings')
            .select('title, grade_level')
            .eq('org_id', orgId)
            .order('updated_at', { ascending: false })
            .limit(200),
        ]);

        const setRow = setRowResult.data as ApplicationFormSetRow | null;
        if (!setRow?.id) return null;

        const needsRowsFallback = (() => {
          const msg = String(rowsResultWithScale.error?.message ?? '').toLowerCase();
          return msg.includes('scoring_scale_max') && msg.includes('org_application_question_set_items');
        })();

        const rowsResult = needsRowsFallback
          ? await supabase
              .from('org_application_question_set_items')
              .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, initially_hidden, locked')
              .eq('set_id', formId)
              .order('sort_order', { ascending: true })
          : rowsResultWithScale;

        return {
          setRow,
          rows: (rowsResult.data ?? []) as ApplicationFormItemRow[],
          departments: (departmentsResult.data ?? []) as DepartmentRow[],
          jobRows: (jobRowsResult.data ?? []) as JobRow[],
        };
      },
    });
  }
);
