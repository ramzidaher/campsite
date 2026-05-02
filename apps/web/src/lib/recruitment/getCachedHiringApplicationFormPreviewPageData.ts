import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

type QuestionRow = {
  id: string;
  question_type: string | null;
  prompt: string | null;
  help_text: string | null;
  required: boolean | null;
  options: unknown;
  max_length: number | null;
};

export type HiringApplicationFormPreviewQuestion = {
  id: string;
  question_type: string | null;
  prompt: string | null;
  help_text: string | null;
  required: boolean | null;
  options: unknown;
  max_length: number | null;
};

export type HiringApplicationFormPreviewPageData = {
  formName: string;
  questions: HiringApplicationFormPreviewQuestion[];
} | null;

const HIRING_APPLICATION_FORM_PREVIEW_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HIRING_APPLICATION_FORM_PREVIEW_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const hiringApplicationFormPreviewPageResponseCache = new Map<
  string,
  TtlCacheEntry<HiringApplicationFormPreviewPageData>
>();
const hiringApplicationFormPreviewPageInFlight = new Map<string, Promise<HiringApplicationFormPreviewPageData>>();
registerSharedCacheStore(
  'campsite:hiring:application-forms:preview',
  hiringApplicationFormPreviewPageResponseCache,
  hiringApplicationFormPreviewPageInFlight
);

function getHiringApplicationFormPreviewPageCacheKey(orgId: string, formId: string): string {
  return `org:${orgId}:form:${formId}`;
}

export const getCachedHiringApplicationFormPreviewPageData = cache(
  async (orgId: string, formId: string): Promise<HiringApplicationFormPreviewPageData> => {
    return getOrLoadSharedCachedValue({
      cache: hiringApplicationFormPreviewPageResponseCache,
      inFlight: hiringApplicationFormPreviewPageInFlight,
      key: getHiringApplicationFormPreviewPageCacheKey(orgId, formId),
      cacheNamespace: 'campsite:hiring:application-forms:preview',
      ttlMs: HIRING_APPLICATION_FORM_PREVIEW_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: setRow }, { data: rows }] = await Promise.all([
          supabase.from('org_application_question_sets').select('id, name').eq('id', formId).eq('org_id', orgId).maybeSingle(),
          supabase
            .from('org_application_question_set_items')
            .select('id, question_type, prompt, help_text, required, options, max_length, sort_order')
            .eq('set_id', formId)
            .order('sort_order', { ascending: true }),
        ]);
        if (!setRow?.id) return null;

        const questions = ((rows ?? []) as QuestionRow[])
          .filter((row) => String(row.prompt ?? '').trim().length > 0)
          .map((row) => ({
            id: row.id,
            question_type: row.question_type,
            prompt: row.prompt,
            help_text: row.help_text,
            required: row.required,
            options: row.options,
            max_length: row.max_length,
          }));

        return {
          formName: String(setRow.name ?? '').trim() || 'Application form',
          questions,
        };
      },
    });
  }
);
