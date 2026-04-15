import crypto from 'crypto';

export type UkTaxPayload = {
  ni_number: string;
  tax_code: string;
  starter_declaration: string;
  student_loan_plan: string;
  postgraduate_loan: boolean;
  tax_basis: string;
  notes: string;
};

function getKey(): Buffer {
  const raw = process.env.UK_TAX_ENCRYPTION_KEY ?? '';
  if (!raw) throw new Error('UK_TAX_ENCRYPTION_KEY is required');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('UK_TAX_ENCRYPTION_KEY must be base64 for 32 bytes');
  return key;
}

export function encryptUkTaxDetails(payload: UkTaxPayload): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;
}

export function decryptUkTaxDetails(token: string): UkTaxPayload {
  const [ivB64, encryptedB64, tagB64] = token.split('.');
  if (!ivB64 || !encryptedB64 || !tagB64) throw new Error('Invalid encrypted payload format');
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as UkTaxPayload;
}

export function maskNiNumber(v: string): { masked: string; last2: string | null } {
  const clean = v.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 2) return { masked: '********', last2: null };
  const last2 = clean.slice(-2);
  return { masked: `******${last2}`, last2 };
}

export function maskTaxCode(v: string): { masked: string; last2: string | null } {
  const clean = v.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 2) return { masked: '****', last2: null };
  const last2 = clean.slice(-2);
  return { masked: `***${last2}`, last2 };
}
