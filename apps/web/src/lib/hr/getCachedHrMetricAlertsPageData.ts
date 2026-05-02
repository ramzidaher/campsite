import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type HrMetricAlertsPageData = {
  initial: {
    bradford_alert_threshold: number;
    working_hours_use_contract: boolean;
    working_hours_absolute_max: number | null;
    diversity_evaluation_window_days: number;
    diversity_min_sample_size: number;
    eq_category_codes: Array<{ code: string; label: string }>;
    metrics_enabled: Record<string, boolean>;
  } | null;
} | null;

const HR_METRIC_ALERTS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HR_METRIC_ALERTS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const hrMetricAlertsPageResponseCache = new Map<string, TtlCacheEntry<HrMetricAlertsPageData>>();
const hrMetricAlertsPageInFlight = new Map<string, Promise<HrMetricAlertsPageData>>();
registerSharedCacheStore(
  'campsite:hr:metric-alerts',
  hrMetricAlertsPageResponseCache,
  hrMetricAlertsPageInFlight
);

function getHrMetricAlertsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedHrMetricAlertsPageData = cache(async (orgId: string): Promise<HrMetricAlertsPageData> => {
  return getOrLoadSharedCachedValue({
    cache: hrMetricAlertsPageResponseCache,
    inFlight: hrMetricAlertsPageInFlight,
    key: getHrMetricAlertsPageCacheKey(orgId),
    cacheNamespace: 'campsite:hr:metric-alerts',
    ttlMs: HR_METRIC_ALERTS_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data: raw, error } = await supabase.rpc('org_hr_metric_settings_get');
      if (error) return null;

      const row = raw as Record<string, unknown> | null;
      const initial = row
        ? {
            bradford_alert_threshold: Number(row.bradford_alert_threshold ?? 200),
            working_hours_use_contract: row.working_hours_use_contract !== false,
            working_hours_absolute_max:
              row.working_hours_absolute_max != null ? Number(row.working_hours_absolute_max) : null,
            diversity_evaluation_window_days: Number(row.diversity_evaluation_window_days ?? 90),
            diversity_min_sample_size: Number(row.diversity_min_sample_size ?? 5),
            eq_category_codes: Array.isArray(row.eq_category_codes)
              ? (row.eq_category_codes as { code?: string; label?: string }[]).map((entry) => ({
                  code: String(entry.code ?? ''),
                  label: String(entry.label ?? ''),
                }))
              : [],
            metrics_enabled:
              row.metrics_enabled && typeof row.metrics_enabled === 'object'
                ? (row.metrics_enabled as Record<string, boolean>)
                : {},
          }
        : null;

      return { initial };
    },
  });
});
