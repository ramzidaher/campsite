import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type EmployeeOnboardingPageData = {
  run: {
    id: string;
    status: string;
    employment_start_date: string;
    created_at: string;
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
  }>;
};

const EMPLOYEE_ONBOARDING_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_EMPLOYEE_ONBOARDING_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const employeeOnboardingPageResponseCache = new Map<string, TtlCacheEntry<EmployeeOnboardingPageData>>();
const employeeOnboardingPageInFlight = new Map<string, Promise<EmployeeOnboardingPageData>>();
registerSharedCacheStore(
  'campsite:onboarding:employee',
  employeeOnboardingPageResponseCache,
  employeeOnboardingPageInFlight
);

function getEmployeeOnboardingPageCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedEmployeeOnboardingPageData = cache(
  async (orgId: string, userId: string): Promise<EmployeeOnboardingPageData> => {
    return getOrLoadSharedCachedValue({
      cache: employeeOnboardingPageResponseCache,
      inFlight: employeeOnboardingPageInFlight,
      key: getEmployeeOnboardingPageCacheKey(orgId, userId),
      cacheNamespace: 'campsite:onboarding:employee',
      ttlMs: EMPLOYEE_ONBOARDING_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: run } = await supabase
          .from('onboarding_runs')
          .select('id, status, employment_start_date, created_at')
          .eq('org_id', orgId)
          .eq('user_id', userId)
          .in('status', ['active', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!run) {
          return { run: null, tasks: [] };
        }

        const { data: tasks } = await supabase
          .from('onboarding_run_tasks')
          .select('id, title, description, assignee_type, category, due_date, sort_order, status, completed_at')
          .eq('run_id', String(run.id))
          .eq('org_id', orgId)
          .order('sort_order');

        return {
          run: {
            id: String(run.id),
            status: String(run.status),
            employment_start_date: String(run.employment_start_date),
            created_at: String(run.created_at),
          },
          tasks: (tasks ?? []).map((task) => ({
            id: String(task.id),
            title: String(task.title),
            description: (task.description as string | null) ?? null,
            assignee_type: String(task.assignee_type),
            category: String(task.category),
            due_date: (task.due_date as string | null) ?? null,
            sort_order: Number(task.sort_order ?? 0),
            status: String(task.status),
            completed_at: (task.completed_at as string | null) ?? null,
          })),
        };
      },
    });
  }
);
