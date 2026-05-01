import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import {
  getCachedRecruitmentQueuePageData,
  type RecruitmentQueueRow,
} from '@/lib/recruitment/getCachedRecruitmentQueuePageData';
import { createClient } from '@/lib/supabase/server';

type DepartmentOption = { id: string; name: string };
type InitialRequestRow = {
  id: string;
  job_title: string;
  status: string;
  urgency: string;
  archived_at: string | null;
  created_at: string;
  department_id: string;
  departments: { name: string } | { name: string }[] | null;
};

export type HrRecruitmentPageData =
  | {
      mode: 'queue';
      rows: RecruitmentQueueRow[];
    }
  | {
      mode: 'manager';
      managedDepartments: DepartmentOption[];
      initialRequests: InitialRequestRow[];
      isHierarchyLeader: boolean;
    };

const HR_RECRUITMENT_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HR_RECRUITMENT_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const hrRecruitmentPageResponseCache = new Map<string, TtlCacheEntry<HrRecruitmentPageData>>();
const hrRecruitmentPageInFlight = new Map<string, Promise<HrRecruitmentPageData>>();
registerSharedCacheStore(
  'campsite:hr:recruitment:page',
  hrRecruitmentPageResponseCache,
  hrRecruitmentPageInFlight
);

function getHrRecruitmentPageCacheKey(
  orgId: string,
  userId: string,
  canRaise: boolean,
  canViewQueue: boolean,
  canApproveRequest: boolean,
  canManageRecruitment: boolean
): string {
  return [
    `org:${orgId}`,
    `user:${userId}`,
    `raise:${canRaise ? '1' : '0'}`,
    `queue:${canViewQueue ? '1' : '0'}`,
    `approve:${canApproveRequest ? '1' : '0'}`,
    `manage:${canManageRecruitment ? '1' : '0'}`,
  ].join(':');
}

export const getCachedHrRecruitmentPageData = cache(
  async (
    orgId: string,
    userId: string,
    canRaise: boolean,
    canViewQueue: boolean,
    canApproveRequest: boolean,
    canManageRecruitment: boolean
  ): Promise<HrRecruitmentPageData> => {
    return getOrLoadSharedCachedValue({
      cache: hrRecruitmentPageResponseCache,
      inFlight: hrRecruitmentPageInFlight,
      key: getHrRecruitmentPageCacheKey(
        orgId,
        userId,
        canRaise,
        canViewQueue,
        canApproveRequest,
        canManageRecruitment
      ),
      cacheNamespace: 'campsite:hr:recruitment:page',
      ttlMs: HR_RECRUITMENT_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        if (canViewQueue) {
          const rows = await getCachedRecruitmentQueuePageData(orgId);
          return {
            mode: 'queue',
            rows,
          } satisfies HrRecruitmentPageData;
        }

        const supabase = await createClient();
        const [{ data: ownDeptRows }, { data: dmRows }, { data: directReportRows }] = await Promise.all([
          supabase.from('user_departments').select('dept_id').eq('user_id', userId),
          supabase.from('dept_managers').select('dept_id').eq('user_id', userId),
          supabase.from('profiles').select('id').eq('org_id', orgId).eq('reports_to_user_id', userId),
        ]);

        const directReportIds = (directReportRows ?? []).map((r) => String(r.id));
        const [{ data: directReportDeptRows }, { data: directReportManagerRows }, { data: indirectReportRows }] =
          directReportIds.length
            ? await Promise.all([
                supabase.from('user_departments').select('dept_id').in('user_id', directReportIds),
                supabase.from('dept_managers').select('user_id').in('user_id', directReportIds).limit(1),
                supabase
                  .from('profiles')
                  .select('id')
                  .eq('org_id', orgId)
                  .in('reports_to_user_id', directReportIds)
                  .limit(1),
              ])
            : [
                { data: [] as { dept_id: string | null }[] },
                { data: [] as { user_id: string }[] },
                { data: [] as { id: string }[] },
              ];

        const allowedDeptIds = Array.from(
          new Set([
            ...(ownDeptRows ?? []).map((row) => String(row.dept_id)),
            ...(dmRows ?? []).map((row) => String(row.dept_id)),
            ...(directReportDeptRows ?? []).map((row) => String(row.dept_id)),
          ].filter((v) => v && v !== 'null'))
        );

        let managedDepartments: DepartmentOption[] = [];
        if (allowedDeptIds.length) {
          const { data: deptRows } = await supabase
            .from('departments')
            .select('id, name, is_archived')
            .eq('org_id', orgId)
            .in('id', allowedDeptIds)
            .order('name', { ascending: true });
          managedDepartments = (deptRows ?? [])
            .filter((d) => !d.is_archived)
            .map((d) => ({ id: String(d.id), name: String(d.name ?? 'Department') }));
        }

        const isHierarchyLeader = Boolean(
          (directReportManagerRows ?? []).length || (indirectReportRows ?? []).length
        );
        if (canRaise && (canApproveRequest || canManageRecruitment || isHierarchyLeader)) {
          const { data: allDeptRows } = await supabase
            .from('departments')
            .select('id, name, is_archived')
            .eq('org_id', orgId)
            .order('name', { ascending: true });
          managedDepartments = (allDeptRows ?? [])
            .filter((d) => !d.is_archived)
            .map((d) => ({ id: String(d.id), name: String(d.name ?? 'Department') }));
        }

        let initialRequests: InitialRequestRow[] = [];
        if (canRaise) {
          const { data: reqRows } = await supabase
            .from('recruitment_requests')
            .select(
              'id, job_title, status, urgency, archived_at, created_at, department_id, departments(name)'
            )
            .eq('created_by', userId)
            .order('created_at', { ascending: false });
          initialRequests = (reqRows ?? []).map((row) => {
            const departmentRaw = ((row as { departments?: unknown }).departments ?? null) as
              | { name?: string | null }
              | { name?: string | null }[]
              | null;
            const departments = Array.isArray(departmentRaw)
              ? departmentRaw.map((entry) => ({ name: String(entry?.name ?? 'Department') }))
              : departmentRaw
              ? { name: String(departmentRaw.name ?? 'Department') }
              : null;

            return {
              id: String((row as { id?: unknown }).id ?? ''),
              job_title: String((row as { job_title?: unknown }).job_title ?? ''),
              status: String((row as { status?: unknown }).status ?? ''),
              urgency: String((row as { urgency?: unknown }).urgency ?? ''),
              archived_at: ((row as { archived_at?: unknown }).archived_at as string | null) ?? null,
              created_at: String((row as { created_at?: unknown }).created_at ?? ''),
              department_id: String((row as { department_id?: unknown }).department_id ?? ''),
              departments,
            };
          });
        }

        return {
          mode: 'manager',
          managedDepartments,
          initialRequests,
          isHierarchyLeader,
        } satisfies HrRecruitmentPageData;
      },
    });
  }
);
