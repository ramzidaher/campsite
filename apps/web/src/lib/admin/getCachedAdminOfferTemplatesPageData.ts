import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminOfferTemplatesPageData = {
  templates: Array<{ id: string; name: string; updated_at: string | null }>;
};

const ADMIN_OFFER_TEMPLATES_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_OFFER_TEMPLATES_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminOfferTemplatesPageResponseCache = new Map<string, TtlCacheEntry<AdminOfferTemplatesPageData>>();
const adminOfferTemplatesPageInFlight = new Map<string, Promise<AdminOfferTemplatesPageData>>();
registerSharedCacheStore(
  'campsite:admin:offer-templates',
  adminOfferTemplatesPageResponseCache,
  adminOfferTemplatesPageInFlight
);

function getAdminOfferTemplatesPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminOfferTemplatesPageData = cache(
  async (orgId: string): Promise<AdminOfferTemplatesPageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminOfferTemplatesPageResponseCache,
      inFlight: adminOfferTemplatesPageInFlight,
      key: getAdminOfferTemplatesPageCacheKey(orgId),
      cacheNamespace: 'campsite:admin:offer-templates',
      ttlMs: ADMIN_OFFER_TEMPLATES_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: rows } = await supabase
          .from('offer_letter_templates')
          .select('id, name, updated_at')
          .eq('org_id', orgId)
          .order('name', { ascending: true });
        return {
          templates: (rows ?? []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            updated_at: (row.updated_at as string | null) ?? null,
          })),
        };
      },
    });
  }
);
