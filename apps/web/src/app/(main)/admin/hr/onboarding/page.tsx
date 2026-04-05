import { OnboardingHubClient } from '@/components/admin/hr/onboarding/OnboardingHubClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function OnboardingHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [canTemplates, canRuns] = await Promise.all([
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'onboarding.manage_templates', p_context: {} })
      .then(({ data }) => !!data),
    supabase
      .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'onboarding.manage_runs', p_context: {} })
      .then(({ data }) => !!data),
  ]);

  if (!canTemplates && !canRuns) redirect('/admin');

  const [{ data: templates }, { data: runs }, { data: members }] = await Promise.all([
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
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  // resolve names
  const memberMap: Record<string, { full_name: string; email: string | null }> = {};
  for (const m of members ?? []) memberMap[m.id as string] = { full_name: m.full_name as string, email: (m.email as string | null) };

  const templateMap: Record<string, string> = {};
  for (const t of templates ?? []) templateMap[t.id as string] = t.name as string;

  const enrichedRuns = (runs ?? []).map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    full_name: memberMap[r.user_id as string]?.full_name ?? 'Unknown',
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
      canRuns={canRuns}
      templates={(templates ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        description: (t.description as string | null) ?? null,
        is_default: t.is_default as boolean,
        is_archived: t.is_archived as boolean,
        created_at: t.created_at as string,
      }))}
      runs={enrichedRuns}
      members={(members ?? []).map((m) => ({ id: m.id as string, full_name: m.full_name as string, email: (m.email as string | null) }))}
    />
  );
}
