import crypto from 'crypto';

export type BankDetailPayload = {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  sort_code: string;
  iban: string;
  swift_bic: string;
  routing_number: string;
  country: string;
  currency: string;
  payroll_reference: string;
};

function getKey(): Buffer {
  const raw = process.env.BANK_DETAILS_ENCRYPTION_KEY ?? '';
  if (!raw) {
    throw new Error('BANK_DETAILS_ENCRYPTION_KEY is required');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('BANK_DETAILS_ENCRYPTION_KEY must be base64 for 32 bytes');
  }
  return key;
}

export function encryptBankDetails(payload: BankDetailPayload): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;
}

export function decryptBankDetails(token: string): BankDetailPayload {
  const [ivB64, encryptedB64, tagB64] = token.split('.');
  if (!ivB64 || !encryptedB64 || !tagB64) {
    throw new Error('Invalid encrypted payload format');
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as BankDetailPayload;
}

export function maskAccountNumber(v: string): { masked: string; last4: string | null } {
  const digits = v.replace(/\D+/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : null;
  return {
    masked: last4 ? `****${last4}` : '****',
    last4,
  };
}

export function maskSortCode(v: string): { masked: string; last4: string | null } {
  const digits = v.replace(/\D+/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : null;
  return {
    masked: last4 ? `**-**-${last4.slice(-2)}` : '**-**-**',
    last4,
  };
}

export function maskIban(v: string): { masked: string; last4: string | null } {
  const compact = v.replace(/\s+/g, '').toUpperCase();
  const last4 = compact.length >= 4 ? compact.slice(-4) : null;
  return {
    masked: last4 ? `****${last4}` : '****',
    last4,
  };
}
