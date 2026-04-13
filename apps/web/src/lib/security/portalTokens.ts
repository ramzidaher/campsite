import { createHash, randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

function newPortalToken(): string {
  return `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueCandidatePortalToken(
  admin: SupabaseClient,
  args: { applicationId: string; orgId: string; ttlDays?: number }
): Promise<string> {
  const token = newPortalToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (args.ttlDays ?? 30)).toISOString();
  const { error } = await admin
    .from('job_applications')
    .update({
      portal_token_hash: hashToken(token),
      portal_token_expires_at: expiresAt,
      portal_token_revoked_at: null,
      portal_token_last_used_at: null,
      portal_token_use_count: 0,
      portal_token: null,
    })
    .eq('id', args.applicationId)
    .eq('org_id', args.orgId);
  if (error) throw new Error(error.message);
  return token;
}

export async function issueOfferSigningPortalToken(
  admin: SupabaseClient,
  args: { offerId: string; orgId: string; ttlDays?: number }
): Promise<string> {
  const token = newPortalToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (args.ttlDays ?? 14)).toISOString();
  const { error } = await admin
    .from('application_offers')
    .update({
      portal_token_hash: hashToken(token),
      portal_token_expires_at: expiresAt,
      portal_token_revoked_at: null,
      portal_token_last_used_at: null,
      portal_token_use_count: 0,
      portal_token: null,
    })
    .eq('id', args.offerId)
    .eq('org_id', args.orgId)
    .eq('status', 'sent');
  if (error) throw new Error(error.message);
  return token;
}
