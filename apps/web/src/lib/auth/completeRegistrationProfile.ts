import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PROFILE_REGISTRATION_ROLE } from '@campsite/types';

type RegMeta = {
  register_org_id?: string;
  register_dept_ids?: string;
  register_subscriptions?: string;
  full_name?: string;
};

function parseDeptIds(raw: string | undefined): string[] | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ids = arr.filter((x) => typeof x === 'string' && x.length > 0);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

function parseSubscriptions(
  raw: string | undefined
): { cat_id: string; subscribed: boolean }[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { cat_id: string; subscribed?: boolean } => {
        return typeof x === 'object' && x !== null && typeof (x as { cat_id?: unknown }).cat_id === 'string';
      })
      .map((x) => ({ cat_id: x.cat_id, subscribed: x.subscribed !== false }));
  } catch {
    return [];
  }
}

async function insertProfileFromJwtMetadata(
  supabase: SupabaseClient,
  user: User
): Promise<{ ok: true } | { ok: false; message: string }> {
  const meta = user.user_metadata as RegMeta | null | undefined;
  const orgId = meta?.register_org_id?.trim();
  if (!orgId || !meta) {
    return { ok: false, message: 'Registration metadata missing from session.' };
  }

  const deptIds = parseDeptIds(meta.register_dept_ids);
  if (!deptIds) {
    return {
      ok: false,
      message:
        'Your account exists but registration data is incomplete. Ask an org admin to link you, or register again.',
    };
  }

  const rawName = meta.full_name ?? (user.user_metadata as RegMeta | undefined)?.full_name;
  const fullName =
    (typeof rawName === 'string' && rawName.trim()) || (user.email?.split('@')[0] ?? 'Member');
  const email = user.email ?? '';

  const { error: pErr } = await supabase.from('profiles').insert({
    id: user.id,
    org_id: orgId,
    full_name: fullName,
    email: email || null,
    role: PROFILE_REGISTRATION_ROLE,
    status: 'pending',
  });
  if (pErr) {
    return { ok: false, message: pErr.message };
  }

  const ud = deptIds.map((dept_id) => ({ user_id: user.id, dept_id }));
  const { error: udErr } = await supabase.from('user_departments').insert(ud);
  if (udErr) {
    return { ok: false, message: udErr.message };
  }

  const subRows = parseSubscriptions(meta.register_subscriptions).map((s) => ({
    user_id: user.id,
    cat_id: s.cat_id,
    subscribed: s.subscribed,
  }));
  if (subRows.length) {
    const { error: sErr } = await supabase.from('user_subscriptions').insert(subRows);
    if (sErr) {
      return { ok: false, message: sErr.message };
    }
  }

  return { ok: true };
}

function isRpcUnavailableMessage(msg: string): boolean {
  return /42883|schema cache|Could not find the function|function .* does not exist/i.test(msg);
}

/**
 * Creates `profiles` + team links from wizard metadata. Uses DB RPC (reads `auth.users`);
 * falls back to JWT metadata + client inserts if the RPC is missing or leaves no profile.
 */
export async function completeRegistrationProfileIfNeeded(
  supabase: SupabaseClient,
  user: User
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing) {
    return { ok: true };
  }

  const { error: rpcErr } = await supabase.rpc('ensure_my_registration_profile');
  if (rpcErr && !isRpcUnavailableMessage(rpcErr.message)) {
    return { ok: false, message: rpcErr.message };
  }

  const { data: afterRpc } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (afterRpc) {
    return { ok: true };
  }

  return insertProfileFromJwtMetadata(supabase, user);
}
