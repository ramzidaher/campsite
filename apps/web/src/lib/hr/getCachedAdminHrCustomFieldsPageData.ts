import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminHrCustomFieldsPageData = {
  definitions: Array<{
    id: string;
    key: string;
    label: string;
    section: string | null;
    field_type: string | null;
    is_required: boolean | null;
    visible_to_manager: boolean | null;
    visible_to_self: boolean | null;
    is_active: boolean | null;
  }>;
};

const ADMIN_HR_CUSTOM_FIELDS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_HR_CUSTOM_FIELDS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminHrCustomFieldsPageResponseCache = new Map<string, TtlCacheEntry<AdminHrCustomFieldsPageData>>();
const adminHrCustomFieldsPageInFlight = new Map<string, Promise<AdminHrCustomFieldsPageData>>();
registerSharedCacheStore(
  'campsite:admin:hr:custom-fields',
  adminHrCustomFieldsPageResponseCache,
  adminHrCustomFieldsPageInFlight
);

function getAdminHrCustomFieldsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminHrCustomFieldsPageData = cache(
  async (orgId: string): Promise<AdminHrCustomFieldsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminHrCustomFieldsPageResponseCache,
      inFlight: adminHrCustomFieldsPageInFlight,
      key: getAdminHrCustomFieldsPageCacheKey(orgId),
      cacheNamespace: 'campsite:admin:hr:custom-fields',
      ttlMs: ADMIN_HR_CUSTOM_FIELDS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: definitions } = await supabase
          .from('hr_custom_field_definitions')
          .select('id, key, label, section, field_type, is_required, visible_to_manager, visible_to_self, is_active')
          .eq('org_id', orgId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        return {
          definitions: (definitions ?? []) as AdminHrCustomFieldsPageData['definitions'],
        };
      },
    });
  }
);
