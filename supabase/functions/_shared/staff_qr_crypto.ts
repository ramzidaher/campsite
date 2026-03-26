/** Signed staff discount QR token: v1.{base64url(payload)}.{hex(hmac)} */

export type TokenPayload = {
  uid: string;
  oid: string;
  role: string;
  iat: number;
  exp: number;
  n: string;
};

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

export function nextMidnightUtcEpochSeconds(from = new Date()): number {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  const next = Date.UTC(y, m, d + 1, 0, 0, 0, 0);
  return Math.floor(next / 1000);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', textEncoder().encode(input));
  return bytesToHex(new Uint8Array(buf));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncodeBytes(textEncoder().encode(JSON.stringify(obj)));
}

function base64UrlDecodeToString(s: string): string {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const raw = atob(b64);
  let out = '';
  for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i));
  return out;
}

async function hmacSha256Hex(keyBytes: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}

export async function deriveOrgKeyBytes(masterSecret: string, orgId: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textEncoder().encode(masterSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder().encode(`staff-qr|${orgId}`));
  return new Uint8Array(sig);
}

export async function signPayloadB64(masterSecret: string, orgId: string, payloadB64: string): Promise<string> {
  const key = await deriveOrgKeyBytes(masterSecret, orgId);
  return hmacSha256Hex(key, payloadB64);
}

export async function verifyPayloadB64(
  masterSecret: string,
  orgId: string,
  payloadB64: string,
  sigHex: string,
): Promise<boolean> {
  const expected = await signPayloadB64(masterSecret, orgId, payloadB64);
  if (expected.length !== sigHex.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) ok |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
  return ok === 0;
}

export async function mintTokenString(masterSecret: string, payload: TokenPayload): Promise<string> {
  const payloadB64 = base64UrlEncodeJson(payload);
  const sig = await signPayloadB64(masterSecret, payload.oid, payloadB64);
  return `v1.${payloadB64}.${sig}`;
}

export function parseTokenString(token: string): { payloadB64: string; sigHex: string } | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  return { payloadB64: parts[1]!, sigHex: parts[2]! };
}

export function decodePayload(payloadB64: string): TokenPayload | null {
  try {
    const raw = base64UrlDecodeToString(payloadB64);
    const p = JSON.parse(raw) as TokenPayload;
    if (!p.uid || !p.oid || !p.role || typeof p.iat !== 'number' || typeof p.exp !== 'number' || !p.n) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
