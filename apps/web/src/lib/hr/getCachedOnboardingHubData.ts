import { cache } from 'react';

import { getOrLoadTtlCachedValue, type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
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

const ONBOARDING_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ONBOARDING_RESPONSE_CACHE_TTL_MS ?? '8000',
  10
);
const onboardingSharedResponseCache = new Map<string, TtlCacheEntry<OnboardingHubSharedData>>();
const onboardingSharedInFlight = new Map<string, Promise<OnboardingHubSharedData>>();
const onboardingTemplateTasksResponseCache = new Map<string, TtlCacheEntry<OnboardingTemplateTaskRow[]>>();
const onboardingTemplateTasksInFlight = new Map<string, Promise<OnboardingTemplateTaskRow[]>>();

function getOnboardingSharedCacheKey(orgId: string): string {
  return `org:${orgId}:shared`;
}

function getOnboardingTemplateTasksCacheKey(orgId: string, templateId: string): string {
  return `org:${orgId}:template:${templateId}`;
}

export const getCachedOnboardingHubSharedData = cache(async (orgId: string): Promise<OnboardingHubSharedData> => {
  return getOrLoadTtlCachedValue({
    cache: onboardingSharedResponseCache,
    inFlight: onboardingSharedInFlight,
    key: getOnboardingSharedCacheKey(orgId),
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
  return getOrLoadTtlCachedValue({
    cache: onboardingTemplateTasksResponseCache,
    inFlight: onboardingTemplateTasksInFlight,
    key: getOnboardingTemplateTasksCacheKey(orgId, templateId),
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
