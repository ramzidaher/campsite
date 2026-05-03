import { createHmac, timingSafeEqual } from 'crypto';

import { buildOAuthAppBaseUrl } from '@/lib/oauth/oauthAppBaseUrl';

type MicrosoftOAuthStatePayload = {
  uid: string;
  returnTo: string;
  exp: number;
};

function getStateSecret(): string {
  const secret = (process.env.MICROSOFT_CLIENT_SECRET ?? process.env.CLIENT_SECRET)?.trim();
  if (!secret) {
    throw new Error('Microsoft OAuth is not configured (missing MICROSOFT_CLIENT_SECRET / CLIENT_SECRET).');
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
}

/** Callback under `/api` so middleware (which skips `api/*`) does not require a session on the apex host. */
export function buildMicrosoftOAuthRedirectUri(req: Request): string {
  return `${buildOAuthAppBaseUrl(req)}/api/microsoft/oauth/callback`;
}

export function createMicrosoftOAuthState(input: { uid: string; returnTo: string }): string {
  const payload: MicrosoftOAuthStatePayload = {
    uid: input.uid,
    returnTo: input.returnTo,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function parseMicrosoftOAuthState(raw: string | null | undefined): MicrosoftOAuthStatePayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;

  const encoded = raw.slice(0, dot);
  const providedSig = raw.slice(dot + 1);
  const expectedSig = signPayload(encoded);
  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<MicrosoftOAuthStatePayload>;
    if (typeof parsed.uid !== 'string' || !parsed.uid.trim()) return null;
    if (typeof parsed.returnTo !== 'string' || !parsed.returnTo.trim()) return null;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return {
      uid: parsed.uid,
      returnTo: parsed.returnTo,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function appendMicrosoftOAuthReturnParam(urlLike: string, key: string, value: string): string {
  const url = new URL(urlLike);
  url.searchParams.set(key, value);
  return url.toString();
}
