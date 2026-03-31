import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from './env';

let browserClient: SupabaseClient | undefined;

/** Browser / RN singleton - call once per runtime. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = getSupabasePublicEnv();
    browserClient = createClient(url, anonKey);
  }
  return browserClient;
}

/** Server-side or scripts - new client per call. */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey);
}
