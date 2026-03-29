import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'broadcast-covers';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export type UploadBroadcastCoverResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

/**
 * Uploads to `broadcast-covers/{userId}/{broadcastId}/{uuid}.ext` (RLS: first segment = auth uid, second = broadcast id in org).
 */
export async function uploadBroadcastCover(
  supabase: SupabaseClient,
  userId: string,
  broadcastId: string,
  file: File
): Promise<UploadBroadcastCoverResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, message: 'Please choose a JPEG, PNG, WebP, or GIF image.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'Image must be 5 MB or smaller.' };
  }
  const ext = EXT[file.type];
  if (!ext) {
    return { ok: false, message: 'Unsupported image type.' };
  }

  const path = `${userId}/${broadcastId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (upErr) {
    return { ok: false, message: upErr.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (!publicUrl) {
    return { ok: false, message: 'Could not get public URL for upload.' };
  }
  return { ok: true, publicUrl };
}
