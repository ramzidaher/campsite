import { OnboardingRunClient } from '@/components/admin/hr/onboarding/OnboardingRunClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const ONBOARDING_COMPLETERS_TIMEOUT_MS = 1200;

async function resolveWithTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: unknown): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback as T), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function OnboardingRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const pathStartedAtMs = Date.now();
  const { runId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/hr/onboarding/[runId]',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [permissionKeys, runRes] = await Promise.all([
    withServerPerf('/admin/hr/onboarding/[runId]', 'get_my_permissions', getMyPermissions(orgId), 300),
    withServerPerf(
      '/admin/hr/onboarding/[runId]',
      'onboarding_run_lookup',
      supabase
        .from('onboarding_runs')
        .select('id, user_id, status, employment_start_date, created_at, template_id')
        .eq('org_id', orgId)
        .eq('id', runId)
        .maybeSingle(),
      350
    ),
  ]);
  const run = runRes.data;
  const canManageRuns       = permissionKeys.includes('onboarding.manage_runs');
  const canCompleteOwnTasks = permissionKeys.includes('onboarding.complete_own_tasks');

  if (!run) redirect('/hr/onboarding');

  const isSelfRun = (run.user_id as string) === user.id;
  const canActAsManager = canManageRuns;
  const canActAsEmployeeSelf = canCompleteOwnTasks && isSelfRun;

  if (!canActAsManager && !canActAsEmployeeSelf) redirect('/hr/onboarding');

  const { data: tasks } = await withServerPerf(
    '/admin/hr/onboarding/[runId]',
    'onboarding_run_tasks',
    supabase
      .from('onboarding_run_tasks')
      .select('id, title, description, assignee_type, category, due_date, sort_order, status, completed_at, completed_by')
      .eq('run_id', runId)
      .eq('org_id', orgId)
      .order('sort_order'),
    400
  );

  const { data: employee } = await withServerPerf(
    '/admin/hr/onboarding/[runId]',
    'employee_lookup',
    supabase
      .from('profiles')
      .select('id, full_name, preferred_name, email, avatar_url')
      .eq('id', run.user_id as string)
      .maybeSingle(),
    300
  );

  const completerIds = [...new Set((tasks ?? []).map((t) => t.completed_by as string).filter(Boolean))];
  const completerNames: Record<string, string> = {};
  if (completerIds.length) {
    const { data: completers } = await resolveWithTimeout(
      withServerPerf(
        '/admin/hr/onboarding/[runId]',
        'completer_names_lookup',
        supabase.from('profiles').select('id, full_name, preferred_name').in('id', completerIds),
        350
      ),
      ONBOARDING_COMPLETERS_TIMEOUT_MS,
      { data: [], error: null }
    );
    for (const c of completers ?? []) {
      completerNames[c.id as string] = getDisplayName(c.full_name as string, (c.preferred_name as string | null) ?? null);
    }
  }

  const view = (
    <OnboardingRunClient
      runId={runId}
      orgId={orgId}
      canManageRuns={canManageRuns}
      canActAsManager={canActAsManager}
      canActAsEmployeeSelf={canActAsEmployeeSelf}
      run={{
        id: run.id as string,
        user_id: run.user_id as string,
        status: run.status as string,
        employment_start_date: run.employment_start_date as string,
        created_at: run.created_at as string,
      }}
      employee={{
        id: (employee?.id as string) ?? run.user_id as string,
        display_name: getDisplayName((employee?.full_name as string) ?? null, (employee?.preferred_name as string | null) ?? null),
        email: (employee?.email as string | null) ?? null,
        avatar_url: (employee?.avatar_url as string | null) ?? null,
      }}
      tasks={(tasks ?? []).map((t) => ({
        id: t.id as string,
        title: t.title as string,
        description: (t.description as string | null) ?? null,
        assignee_type: t.assignee_type as string,
        category: t.category as string,
        due_date: (t.due_date as string | null) ?? null,
        sort_order: t.sort_order as number,
        status: t.status as string,
        completed_at: (t.completed_at as string | null) ?? null,
        completer_name: t.completed_by ? (completerNames[t.completed_by as string] ?? 'Unknown') : null,
      }))}
    />
  );
  warnIfSlowServerPath('/admin/hr/onboarding/[runId]', pathStartedAtMs);
  return view;
}
