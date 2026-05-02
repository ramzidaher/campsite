import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminHrEmployeeLimitedProfileData = {
  targetProfile: {
    full_name: string;
    preferred_name: string | null;
    pronouns: string | null;
    show_pronouns: boolean | null;
    email: string | null;
    status: string;
  };
  deptNames: string[];
} | null;

const ADMIN_HR_EMPLOYEE_LIMITED_PROFILE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_HR_EMPLOYEE_LIMITED_PROFILE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminHrEmployeeLimitedProfileResponseCache = new Map<
  string,
  TtlCacheEntry<AdminHrEmployeeLimitedProfileData>
>();
const adminHrEmployeeLimitedProfileInFlight = new Map<string, Promise<AdminHrEmployeeLimitedProfileData>>();
registerSharedCacheStore(
  'campsite:admin:hr:employee:limited',
  adminHrEmployeeLimitedProfileResponseCache,
  adminHrEmployeeLimitedProfileInFlight
);

function getAdminHrEmployeeLimitedProfileCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedAdminHrEmployeeLimitedProfileData = cache(
  async (orgId: string, userId: string): Promise<AdminHrEmployeeLimitedProfileData> => {
    return getOrLoadSharedCachedValue({
      cache: adminHrEmployeeLimitedProfileResponseCache,
      inFlight: adminHrEmployeeLimitedProfileInFlight,
      key: getAdminHrEmployeeLimitedProfileCacheKey(orgId, userId),
      cacheNamespace: 'campsite:admin:hr:employee:limited',
      ttlMs: ADMIN_HR_EMPLOYEE_LIMITED_PROFILE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: targetProfile }, { data: targetDepts }] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, preferred_name, pronouns, show_pronouns, email, status')
            .eq('id', userId)
            .eq('org_id', orgId)
            .maybeSingle(),
          supabase.from('user_departments').select('departments(name)').eq('user_id', userId),
        ]);
        if (!targetProfile || targetProfile.status !== 'active') return null;

        const deptNames: string[] = [];
        for (const row of targetDepts ?? []) {
          const raw = row.departments as { name: string } | { name: string }[] | null;
          const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
          for (const dept of arr) if (dept?.name) deptNames.push(dept.name);
        }

        return {
          targetProfile: {
            full_name: String(targetProfile.full_name ?? ''),
            preferred_name: (targetProfile.preferred_name as string | null) ?? null,
            pronouns: (targetProfile.pronouns as string | null) ?? null,
            show_pronouns: (targetProfile.show_pronouns as boolean | null) ?? null,
            email: (targetProfile.email as string | null) ?? null,
            status: String(targetProfile.status ?? ''),
          },
          deptNames,
        };
      },
    });
  }
);
