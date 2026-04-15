import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { ensureOrgLogoBucket, ORG_LOGO_BUCKET } from '@/lib/storage/orgLogoStorage';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export async function POST(req: Request) {
  let form: globalThis.FormData;
  try {
    form = (await req.formData()) as unknown as globalThis.FormData;
  } catch {
    return NextResponse.json({ error: 'Invalid upload payload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Please choose JPEG, PNG, WebP, GIF, or SVG.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be 5 MB or smaller.' }, { status: 400 });
  }

  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
  }

  const path = `manual/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server configuration error.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
  const bucket = await ensureOrgLogoBucket(admin);
  if (!bucket.ok) {
    return NextResponse.json({ error: bucket.error }, { status: 502 });
  }

  const { error: upErr } = await admin.storage.from(ORG_LOGO_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  });
  if (upErr) {
    console.error('org-logo/upload upload error:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 502 });
  }

  const { data } = admin.storage.from(ORG_LOGO_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    return NextResponse.json({ error: 'Could not generate public URL.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: data.publicUrl });
}

