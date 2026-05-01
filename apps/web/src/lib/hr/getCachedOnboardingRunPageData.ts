import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';
import { getDisplayName } from '@/lib/names';

const ONBOARDING_RUN_PAGE_TIMEOUT_MS = 1200;
const ONBOARDING_RUN_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ONBOARDING_RUN_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);

export type OnboardingRunPageData = {
  run: {
    id: string;
    user_id: string;
    status: string;
    employment_start_date: string;
    created_at: string;
    template_id: string | null;
  } | null;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    assignee_type: string;
    category: string;
    due_date: string | null;
    sort_order: number;
    status: string;
    completed_at: string | null;
    completed_by: string | null;
  }>;
  employee: {
    id: string;
    full_name: string;
    preferred_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  completerNames: Record<string, string>;
  partialSections: string[];
};

const onboardingRunPageResponseCache = new Map<string, TtlCacheEntry<OnboardingRunPageData>>();
const onboardingRunPageInFlight = new Map<string, Promise<OnboardingRunPageData>>();
registerSharedCacheStore('campsite:hr:onboarding:run', onboardingRunPageResponseCache, onboardingRunPageInFlight);

function getOnboardingRunPageCacheKey(orgId: string, runId: string): string {
  return `org:${orgId}:run:${runId}`;
}

export const getCachedOnboardingRunPageData = cache(
  async (orgId: string, runId: string): Promise<OnboardingRunPageData> => {
    return getOrLoadSharedCachedValue({
      cache: onboardingRunPageResponseCache,
      inFlight: onboardingRunPageInFlight,
      key: getOnboardingRunPageCacheKey(orgId, runId),
      cacheNamespace: 'campsite:hr:onboarding:run',
      ttlMs: ONBOARDING_RUN_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const timeoutFallbackLabels = new Set<string>();
        const supabase = await createClient();

        const runRes = await supabase
          .from('onboarding_runs')
          .select('id, user_id, status, employment_start_date, created_at, template_id')
          .eq('org_id', orgId)
          .eq('id', runId)
          .maybeSingle();

        const run = runRes.data
          ? {
              id: String(runRes.data.id),
              user_id: String(runRes.data.user_id),
              status: String(runRes.data.status),
              employment_start_date: String(runRes.data.employment_start_date),
              created_at: String(runRes.data.created_at),
              template_id: runRes.data.template_id ? String(runRes.data.template_id) : null,
            }
          : null;

        if (!run) {
          return {
            run: null,
            tasks: [],
            employee: null,
            completerNames: {},
            partialSections: [],
          };
        }

        const [{ data: tasksData }, { data: employeeData }] = await Promise.all([
          supabase
            .from('onboarding_run_tasks')
            .select(
              'id, title, description, assignee_type, category, due_date, sort_order, status, completed_at, completed_by'
            )
            .eq('run_id', runId)
            .eq('org_id', orgId)
            .order('sort_order'),
          supabase
            .from('profiles')
            .select('id, full_name, preferred_name, email, avatar_url')
            .eq('id', run.user_id)
            .maybeSingle(),
        ]);

        const tasks = (tasksData ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          description: row.description ? String(row.description) : null,
          assignee_type: String(row.assignee_type),
          category: String(row.category),
          due_date: row.due_date ? String(row.due_date) : null,
          sort_order: Number(row.sort_order ?? 0),
          status: String(row.status),
          completed_at: row.completed_at ? String(row.completed_at) : null,
          completed_by: row.completed_by ? String(row.completed_by) : null,
        }));

        const employee = employeeData
          ? {
              id: String(employeeData.id),
              full_name: String(employeeData.full_name),
              preferred_name: employeeData.preferred_name ? String(employeeData.preferred_name) : null,
              email: employeeData.email ? String(employeeData.email) : null,
              avatar_url: employeeData.avatar_url ? String(employeeData.avatar_url) : null,
            }
          : null;

        const completerIds = [...new Set(tasks.map((task) => task.completed_by).filter(Boolean))] as string[];
        const completerNames: Record<string, string> = {};

        if (completerIds.length > 0) {
          const { data: completers } = await resolveWithTimeout(
            supabase.from('profiles').select('id, full_name, preferred_name').in('id', completerIds),
            ONBOARDING_RUN_PAGE_TIMEOUT_MS,
            { data: [], error: null },
            () => timeoutFallbackLabels.add('completer_names_lookup')
          );
          for (const completer of completers ?? []) {
            const id = String(completer.id ?? '').trim();
            if (!id) continue;
            completerNames[id] = getDisplayName(
              completer.full_name ? String(completer.full_name) : '',
              completer.preferred_name ? String(completer.preferred_name) : null
            );
          }
        }

        return {
          run,
          tasks,
          employee,
          completerNames,
          partialSections: [...timeoutFallbackLabels],
        };
      },
    });
  }
);
