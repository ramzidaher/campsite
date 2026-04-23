import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKeyMaterial(): string | null {
  return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() ?? null;
}

function getKid(): string {
  return process.env.GOOGLE_TOKEN_ENCRYPTION_KID?.trim() || 'v1';
}

function deriveKey(raw: string): Buffer {
  // Stable 32-byte key derivation from env material.
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function isGoogleTokenCryptoConfigured(): boolean {
  return Boolean(getKeyMaterial());
}

export function encryptGoogleTokenIfConfigured(plain: string): {
  ciphertext: string | null;
  kid: string | null;
} {
  const raw = getKeyMaterial();
  if (!raw) {
    return { ciphertext: null, kid: null };
  }
  const key = deriveKey(raw);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    v: 1,
    alg: ALGO,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
  return {
    ciphertext: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
    kid: getKid(),
  };
}

export function decryptGoogleTokenIfConfigured(ciphertext: string | null | undefined): string | null {
  const raw = getKeyMaterial();
  if (!raw || !ciphertext) {
    return null;
  }
  try {
    const key = deriveKey(raw);
    const parsed = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8')) as {
      iv: string;
      tag: string;
      data: string;
    };
    const iv = Buffer.from(parsed.iv, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');
    const data = Buffer.from(parsed.data, 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}
