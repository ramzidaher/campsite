import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PROFILE_REGISTRATION_ROLE } from '@campsite/types';

export type CompleteRegistrationResult =
  | { ok: true }
  | { ok: false; message: string; kind?: 'org_creator_pending' };

type RegMeta = {
  register_org_id?: string;
  register_dept_ids?: string;
  register_subscriptions?: string;
  register_avatar_url?: string;
  register_legal_bundle_version?: string;
  register_legal_host?: string;
  register_legal_path?: string;
  register_legal_user_agent?: string;
  full_name?: string;
};

const MAX_REGISTER_AVATAR_URL_LEN = 2048;

function trimRegistrationAvatarUrl(meta: RegMeta | null | undefined): string | null {
  const t = meta?.register_avatar_url?.trim();
  if (!t || t.length > MAX_REGISTER_AVATAR_URL_LEN) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return t;
  } catch {
    return null;
  }
}

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

function isPostgresUniqueViolation(err: { code?: string } | null | undefined): boolean {
  return err?.code === '23505';
}

async function profileRowExists(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  return Boolean(data);
}

function parseSubscriptions(
  raw: string | undefined
): { channel_id: string; subscribed: boolean }[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { channel_id?: unknown; cat_id?: unknown; subscribed?: boolean } => {
        if (typeof x !== 'object' || x === null) return false;
        const o = x as { channel_id?: unknown; cat_id?: unknown };
        return typeof o.channel_id === 'string' || typeof o.cat_id === 'string';
      })
      .map((x) => {
        const o = x as { channel_id?: string; cat_id?: string; subscribed?: boolean };
        const channel_id = (o.channel_id ?? o.cat_id) as string;
        return { channel_id, subscribed: o.subscribed !== false };
      });
  } catch {
    return [];
  }
}

/** JWT metadata indicates “create new org” signup (not join). Legacy founder keys still supported. */
export function userMetadataLooksLikeOrgCreator(user: User): boolean {
  const m = user.user_metadata as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') return false;
  const name = String(m.register_create_org_name ?? m.register_founder_org_name ?? '').trim();
  const slug = String(m.register_create_org_slug ?? m.register_founder_org_slug ?? '').trim();
  return name.length > 0 && slug.length > 0;
}

async function insertProfileFromJwtMetadata(
  supabase: SupabaseClient,
  user: User
): Promise<CompleteRegistrationResult> {
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
    (typeof rawName === 'string' && rawName.trim()) || (user.email?.split('@')[0] ?? 'Account');
  const email = user.email ?? '';
  const avatarUrl = trimRegistrationAvatarUrl(meta);
  const legalRaw =
    typeof meta.register_legal_bundle_version === 'string'
      ? meta.register_legal_bundle_version.trim()
      : '';
  const legalBundle =
    legalRaw.length > 256 ? legalRaw.slice(0, 256) : legalRaw.length > 0 ? legalRaw : null;
  const legalHost =
    typeof meta.register_legal_host === 'string' ? meta.register_legal_host.trim() || null : null;
  const legalPath =
    typeof meta.register_legal_path === 'string' ? meta.register_legal_path.trim() || null : null;
  const legalUserAgentRaw =
    typeof meta.register_legal_user_agent === 'string' ? meta.register_legal_user_agent.trim() : '';
  const legalUserAgent =
    legalUserAgentRaw.length > 2048 ? legalUserAgentRaw.slice(0, 2048) : legalUserAgentRaw || null;

  const { error: pErr } = await supabase.from('profiles').insert({
    id: user.id,
    org_id: orgId,
    full_name: fullName,
    email: email || null,
    role: PROFILE_REGISTRATION_ROLE,
    status: 'pending',
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    ...(legalBundle
      ? {
          legal_bundle_version: legalBundle,
          legal_accepted_at: new Date().toISOString(),
        }
      : {}),
  });
  if (pErr) {
    if (isPostgresUniqueViolation(pErr) && (await profileRowExists(supabase, user.id))) {
      return { ok: true };
    }
    return { ok: false, message: pErr.message };
  }

  const ud = deptIds.map((dept_id) => ({ user_id: user.id, dept_id }));
  const { error: udErr } = await supabase.from('user_departments').insert(ud);
  if (udErr) {
    if (isPostgresUniqueViolation(udErr) && (await profileRowExists(supabase, user.id))) {
      return { ok: true };
    }
    return { ok: false, message: udErr.message };
  }

  const subRows = parseSubscriptions(meta.register_subscriptions).map((s) => ({
    user_id: user.id,
    channel_id: s.channel_id,
    subscribed: s.subscribed,
  }));
  if (subRows.length) {
    const { error: sErr } = await supabase.from('user_subscriptions').insert(subRows);
    if (sErr) {
      if (isPostgresUniqueViolation(sErr)) {
        return { ok: true };
      }
      return { ok: false, message: sErr.message };
    }
  }

  if (legalBundle) {
    const { error: legalErr } = await supabase.rpc('record_my_legal_acceptance', {
      p_bundle_version: legalBundle,
      p_accepted_at: new Date().toISOString(),
      p_acceptance_source: 'registration_fallback',
      p_request_host: legalHost,
      p_request_path: legalPath,
      p_user_agent: legalUserAgent,
      p_evidence: { flow: 'fallback_insert_profile_from_jwt' },
    });
    if (legalErr) {
      return { ok: false, message: legalErr.message };
    }
  }

  return { ok: true };
}

function isRpcUnavailableMessage(msg: string): boolean {
  return /42883|schema cache|Could not find the function|function .* does not exist/i.test(msg);
}

async function loadProfileId(supabase: SupabaseClient, userId: string) {
  return supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
}

/**
 * Creates `profiles` + team links from wizard metadata. Uses DB RPC (reads `auth.users`);
 * falls back to JWT metadata + client inserts only for **join** registrations.
 */
export async function completeRegistrationProfileIfNeeded(
  supabase: SupabaseClient,
  user: User
): Promise<CompleteRegistrationResult> {
  const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing) {
    return { ok: true };
  }

  const runEnsure = () => supabase.rpc('ensure_my_registration_profile');

  let { error: rpcErr } = await runEnsure();
  if (rpcErr && !isRpcUnavailableMessage(rpcErr.message)) {
    return { ok: false, message: rpcErr.message };
  }

  let { data: afterRpc } = await loadProfileId(supabase, user.id);
  if (afterRpc) {
    return { ok: true };
  }

  ({ error: rpcErr } = await runEnsure());
  if (rpcErr && !isRpcUnavailableMessage(rpcErr.message)) {
    return { ok: false, message: rpcErr.message };
  }

  ({ data: afterRpc } = await loadProfileId(supabase, user.id));
  if (afterRpc) {
    return { ok: true };
  }

  if (userMetadataLooksLikeOrgCreator(user)) {
    return {
      ok: false,
      kind: 'org_creator_pending',
      message:
        'Your new workspace is still being linked to your account. Try signing out and signing in again, or use Retry below. If this continues, your host may need the latest database migrations applied.',
    };
  }

  return insertProfileFromJwtMetadata(supabase, user);
}

/**
 * If metadata has a registration avatar but the profile row has none, copy onto `profiles.avatar_url`
 * via security-definer RPC (`sync_my_registration_avatar`).
 */
export async function syncRegistrationAvatarToProfileIfEmpty(
  supabase: SupabaseClient,
  _user: User
): Promise<void> {
  const { error } = await supabase.rpc('sync_my_registration_avatar');
  if (error && !isRpcUnavailableMessage(error.message)) {
    console.warn('sync_my_registration_avatar:', error.message);
  }
}
