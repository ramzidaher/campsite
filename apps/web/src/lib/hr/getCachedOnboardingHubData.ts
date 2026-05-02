import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type OnboardingHubSharedData = {
  templates: OnboardingTemplateRow[];
  members: OnboardingMemberRow[];
  readinessRows: OnboardingReadinessRow[];
};

export type OnboardingTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
};

export type OnboardingMemberRow = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
};

export type OnboardingReadinessRow = {
  job_application_id: string | null;
  contract_assigned: boolean;
  rtw_required: boolean;
  rtw_complete: boolean;
  payroll_bank_complete: boolean;
  payroll_tax_complete: boolean;
  policy_ack_complete: boolean;
  it_access_complete: boolean;
  start_confirmed_at: string | null;
};

export type OnboardingTemplateTaskRow = {
  id: string;
  template_id: string;
  title: string;
  category: string;
  assignee_type: string;
  due_offset_days: number;
  sort_order: number;
};

export type OnboardingRunRow = {
  id: string;
  user_id: string;
  status: string;
  employment_start_date: string;
  created_at: string;
  template_id: string | null;
};

const ONBOARDING_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ONBOARDING_RESPONSE_CACHE_TTL_MS ?? '60000',
  10
);
const onboardingSharedResponseCache = new Map<string, TtlCacheEntry<OnboardingHubSharedData>>();
const onboardingSharedInFlight = new Map<string, Promise<OnboardingHubSharedData>>();
const onboardingTemplateTasksResponseCache = new Map<string, TtlCacheEntry<OnboardingTemplateTaskRow[]>>();
const onboardingTemplateTasksInFlight = new Map<string, Promise<OnboardingTemplateTaskRow[]>>();
const onboardingRunsResponseCache = new Map<string, TtlCacheEntry<OnboardingRunRow[]>>();
const onboardingRunsInFlight = new Map<string, Promise<OnboardingRunRow[]>>();
registerSharedCacheStore('campsite:hr:onboarding', onboardingSharedResponseCache, onboardingSharedInFlight);
registerSharedCacheStore(
  'campsite:hr:onboarding:tasks',
  onboardingTemplateTasksResponseCache,
  onboardingTemplateTasksInFlight
);
registerSharedCacheStore('campsite:hr:onboarding:runs', onboardingRunsResponseCache, onboardingRunsInFlight);

function getOnboardingSharedCacheKey(orgId: string): string {
  return `org:${orgId}:shared`;
}

function getOnboardingTemplateTasksCacheKey(orgId: string, templateId: string): string {
  return `org:${orgId}:template:${templateId}`;
}

function getOnboardingRunsCacheKey(orgId: string, userId: string, onlyOwn: boolean): string {
  return `org:${orgId}:user:${userId}:self_only:${onlyOwn ? '1' : '0'}`;
}

export const getCachedOnboardingHubSharedData = cache(async (orgId: string): Promise<OnboardingHubSharedData> => {
  return getOrLoadSharedCachedValue({
    cache: onboardingSharedResponseCache,
    inFlight: onboardingSharedInFlight,
    key: getOnboardingSharedCacheKey(orgId),
    cacheNamespace: 'campsite:hr:onboarding',
    ttlMs: ONBOARDING_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const [templatesRes, membersRes, readinessRows] = await Promise.all([
        supabase
          .from('onboarding_templates')
          .select('id, name, description, is_default, is_archived, created_at')
          .eq('org_id', orgId)
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name, preferred_name, email')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('hiring_start_readiness')
          .select(
            'job_application_id, contract_assigned, rtw_required, rtw_complete, payroll_bank_complete, payroll_tax_complete, policy_ack_complete, it_access_complete, start_confirmed_at'
          )
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100)
          .then(({ data }) => (data ?? []) as OnboardingReadinessRow[]),
      ]);
      return {
        templates: (templatesRes.data ?? []) as OnboardingTemplateRow[],
        members: (membersRes.data ?? []) as OnboardingMemberRow[],
        readinessRows,
      };
    },
  });
});

export const getCachedOnboardingTemplateTasks = cache(
  async (orgId: string, templateId: string): Promise<OnboardingTemplateTaskRow[]> => {
  return getOrLoadSharedCachedValue({
    cache: onboardingTemplateTasksResponseCache,
    inFlight: onboardingTemplateTasksInFlight,
    key: getOnboardingTemplateTasksCacheKey(orgId, templateId),
    cacheNamespace: 'campsite:hr:onboarding:tasks',
    ttlMs: ONBOARDING_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from('onboarding_template_tasks')
        .select('id, template_id, title, category, assignee_type, due_offset_days, sort_order')
        .eq('org_id', orgId)
        .eq('template_id', templateId)
        .order('sort_order');
      return (data ?? []) as OnboardingTemplateTaskRow[];
    },
  });
}
);

export const getCachedOnboardingHubRuns = cache(
  async (orgId: string, userId: string, onlyOwnRuns: boolean): Promise<OnboardingRunRow[]> => {
    return getOrLoadSharedCachedValue({
      cache: onboardingRunsResponseCache,
      inFlight: onboardingRunsInFlight,
      key: getOnboardingRunsCacheKey(orgId, userId, onlyOwnRuns),
      cacheNamespace: 'campsite:hr:onboarding:runs',
      ttlMs: ONBOARDING_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        let runsQuery = supabase
          .from('onboarding_runs')
          .select('id, user_id, status, employment_start_date, created_at, template_id')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (onlyOwnRuns) {
          runsQuery = runsQuery.eq('user_id', userId);
        }
        const { data } = await runsQuery;
        return (data ?? []) as OnboardingRunRow[];
      },
    });
  }
);
