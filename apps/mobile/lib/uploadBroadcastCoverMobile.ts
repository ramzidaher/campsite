import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'broadcast-covers';
const MAX_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type UploadBroadcastCoverMobileResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

/**
 * Uploads to `broadcast-covers/{userId}/{broadcastId}/{id}.ext` (same layout as web).
 */
export async function uploadBroadcastCoverFromUri(
  supabase: SupabaseClient,
  userId: string,
  broadcastId: string,
  uri: string,
  mimeType: string,
): Promise<UploadBroadcastCoverMobileResult> {
  const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = MIME_TO_EXT[normalizedMime];
  if (!ext) {
    return { ok: false, message: 'Please choose a JPEG, PNG, WebP, or GIF image.' };
  }

  let blob: Blob;
  try {
    const res = await fetch(uri);
    blob = await res.blob();
  } catch {
    return { ok: false, message: 'Could not read the selected image.' };
  }

  if (blob.size > MAX_BYTES) {
    return { ok: false, message: 'Image must be 5 MB or smaller.' };
  }

  const path = `${userId}/${broadcastId}/${randomId()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType: normalizedMime,
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
