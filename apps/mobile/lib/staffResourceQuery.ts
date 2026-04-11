import type { SupabaseClient } from '@supabase/supabase-js';

export type MobileStaffResourceRow = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  updated_at: string | null;
};

export async function searchMobileStaffResources(
  supabase: SupabaseClient,
  q: string,
  limitN = 50,
): Promise<MobileStaffResourceRow[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc('search_staff_resources', {
    q: trimmed,
    limit_n: limitN,
  });
  if (error) throw error;

  const list = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return list.map((r) => ({
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    description: r.description != null ? String(r.description) : '',
    file_name: String(r.file_name ?? ''),
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  }));
}
