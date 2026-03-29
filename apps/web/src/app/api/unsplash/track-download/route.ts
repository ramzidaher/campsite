import { NextResponse } from 'next/server';

/**
 * Unsplash API: trigger download when user selects a photo (required when using the API).
 */
export async function POST(req: Request) {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  let body: { downloadLocation?: string };
  try {
    body = (await req.json()) as { downloadLocation?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const url = typeof body.downloadLocation === 'string' ? body.downloadLocation.trim() : '';
  if (!url || !url.startsWith('https://api.unsplash.com/')) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Unsplash download track failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Network error' }, { status: 502 });
  }
}
