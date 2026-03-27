'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export type PlatformActionResult = { ok: true } | { ok: false; error: string };

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
