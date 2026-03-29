import type { UnsplashPhotoPayload } from '@/lib/unsplash/types';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, must-revalidate' } as const;

/** Rotating search terms so each shuffle (`k`) hits different Unsplash results. */
const UNSPLASH_SHUFFLE_QUERIES = [
  'landscape',
  'mountains',
  'ocean',
  'forest',
  'desert',
  'architecture',
  'minimal wallpaper',
  'texture abstract',
  'aerial nature',
  'coastal',
  'valley',
  'sky clouds',
] as const;

function picsumFallback(shuffleKey: number): { ok: true; source: 'picsum'; photos: UnsplashPhotoPayload[] } {
  const bucket = Math.abs(shuffleKey) % 10000;
  const photos: UnsplashPhotoPayload[] = Array.from({ length: 12 }, (_, i) => {
    const seed = `campsite-bc-${bucket}-${i}`;
    return {
      id: `picsum-${bucket}-${i}`,
      urls: {
        small: `https://picsum.photos/seed/${seed}/400/240`,
        regular: `https://picsum.photos/seed/${seed}/1920/1080`,
        full: `https://picsum.photos/seed/${seed}/2400/1600`,
      },
      user: { name: 'Lorem Picsum', htmlProfile: 'https://picsum.photos' },
      downloadLocation: null,
    };
  });
  return { ok: true, source: 'picsum', photos };
}

function mapUnsplashPhoto(p: Record<string, unknown>): UnsplashPhotoPayload | null {
  const id = typeof p.id === 'string' ? p.id : '';
  const urls = p.urls as Record<string, string> | undefined;
  const user = p.user as Record<string, unknown> | undefined;
  const links = p.links as Record<string, string> | undefined;
  const downloadLocation =
    typeof links?.download_location === 'string'
      ? links.download_location
      : typeof links?.download === 'string'
        ? links.download
        : null;
  const uName = user && typeof user.name === 'string' ? user.name : 'Unsplash';
  const uLinks = user?.links as Record<string, string> | undefined;
  const htmlProfile =
    uLinks && typeof uLinks.html === 'string' ? uLinks.html : 'https://unsplash.com';
  if (!id || !urls?.small || !urls?.regular) return null;
  return {
    id,
    urls: {
      small: urls.small,
      regular: urls.regular,
      full: typeof urls.full === 'string' ? urls.full : urls.regular,
    },
    user: { name: uName, htmlProfile },
    downloadLocation,
  };
}

/**
 * Curated landscape backgrounds. `k` (shuffle counter) rotates Unsplash search terms
 * and Picsum seeds so "Shuffle" returns new images.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shuffleParsed = Number.parseInt(searchParams.get('k') ?? '0', 10);
  const shuffleKey = Number.isFinite(shuffleParsed) ? shuffleParsed : 0;

  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return NextResponse.json(picsumFallback(shuffleKey), { headers: NO_STORE });
  }

  try {
    const n = UNSPLASH_SHUFFLE_QUERIES.length;
    const absK = Math.abs(shuffleKey);
    const query = UNSPLASH_SHUFFLE_QUERIES[absK % n];
    const page = Math.floor(absK / n) % 30 + 1;

    const searchUrl =
      `https://api.unsplash.com/search/photos?per_page=12&page=${page}` +
      `&orientation=landscape&query=${encodeURIComponent(query)}`;

    let res = await fetch(searchUrl, {
      headers: { Authorization: `Client-ID ${key}` },
      cache: 'no-store',
    });

    let body: { results?: unknown[] } | null = null;
    if (res.ok) {
      body = (await res.json()) as { results?: unknown[] };
    }

    const results = Array.isArray(body?.results) ? body.results : [];

    let photos: UnsplashPhotoPayload[] = results
      .map((item) => mapUnsplashPhoto(item as Record<string, unknown>))
      .filter(Boolean) as UnsplashPhotoPayload[];

    if (photos.length < 4) {
      const randomUrl =
        `https://api.unsplash.com/photos/random?count=12&orientation=landscape` +
        `&query=${encodeURIComponent(query)}`;
      res = await fetch(randomUrl, {
        headers: { Authorization: `Client-ID ${key}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
        photos = list
          .map((p) => mapUnsplashPhoto(p as Record<string, unknown>))
          .filter(Boolean) as UnsplashPhotoPayload[];
      }
    }

    if (!res.ok && photos.length === 0) {
      return NextResponse.json(
        { ok: false, source: 'unsplash', photos: [], error: `Unsplash error ${res.status}` },
        { status: 502, headers: NO_STORE }
      );
    }

    if (photos.length === 0) {
      return NextResponse.json(picsumFallback(shuffleKey), { headers: NO_STORE });
    }

    return NextResponse.json(
      { ok: true, source: 'unsplash' as const, photos },
      { headers: NO_STORE }
    );
  } catch {
    return NextResponse.json(
      { ok: false, source: 'unsplash', photos: [], error: 'Failed to load backgrounds' },
      { status: 502, headers: NO_STORE }
    );
  }
}
