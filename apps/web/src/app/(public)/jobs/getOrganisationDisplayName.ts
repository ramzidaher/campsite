import type { SupabaseClient } from '@supabase/supabase-js';

/** Resolve published organisation display name for a tenant slug (careers host or ?org=). */
export async function getOrganisationDisplayName(
  supabase: SupabaseClient,
  orgSlug: string | null | undefined
): Promise<string | null> {
  const s = orgSlug?.trim();
  if (!s) return null;
  const { data } = await supabase.from('organisations').select('name').eq('slug', s).maybeSingle();
  const n = (data?.name as string | undefined)?.trim();
  return n || null;
}
