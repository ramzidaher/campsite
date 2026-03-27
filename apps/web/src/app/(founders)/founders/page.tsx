import { FounderHqApp } from '@/components/founders/FounderHqApp';
import { parseFounderMembers, parseFounderOrgs } from '@/components/founders/founderTypes';
import { requirePlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function initialsFromName(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

export default async function FoundersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/founders');

  await requirePlatformFounder(supabase, user.id);

  const [{ data: orgRpc, error: orgRpcError }, { data: memRpc, error: memRpcError }] = await Promise.all([
    supabase.rpc('platform_organisations_list'),
    supabase.rpc('platform_profiles_list_all'),
  ]);
  const initialOrgs = parseFounderOrgs(orgRpc);
  const initialAllMembers = parseFounderMembers(memRpc);
  const loadError = [orgRpcError?.message, memRpcError?.message].filter(Boolean).join(' — ') || undefined;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const email = user.email ?? '';
  const metaName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) ||
    '';
  const displayName =
    (profile?.full_name as string | null)?.trim() ||
    metaName.trim() ||
    email.split('@')[0] ||
    'Founder';
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  const initials = initialsFromName(displayName);

  return (
    <FounderHqApp
      initialOrgs={initialOrgs}
      initialAllMembers={initialAllMembers}
      loadError={loadError}
      user={{
        displayName,
        firstName,
        initials,
        avatarUrl: (profile?.avatar_url as string | null) ?? null,
        email,
      }}
    />
  );
}
