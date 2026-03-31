import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MintTokenResponse = {
  token: string;
  expiresAt: string;
  issuedAt: string;
};

function getSupabasePublicEnv(): { base: string; apikey: string } {
  const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseAnonKey?: string } | undefined;
  const base = (extra?.supabaseUrl ?? '').replace(/\/$/, '');
  const apikey = extra?.supabaseAnonKey ?? '';
  return { base, apikey };
}

export async function callStaffEdgeFunction(
  supabase: SupabaseClient,
  name: 'staff-discount-token' | 'staff-discount-verify',
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string; data?: unknown }> {
  const { base, apikey } = getSupabasePublicEnv();
  if (!base || !apikey) {
    return { ok: false, status: 500, message: 'Missing Supabase configuration.' };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { ok: false, status: 401, message: 'Not signed in.' };
  }

  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      typeof json === 'object' && json !== null && 'error' in json && typeof (json as { error: string }).error === 'string'
        ? (json as { error: string }).error
        : res.statusText;
    return { ok: false, status: res.status, message: msg, data: json };
  }

  return { ok: true, data: json };
}
