import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export function isMissingArchivedAtColumn(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  const m = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  if (m.includes('archived_at')) return true;
  if (error.code === 'PGRST204' && (m.includes('schema cache') || m.includes('archived'))) return true;
  if (error.code === '42703' && m.includes('archived')) return true;
  if (m.includes('does not exist') && m.includes('archived_at')) return true;
  return false;
}

const API_ROW_WITH_ARCHIVE =
  'id, org_id, title, description, storage_path, file_name, mime_type, byte_size, archived_at';
const API_ROW_LEGACY = 'id, org_id, title, description, storage_path, file_name, mime_type, byte_size';

export async function fetchStaffResourceRowForApi(
  supabase: SupabaseClient,
  resourceId: string,
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null }> {
  const first = await supabase.from('staff_resources').select(API_ROW_WITH_ARCHIVE).eq('id', resourceId).maybeSingle();
  if (!first.error && first.data) {
    return { data: first.data as Record<string, unknown>, error: null };
  }
  if (first.error && isMissingArchivedAtColumn(first.error)) {
    const second = await supabase.from('staff_resources').select(API_ROW_LEGACY).eq('id', resourceId).maybeSingle();
    if (second.error) return { data: null, error: second.error };
    if (!second.data) return { data: null, error: null };
    return { data: { ...second.data, archived_at: null }, error: null };
  }
  return { data: null, error: first.error };
}
