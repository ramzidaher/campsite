'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export type PlatformActionResult = { ok: true } | { ok: false; error: string };
export type PlatformActionDataResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function getPlatformFounderContext(): Promise<
  | { ok: true; userId: string; userSupabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const { data: row, error } = await userSupabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: 'Not allowed.' };
  return { ok: true, userId: user.id, userSupabase };
}

export async function deactivatePlatformOrg(orgId: string): Promise<PlatformActionResult> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.userSupabase
    .from('organisations')
    .update({ is_active: false })
    .eq('id', orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePlatformOrgUser(orgId: string, userId: string): Promise<PlatformActionResult> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error.';
    return { ok: false, error: msg };
  }
  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('id, org_id, role')
    .eq('id', userId)
    .maybeSingle();
  if (pe) return { ok: false, error: pe.message };
  if (!profile || (profile.org_id as string) !== orgId) {
    return { ok: false, error: 'User is not a member of this organisation.' };
  }
  const { data: founderRow } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (founderRow) {
    return { ok: false, error: 'Cannot delete a platform founder account. Remove platform access first if needed.' };
  }
  if ((profile.role as string) === 'org_admin') {
    const { count, error: ce } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'org_admin');
    if (ce) return { ok: false, error: ce.message };
    if ((count ?? 0) <= 1) {
      return { ok: false, error: 'Cannot remove the last org admin for this organisation.' };
    }
  }
  const { error: de } = await admin.auth.admin.deleteUser(userId);
  if (de) return { ok: false, error: de.message };
  return { ok: true };
}

export async function permanentlyDeletePlatformOrg(orgId: string): Promise<PlatformActionResult> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error.';
    return { ok: false, error: msg };
  }
  const { data: orgRow, error: oe } = await admin.from('organisations').select('id').eq('id', orgId).maybeSingle();
  if (oe) return { ok: false, error: oe.message };
  if (!orgRow) return { ok: false, error: 'Organisation not found.' };

  const { data: members, error: me } = await admin.from('profiles').select('id').eq('org_id', orgId);
  if (me) return { ok: false, error: me.message };
  const { data: founderRows, error: fe } = await admin.from('platform_admins').select('user_id');
  if (fe) return { ok: false, error: fe.message };
  const founderIds = new Set((founderRows ?? []).map((r) => r.user_id as string));

  for (const m of members ?? []) {
    const uid = m.id as string;
    if (founderIds.has(uid)) {
      const { error: ue } = await admin.from('profiles').update({ org_id: null }).eq('id', uid).eq('org_id', orgId);
      if (ue) return { ok: false, error: `Could not detach platform founder from org: ${ue.message}` };
      continue;
    }
    const { error: de } = await admin.auth.admin.deleteUser(uid);
    if (de) return { ok: false, error: `Failed to delete user ${uid}: ${de.message}` };
  }
  const { error: delOrg } = await admin.from('organisations').delete().eq('id', orgId);
  if (delOrg) return { ok: false, error: delOrg.message };
  return { ok: true };
}

export async function upsertPermissionDraftEntry(input: {
  key: string;
  label: string;
  description: string;
  category: string;
  is_founder_only: boolean;
  is_archived: boolean;
}): Promise<PlatformActionResult> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.userSupabase.rpc('platform_upsert_catalog_draft_entry', {
    p_key: input.key,
    p_label: input.label,
    p_description: input.description,
    p_category: input.category,
    p_is_founder_only: input.is_founder_only,
    p_is_archived: input.is_archived,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function publishPermissionCatalogVersion(publishNote: string): Promise<PlatformActionDataResult<{ versionNo: number }>> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  const { data, error } = await ctx.userSupabase.rpc('platform_publish_catalog', { p_publish_note: publishNote });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { versionNo: Number(data ?? 0) } };
}

export async function upsertRolePreset(input: {
  key: string;
  name: string;
  description: string;
  target_use_case: string;
  recommended_permission_keys: string[];
  is_archived: boolean;
}): Promise<PlatformActionResult> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.userSupabase.rpc('platform_founder_upsert_role_preset', {
    p_key: input.key,
    p_name: input.name,
    p_description: input.description,
    p_target_use_case: input.target_use_case,
    p_recommended_permission_keys: input.recommended_permission_keys,
    p_is_archived: input.is_archived,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateOrganisationGovernance(input: {
  orgId: string;
  planTier: string;
  subscriptionStatus: 'active' | 'limited' | 'suspended';
  isLocked: boolean;
  maintenanceMode: boolean;
  forceLogout: boolean;
}): Promise<PlatformActionResult> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.userSupabase.rpc('platform_update_org_governance', {
    p_org_id: input.orgId,
    p_plan_tier: input.planTier,
    p_subscription_status: input.subscriptionStatus,
    p_is_locked: input.isLocked,
    p_maintenance_mode: input.maintenanceMode,
    p_force_logout: input.forceLogout,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function startSupportViewAsSession(input: {
  orgId: string;
  targetUserId: string;
  minutes: number;
}): Promise<PlatformActionDataResult<{ token: string }>> {
  const ctx = await getPlatformFounderContext();
  if (!ctx.ok) return ctx;
  const { data, error } = await ctx.userSupabase.rpc('platform_create_support_session', {
    p_org_id: input.orgId,
    p_target_user_id: input.targetUserId,
    p_minutes: input.minutes,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { token: String(data ?? '') } };
}
