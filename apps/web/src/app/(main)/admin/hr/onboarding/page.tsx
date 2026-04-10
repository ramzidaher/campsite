import { OnboardingHubClient } from '@/components/admin/hr/onboarding/OnboardingHubClient';
import { createClient } from '@/lib/supabase/server';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function OnboardingHubPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [canTemplates, canManageRuns, canCompleteOwnTasks] = await Promise.all([
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'onboarding.manage_templates', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'onboarding.manage_runs', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'onboarding.complete_own_tasks', p_context: {} })
      .then(({ data }) => !!data),
  ]);

  const canViewRuns = canManageRuns || canCompleteOwnTasks;
  if (!canTemplates && !canViewRuns) redirect('/admin');

  const { template: rawTemplateId } = await searchParams;

  const [templatesRes, runsRes, membersRes] = await Promise.all([
    supabase
      .from('onboarding_templates')
      .select('id, name, description, is_default, is_archived, created_at')
      .eq('org_id', orgId)
      .order('name'),
    supabase
      .from('onboarding_runs')
      .select('id, user_id, status, employment_start_date, created_at, template_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('profiles')
      .select('id, full_name, preferred_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  const templates = templatesRes.data ?? [];
  const members = membersRes.data ?? [];
  const allRuns = runsRes.data ?? [];
  const runs = canManageRuns
    ? allRuns
    : allRuns.filter((r) => canCompleteOwnTasks && (r.user_id as string) === user.id);

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
  const validSelectedTemplateId =
    selectedTemplateId && (templates ?? []).some((t) => (t.id as string) === selectedTemplateId)
      ? selectedTemplateId
      : null;

  const templateTasks = validSelectedTemplateId
    ? await supabase
        .from('onboarding_template_tasks')
        .select('id, template_id, title, category, assignee_type, due_offset_days, sort_order')
        .eq('org_id', orgId)
        .eq('template_id', validSelectedTemplateId)
        .order('sort_order')
        .then(({ data }) => data ?? [])
    : [];

  const enrichedRuns = (runs ?? []).map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    display_name: memberMap[r.user_id as string]?.display_name ?? 'Unknown',
    email: memberMap[r.user_id as string]?.email ?? null,
    status: r.status as string,
    employment_start_date: r.employment_start_date as string,
    created_at: r.created_at as string,
    template_name: templateMap[r.template_id as string] ?? '—',
  }));

  return (
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
    />
  );
}
