import { graphDeleteEvent, graphInsertEvent, graphPatchEvent } from '@/lib/microsoft/graphApi';
import type { SupabaseClient } from '@supabase/supabase-js';

async function refreshMicrosoftAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? process.env.TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft OAuth env vars not configured.');
  }

  const res = await fetch(
    `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'Calendars.ReadWrite offline_access',
      }),
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Microsoft token refresh failed (${res.status}): ${t.slice(0, 120)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!json.access_token) {
    throw new Error(json.error ?? 'No access_token in Microsoft refresh response.');
  }
  return { access_token: json.access_token, expires_in: json.expires_in ?? 3600 };
}

/**
 * Returns a valid Microsoft Graph access token for `userId` using service-role DB reads.
 * Refreshes the OAuth token and persists the new access_token / expires_at when needed.
 */
export async function getMicrosoftAccessTokenForUser(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: row } = await admin
    .from('microsoft_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row?.refresh_token) return null;

  const expMs = row.expires_at ? new Date(row.expires_at as string).getTime() : 0;
  if (expMs > Date.now() + 90_000 && row.access_token) {
    return row.access_token as string;
  }

  try {
    const { access_token, expires_in } = await refreshMicrosoftAccessToken(row.refresh_token as string);
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    await admin
      .from('microsoft_connections')
      .update({ access_token, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return access_token;
  } catch {
    return null;
  }
}

export async function createInterviewSlotOutlookEventsForPanelists(opts: {
  admin: SupabaseClient;
  panelistUserIds: string[];
  timeZone: string;
  startsAtIso: string;
  endsAtIso: string;
  subject: string;
  content: string;
}): Promise<Array<{ profileId: string; eventId: string }>> {
  const out: Array<{ profileId: string; eventId: string }> = [];
  for (const profileId of opts.panelistUserIds) {
    const token = await getMicrosoftAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    try {
      const { id } = await graphInsertEvent(token, {
        subject: opts.subject,
        content: opts.content,
        start: { dateTime: opts.startsAtIso.replace('Z', ''), timeZone: opts.timeZone },
        end: { dateTime: opts.endsAtIso.replace('Z', ''), timeZone: opts.timeZone },
      });
      out.push({ profileId, eventId: id });
    } catch (e) {
      console.error('[outlook] insert event for', profileId, e);
    }
  }
  return out;
}

export async function patchInterviewOutlookEventsBooked(opts: {
  admin: SupabaseClient;
  events: Array<{ profileId: string; eventId: string }>;
  timeZone: string;
  startsAtIso: string;
  endsAtIso: string;
  subject: string;
  content: string;
  candidateEmail: string;
}): Promise<void> {
  for (const { profileId, eventId } of opts.events) {
    const token = await getMicrosoftAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    try {
      await graphPatchEvent(token, eventId, {
        subject: opts.subject,
        content: opts.content,
        start: { dateTime: opts.startsAtIso.replace('Z', ''), timeZone: opts.timeZone },
        end: { dateTime: opts.endsAtIso.replace('Z', ''), timeZone: opts.timeZone },
        attendees: opts.candidateEmail ? [{ address: opts.candidateEmail }] : [],
      });
    } catch (e) {
      console.error('[outlook] patch booked event for', profileId, e);
    }
  }
}

export async function patchInterviewOutlookEventsCompleted(opts: {
  admin: SupabaseClient;
  events: Array<{ profileId: string; eventId: string }>;
  subject: string;
}): Promise<void> {
  for (const { profileId, eventId } of opts.events) {
    const token = await getMicrosoftAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    try {
      await graphPatchEvent(token, eventId, { subject: opts.subject });
    } catch (e) {
      console.error('[outlook] patch completed event for', profileId, e);
    }
  }
}

export async function deleteInterviewOutlookCalendarEvents(opts: {
  admin: SupabaseClient;
  events: Array<{ profileId: string; eventId: string }>;
}): Promise<void> {
  for (const { profileId, eventId } of opts.events) {
    const token = await getMicrosoftAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    try {
      await graphDeleteEvent(token, eventId);
    } catch {
      /* non-fatal */
    }
  }
}
