import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminSettingsPageData = {
  org: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    default_notifications_enabled: boolean;
    deactivation_requested_at: string | null;
    timezone: string | null;
    brand_preset_key: string | null;
    brand_tokens: Record<string, string> | null;
    brand_policy: string | null;
  } | null;
  orgCelebrationModes: Array<{
    id: string;
    mode_key: string;
    label: string;
    is_enabled: boolean;
    display_order: number;
    auto_start_month: number | null;
    auto_start_day: number | null;
    auto_end_month: number | null;
    auto_end_day: number | null;
    gradient_override: string | null;
    emoji_primary: string | null;
    emoji_secondary: string | null;
  }>;
};

const ADMIN_SETTINGS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_SETTINGS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminSettingsPageResponseCache = new Map<string, TtlCacheEntry<AdminSettingsPageData>>();
const adminSettingsPageInFlight = new Map<string, Promise<AdminSettingsPageData>>();
registerSharedCacheStore(
  'campsite:admin:settings',
  adminSettingsPageResponseCache,
  adminSettingsPageInFlight
);

function getAdminSettingsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminSettingsPageData = cache(async (orgId: string): Promise<AdminSettingsPageData> => {
  return getOrLoadSharedCachedValue({
    cache: adminSettingsPageResponseCache,
    inFlight: adminSettingsPageInFlight,
    key: getAdminSettingsPageCacheKey(orgId),
    cacheNamespace: 'campsite:admin:settings',
    ttlMs: ADMIN_SETTINGS_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const [{ data: org }, { data: orgCelebrationModes }] = await Promise.all([
        supabase
          .from('organisations')
          .select(
            'id, name, slug, logo_url, default_notifications_enabled, deactivation_requested_at, timezone, brand_preset_key, brand_tokens, brand_policy'
          )
          .eq('id', orgId)
          .single(),
        supabase
          .from('org_celebration_modes')
          .select(
            'id,mode_key,label,is_enabled,display_order,auto_start_month,auto_start_day,auto_end_month,auto_end_day,gradient_override,emoji_primary,emoji_secondary'
          )
          .eq('org_id', orgId)
          .order('display_order', { ascending: true })
          .order('label', { ascending: true }),
      ]);

      return {
        org: org
          ? {
              id: String(org.id ?? ''),
              name: String(org.name ?? ''),
              slug: String(org.slug ?? ''),
              logo_url: (org.logo_url as string | null) ?? null,
              default_notifications_enabled: Boolean(org.default_notifications_enabled),
              deactivation_requested_at: (org.deactivation_requested_at as string | null) ?? null,
              timezone: (org.timezone as string | null) ?? null,
              brand_preset_key: (org.brand_preset_key as string | null) ?? null,
              brand_tokens: (org.brand_tokens as Record<string, string> | null) ?? null,
              brand_policy: (org.brand_policy as string | null) ?? null,
            }
          : null,
        orgCelebrationModes: (orgCelebrationModes ?? []) as AdminSettingsPageData['orgCelebrationModes'],
      };
    },
  });
});
