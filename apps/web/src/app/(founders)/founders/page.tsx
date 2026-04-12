import { FounderHqApp } from '@/components/founders/FounderHqApp';
import {
  parseFounderAuditEvents,
  parseFounderBroadcasts,
  parseFounderMembers,
  parseFounderOrgs,
  parseFounderPermissionCatalogEntries,
  parseFounderRolePresets,
  parseFounderRotaShifts,
} from '@/components/founders/founderTypes';
import { requirePlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

function initialsFromName(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

export default async function FoundersPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login?next=/founders');

  await requirePlatformFounder(supabase, user.id);

  const [
    { data: orgRpc, error: orgRpcError },
    { data: memRpc, error: memRpcError },
    { data: draftCatalogRpc, error: draftCatalogError },
    { data: rolePresetsRpc, error: rolePresetsError },
    { data: auditRpc, error: auditError },
    { data: broadcastsRpc, error: broadcastsError },
    { data: rotaRpc, error: rotaError },
  ] = await Promise.all([
    supabase.rpc('platform_organisations_list'),
    supabase.rpc('platform_profiles_list_all'),
    supabase.rpc('platform_founder_catalog_draft_readonly'),
    supabase.rpc('platform_list_role_presets', { p_include_archived: true }),
    supabase.rpc('platform_list_audit_events', { p_org_id: null, p_event_type: null, p_days: 30 }),
    supabase.rpc('platform_broadcasts_list', { p_org_id: null }),
    supabase.rpc('platform_rota_shifts_list', { p_org_id: null, p_days: 30 }),
  ]);
  const initialOrgs = parseFounderOrgs(orgRpc);
  const initialAllMembers = parseFounderMembers(memRpc);
  const initialCatalogDraft = parseFounderPermissionCatalogEntries(draftCatalogRpc);
  const initialRolePresets = parseFounderRolePresets(rolePresetsRpc);
  const initialAuditEvents = parseFounderAuditEvents(auditRpc);
  const initialBroadcasts = parseFounderBroadcasts(broadcastsRpc);
  const initialRotaShifts = parseFounderRotaShifts(rotaRpc);
  const loadError =
    [orgRpcError?.message, memRpcError?.message, draftCatalogError?.message, rolePresetsError?.message, auditError?.message, broadcastsError?.message, rotaError?.message]
      .filter(Boolean)
      .join(' - ') || undefined;

  const [{ data: profile }, initialLegalSettings] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
    loadPlatformLegalSettings(supabase),
  ]);

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
      initialCatalogDraft={initialCatalogDraft}
      initialRolePresets={initialRolePresets}
      initialAuditEvents={initialAuditEvents}
      initialBroadcasts={initialBroadcasts}
      initialRotaShifts={initialRotaShifts}
      initialLegalSettings={initialLegalSettings}
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
