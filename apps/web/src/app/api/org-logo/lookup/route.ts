import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { ensureOrgLogoBucket, ORG_LOGO_BUCKET } from '@/lib/storage/orgLogoStorage';

const MAX_BYTES = 5 * 1024 * 1024;

function toDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.')) return null;
    return host;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const rawDomain = typeof (body as { domain?: unknown })?.domain === 'string'
    ? ((body as { domain: string }).domain)
    : '';
  const domain = toDomain(rawDomain);
  if (!domain) {
    return NextResponse.json({ error: 'Enter a valid website domain.' }, { status: 400 });
  }

  const logoDevSecret = process.env.LOGODEV_SECRET_KEY?.trim();
  const logoDevPublic = process.env.NEXT_PUBLIC_LOGODEV_PUBLISHABLE_KEY?.trim();
  const domainCandidates = Array.from(new Set([domain, `www.${domain}`]));
  const sourceUrls: string[] = [];
  if (logoDevSecret) {
    sourceUrls.push(
      ...domainCandidates.map(
        (d) =>
          `https://img.logo.dev/${encodeURIComponent(d)}?token=${encodeURIComponent(logoDevSecret)}&size=256&retina=true`
      )
    );
  }
  if (logoDevPublic) {
    sourceUrls.push(
      ...domainCandidates.map(
        (d) =>
          `https://img.logo.dev/${encodeURIComponent(d)}?token=${encodeURIComponent(logoDevPublic)}&size=256&retina=true`
      )
    );
  }
  // Fallback for common domains if provider token/domain coverage misses.
  sourceUrls.push(...domainCandidates.map((d) => `https://logo.clearbit.com/${encodeURIComponent(d)}?size=256`));

  let safeType = 'image/png';
  let bytes: Buffer | null = null;
  for (const sourceUrl of sourceUrls) {
    try {
      const logoRes = await fetch(sourceUrl, { cache: 'no-store' });
      if (!logoRes.ok) continue;
      const contentType = (logoRes.headers.get('content-type') || '').toLowerCase();
      const candidateType = contentType.split(';')[0]?.trim() || 'image/png';
      if (!candidateType.startsWith('image/')) continue;
      const candidateBytes = Buffer.from(await logoRes.arrayBuffer());
      if (candidateBytes.byteLength === 0 || candidateBytes.byteLength > MAX_BYTES) continue;
      safeType = candidateType;
      bytes = candidateBytes;
      break;
    } catch {
      // Try next source.
    }
  }
  if (!bytes) {
    return NextResponse.json({ ok: false, error: 'No logo found for that domain.' });
  }

  const ext = safeType === 'image/svg+xml'
    ? 'svg'
    : safeType === 'image/webp'
      ? 'webp'
      : safeType === 'image/jpeg'
        ? 'jpg'
        : safeType === 'image/gif'
          ? 'gif'
          : 'png';
  const path = `lookup/${new Date().toISOString().slice(0, 10)}/${domain}-${crypto.randomUUID()}.${ext}`;

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
    contentType: safeType,
    upsert: false,
    cacheControl: '3600',
  });
  if (upErr) {
    console.error('org-logo/lookup upload error:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 502 });
  }

  const { data } = admin.storage.from(ORG_LOGO_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    return NextResponse.json({ error: 'Could not generate public URL.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: data.publicUrl });
}

