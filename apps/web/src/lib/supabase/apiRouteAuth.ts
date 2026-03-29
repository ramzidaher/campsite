import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

import { getSupabasePublicKey, getSupabaseUrl } from './env';
import { createClient } from './server';

/** Cookie session (web) or `Authorization: Bearer <access_token>` (e.g. mobile). */
export async function getUserFromApiRequest(req: Request): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return null;

  const sb = createSupabaseJsClient(url, key);
  const {
    data: { user: jwtUser },
    error,
  } = await sb.auth.getUser(token);
  if (error || !jwtUser) return null;
  return jwtUser;
}
