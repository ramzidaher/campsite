import type { SupabaseClient } from '@supabase/supabase-js';

export const ORG_LOGO_BUCKET = 'org-logos';

/**
 * Some environments skipped the bootstrap migration that creates storage buckets.
 * Ensure the bucket exists before logo upload/lookup persistence.
 */
export async function ensureOrgLogoBucket(
  admin: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await admin.storage.listBuckets();
  if (list.error) return { ok: false, error: list.error.message };
  if ((list.data ?? []).some((b) => b.name === ORG_LOGO_BUCKET || b.id === ORG_LOGO_BUCKET)) {
    return { ok: true };
  }
  const create = await admin.storage.createBucket(ORG_LOGO_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  });
  if (create.error) return { ok: false, error: create.error.message };
  return { ok: true };
}

