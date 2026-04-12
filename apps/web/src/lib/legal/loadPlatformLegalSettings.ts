import type { SupabaseClient } from '@supabase/supabase-js';
import { FALLBACK_LEGAL_SETTINGS } from '@/lib/legal/fallbackDefaults';
import type { PlatformLegalSettings } from '@/lib/legal/types';

type Row = {
  bundle_version: string;
  effective_label: string;
  terms_markdown: string;
  privacy_markdown: string;
  data_processing_markdown: string;
  updated_at: string | null;
};

export async function loadPlatformLegalSettings(
  supabase: SupabaseClient
): Promise<PlatformLegalSettings> {
  const { data, error } = await supabase.from('platform_legal_settings').select('*').eq('id', 1).maybeSingle();

  if (error || !data) {
    return FALLBACK_LEGAL_SETTINGS;
  }

  const r = data as Row;
  return {
    bundle_version: r.bundle_version,
    effective_label: r.effective_label,
    terms_markdown: r.terms_markdown,
    privacy_markdown: r.privacy_markdown,
    data_processing_markdown: r.data_processing_markdown,
    updated_at: r.updated_at,
  };
}
