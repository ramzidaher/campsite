import { NextResponse } from 'next/server';

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/g;

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function normalizeHex(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  return null;
}

function relativeLuma(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function pickBestColors(input: string[]): string[] {
  const deduped = [...new Set(input.map((c) => normalizeHex(c)).filter(Boolean) as string[])];
  const filtered = deduped.filter((hex) => {
    const l = relativeLuma(hex);
    return l > 0.08 && l < 0.92;
  });
  const scored = (filtered.length ? filtered : deduped).sort(
    (a, b) => saturation(b) - saturation(a)
  );
  return scored.slice(0, 3);
}

function lighten(hex: string, amount: number): string {
  const v = hex.replace('#', '');
  const n = Number.parseInt(v, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * amount)));
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

function hashHex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  const n = h >>> 0;
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const logoUrl =
    typeof (body as { logoUrl?: unknown })?.logoUrl === 'string'
      ? (body as { logoUrl: string }).logoUrl.trim()
      : '';
  const orgName =
    typeof (body as { orgName?: unknown })?.orgName === 'string'
      ? (body as { orgName: string }).orgName.trim()
      : '';
  if (!logoUrl) {
    return NextResponse.json({ error: 'Missing logo URL.' }, { status: 400 });
  }

  try {
    const res = await fetch(logoUrl, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'Could not read logo image.' }, { status: 404 });
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('svg')) {
      const svgText = await res.text();
      const hexMatches = [...svgText.matchAll(HEX_RE)].map((m) => m[0]);
      const rgbMatches = [...svgText.matchAll(RGB_RE)].map((m) =>
        toHex(
          Math.min(255, Number(m[1])),
          Math.min(255, Number(m[2])),
          Math.min(255, Number(m[3]))
        )
      );
      const picked = pickBestColors([...hexMatches, ...rgbMatches]);
      if (picked.length > 0) {
        return NextResponse.json({ ok: true, colors: picked });
      }
    }
    if (contentType.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer());
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default;
      const { data, info } = await sharp(buf)
        .resize(64, 64, { fit: 'inside' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const counts = new Map<string, number>();
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        // Reduce to a small palette by quantizing each channel.
        const qr = Math.round(r / 24) * 24;
        const qg = Math.round(g / 24) * 24;
        const qb = Math.round(b / 24) * 24;
        const hex = toHex(Math.min(255, qr), Math.min(255, qg), Math.min(255, qb));
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
      const ranked = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([hex]) => hex)
        .slice(0, 18);
      const picked = pickBestColors(ranked);
      if (picked.length > 0) {
        return NextResponse.json({ ok: true, colors: picked });
      }
    }
  } catch {
    // Fall through to deterministic fallback.
  }

  const seed = logoUrl || orgName || 'camp-site';
  const primary = hashHex(seed);
  const secondary = hashHex(`${seed}:secondary`);
  const accent = lighten(primary, 0.2);
  return NextResponse.json({ ok: true, colors: [primary, secondary, accent] });
}

