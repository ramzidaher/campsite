import { OnboardingHubClient } from '@/components/admin/hr/onboarding/OnboardingHubClient';
import { getCachedOnboardingHubPageData } from '@/lib/hr/onboardingHubRouteData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';

export default async function OnboardingHubPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/onboarding',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const userIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
  if (!userId) redirect('/login');
  const canTemplates        = permissionKeys.includes('onboarding.manage_templates');
  const canManageRuns       = permissionKeys.includes('onboarding.manage_runs');
  const canCompleteOwnTasks = permissionKeys.includes('onboarding.complete_own_tasks');

  const canViewRuns = canManageRuns || canCompleteOwnTasks;
  if (!canTemplates && !canViewRuns) redirect('/admin');

  const { template: rawTemplateId } = await searchParams;
  const onlyOwnRuns = !canManageRuns && canCompleteOwnTasks;

  const pageData = await withServerPerf(
    '/admin/hr/onboarding',
    'cached_onboarding_hub_page_data',
    getCachedOnboardingHubPageData({
      orgId,
      userId,
      onlyOwnRuns,
      selectedTemplateId: (rawTemplateId ?? '').trim() || null,
    }),
    650
  );

  const templates = pageData.sharedData.templates ?? [];
  const members = pageData.sharedData.members ?? [];
  const runs = pageData.runs ?? [];

  // resolve names
  const memberMap: Record<string, { display_name: string; email: string | null }> = {};
  for (const m of members ?? []) {
    memberMap[m.id as string] = {
      display_name: getDisplayName(m.full_name as string, (m.preferred_name as string | null) ?? null),
      email: (m.email as string | null),
    };
  }

  const templateMap: Record<string, string> = {};
  for (const t of templates ?? []) templateMap[t.id as string] = t.name as string;

  const selectedTemplateId = (rawTemplateId ?? '').trim();
  const validSelectedTemplateId = selectedTemplateId && templates.some((t) => (t.id as string) === selectedTemplateId)
    ? selectedTemplateId
    : null;
  const templateTasks = validSelectedTemplateId ? pageData.templateTasks : [];
  const readinessRows = pageData.sharedData.readinessRows ?? [];

  const enrichedRuns = (runs ?? []).map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    display_name: memberMap[r.user_id as string]?.display_name ?? 'Unknown',
    email: memberMap[r.user_id as string]?.email ?? null,
    status: r.status as string,
    employment_start_date: r.employment_start_date as string,
    created_at: r.created_at as string,
    template_name: templateMap[r.template_id as string] ?? '',
  }));

  const view = (
    <OnboardingHubClient
      orgId={orgId}
      canTemplates={canTemplates}
      canRuns={canViewRuns}
      canManageRuns={canManageRuns}
      templates={(templates ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        description: (t.description as string | null) ?? null,
        is_default: t.is_default as boolean,
        is_archived: t.is_archived as boolean,
        created_at: t.created_at as string,
      }))}
      runs={enrichedRuns}
      members={(members ?? []).map((m) => ({
        id: m.id as string,
        display_name: getDisplayName(m.full_name as string, (m.preferred_name as string | null) ?? null),
        email: (m.email as string | null),
      }))}
      selectedTemplateId={validSelectedTemplateId}
      selectedTemplateTasks={templateTasks.map((t) => ({
        id: t.id as string,
        template_id: t.template_id as string,
        title: t.title as string,
        category: t.category as string,
        assignee_type: t.assignee_type as string,
        due_offset_days: Number(t.due_offset_days ?? 0),
        sort_order: Number(t.sort_order ?? 0),
      }))}
      readinessRows={readinessRows.map((r) => ({
        job_application_id: String(r.job_application_id),
        contract_assigned: Boolean(r.contract_assigned),
        rtw_required: Boolean(r.rtw_required),
        rtw_complete: Boolean(r.rtw_complete),
        payroll_bank_complete: Boolean(r.payroll_bank_complete),
        payroll_tax_complete: Boolean(r.payroll_tax_complete),
        policy_ack_complete: Boolean(r.policy_ack_complete),
        it_access_complete: Boolean(r.it_access_complete),
        start_confirmed_at: (r.start_confirmed_at as string | null) ?? null,
      }))}
    />
  );
  warnIfSlowServerPath('/admin/hr/onboarding', pathStartedAtMs);
  return view;
}
