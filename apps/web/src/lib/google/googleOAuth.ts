import { createHmac, timingSafeEqual } from 'crypto';

type GoogleOAuthType = 'sheets' | 'calendar';

type GoogleOAuthStatePayload = {
  uid: string;
  type: GoogleOAuthType;
  returnTo: string;
  exp: number;
};

function trimOrigin(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/\/$/, '');
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

function getStateSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new Error('Google OAuth is not configured (missing GOOGLE_CLIENT_SECRET).');
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
}

export function buildGoogleOAuthBaseUrl(req: Request): string {
  const reqUrl = new URL(req.url);
  if (isLocalHostname(reqUrl.hostname)) {
    const port = reqUrl.port ? `:${reqUrl.port}` : '';
    return `http://localhost${port}`;
  }
  return trimOrigin(process.env.SITE_URL) ?? trimOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? reqUrl.origin;
}

export function buildGoogleOAuthRedirectUri(req: Request): string {
  return `${buildGoogleOAuthBaseUrl(req)}/api/google/oauth/callback`;
}

export function createGoogleOAuthState(input: {
  uid: string;
  type: GoogleOAuthType;
  returnTo: string;
}): string {
  const payload: GoogleOAuthStatePayload = {
    uid: input.uid,
    type: input.type,
    returnTo: input.returnTo,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function parseGoogleOAuthState(raw: string | null | undefined): GoogleOAuthStatePayload | null {
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
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<GoogleOAuthStatePayload>;
    if (parsed.type !== 'sheets' && parsed.type !== 'calendar') return null;
    if (typeof parsed.uid !== 'string' || !parsed.uid.trim()) return null;
    if (typeof parsed.returnTo !== 'string' || !parsed.returnTo.trim()) return null;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return {
      uid: parsed.uid,
      type: parsed.type,
      returnTo: parsed.returnTo,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function appendGoogleAuthParam(urlLike: string, key: string, value: string): string {
  const url = new URL(urlLike);
  url.searchParams.set(key, value);
  return url.toString();
}
