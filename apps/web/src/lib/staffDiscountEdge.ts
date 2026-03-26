import { getSupabasePublicKey, getSupabaseUrl } from '@/lib/supabase/env';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MintTokenResponse = {
  token: string;
  expiresAt: string;
  issuedAt: string;
};

export type VerifyTokenResponse =
  | {
      valid: true;
      name: string;
      role: string;
      department: string;
      discount_label: string | null;
      discount_value?: string | null;
      valid_at?: string | null;
    }
  | { valid: false; error?: string };

/** Call Supabase Edge Function with the user's JWT; returns parsed JSON body. */
export async function callStaffEdgeFunction(
  supabase: SupabaseClient,
  name: 'staff-discount-token' | 'staff-discount-verify',
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string; data?: unknown }> {
  const base = getSupabaseUrl();
  const apikey = getSupabasePublicKey();
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

  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/${name}`, {
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
