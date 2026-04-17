import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export type AdminJobsPageData = {
  orgSlug: string;
  jobRows: unknown[];
  deptRows: unknown[];
};

/**
 * Per-request dedupe for the admin jobs list bundle (slug + departments + listings).
 * Uses React `cache()` so `createClient()` / cookies stay valid — unlike `unstable_cache`, which forbids dynamic data inside the cached scope.
 */
export const getCachedAdminJobsPageData = cache(async (orgId: string): Promise<AdminJobsPageData> => {
  const supabase = await createClient();
  const [orgRes, jobsRes, deptsRes] = await Promise.all([
    supabase.from('organisations').select('slug').eq('id', orgId).maybeSingle(),
    supabase
      .from('job_listings')
      .select(
        'id, title, slug, status, grade_level, salary_band, contract_type, published_at, posted_year, department_id, departments(name)'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('departments').select('id, name').eq('org_id', orgId).order('name'),
  ]);

  return {
    orgSlug: (orgRes.data?.slug as string | undefined)?.trim() ?? '',
    jobRows: jobsRes.data ?? [],
    deptRows: deptsRes.data ?? [],
  };
});
