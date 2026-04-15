/**
 * Re-encrypts employee_medical_notes.encrypted_sensitive_payload from OLD key to NEW key.
 *
 * Required environment:
 * - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY
 * - MEDICAL_NOTES_ENCRYPTION_KEY_OLD
 * - MEDICAL_NOTES_ENCRYPTION_KEY_NEW
 *
 * Optional:
 * - ROTATE_EXECUTE=true
 * - ROTATE_ORG_ID=<uuid>
 * - ROTATE_LIMIT=<number>
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  const p = join(root, '.env');
  if (!existsSync(p)) return;
  const s = readFileSync(p, 'utf8');
  for (const line of s.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function getKey(name) {
  const raw = process.env[name] || '';
  if (!raw) throw new Error(`Missing ${name}`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`${name} must decode to 32 bytes`);
  return key;
}

function decryptWithKey(token, key) {
  const [ivB64, encryptedB64, tagB64] = String(token).split('.');
  if (!ivB64 || !encryptedB64 || !tagB64) throw new Error('Invalid encrypted payload format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function encryptWithKey(payload, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;
}

async function main() {
  loadDotEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const execute = String(process.env.ROTATE_EXECUTE || '').toLowerCase() === 'true';
  const orgId = (process.env.ROTATE_ORG_ID || '').trim();
  const limit = Number(process.env.ROTATE_LIMIT || 0);

  if (!url || !serviceRole) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const oldKey = getKey('MEDICAL_NOTES_ENCRYPTION_KEY_OLD');
  const newKey = getKey('MEDICAL_NOTES_ENCRYPTION_KEY_NEW');
  if (oldKey.equals(newKey)) throw new Error('Old and new keys are identical. Rotation aborted.');

  const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  let query = supabase
    .from('employee_medical_notes')
    .select('id, org_id, encrypted_sensitive_payload')
    .order('created_at', { ascending: true });
  if (orgId) query = query.eq('org_id', orgId);
  if (limit > 0) query = query.limit(limit);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const list = rows || [];
  if (list.length === 0) return console.log('No rows found to rotate.');

  console.log(`Found ${list.length} medical-note rows${orgId ? ` for org ${orgId}` : ''}.`);
  console.log(execute ? 'Mode: EXECUTE' : 'Mode: DRY-RUN');

  for (const row of list) decryptWithKey(row.encrypted_sensitive_payload, oldKey);
  console.log('Pre-flight check passed: all rows decrypt with old key.');
  if (!execute) return console.log('Dry run complete. Set ROTATE_EXECUTE=true to perform re-encryption.');

  let updated = 0;
  for (const row of list) {
    const payload = decryptWithKey(row.encrypted_sensitive_payload, oldKey);
    const reEncrypted = encryptWithKey(payload, newKey);
    decryptWithKey(reEncrypted, newKey);
    const { error: upErr } = await supabase
      .from('employee_medical_notes')
      .update({ encrypted_sensitive_payload: reEncrypted })
      .eq('id', row.id)
      .eq('org_id', row.org_id);
    if (upErr) throw new Error(`Update failed at row ${row.id}: ${upErr.message}`);
    updated += 1;
  }

  console.log(`Rotation complete. Updated ${updated}/${list.length} rows.`);
  console.log('Next step: set MEDICAL_NOTES_ENCRYPTION_KEY to the NEW key in all environments and redeploy.');
}

main().catch((e) => {
  console.error('Rotation failed:', e.message || e);
  process.exit(1);
});
