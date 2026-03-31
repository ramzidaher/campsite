import { calendarDeleteEvent, calendarInsertPrimaryEvent, calendarPatchEvent } from '@/lib/google/googleCalendarApi';
import { refreshGoogleAccessToken } from '@/lib/google/googleSheetsAccess';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns a valid Google Calendar access token for `userId` using service-role DB reads.
 * Refreshes OAuth token and persists new `access_token` / `expires_at` when needed.
 */
export async function getCalendarAccessTokenForUser(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: row } = await admin
    .from('google_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('type', 'calendar')
    .maybeSingle();

  if (!row?.refresh_token) return null;

  const expMs = row.expires_at ? new Date(row.expires_at as string).getTime() : 0;
  if (expMs > Date.now() + 90_000 && row.access_token) {
    return row.access_token as string;
  }

  try {
    const { access_token, expires_in } = await refreshGoogleAccessToken(row.refresh_token as string);
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    await admin
      .from('google_connections')
      .update({
        access_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('type', 'calendar');
    return access_token;
  } catch {
    return null;
  }
}

export async function createInterviewSlotEventsForPanelists(opts: {
  admin: SupabaseClient;
  panelistUserIds: string[];
  timeZone: string;
  startsAtIso: string;
  endsAtIso: string;
  summary: string;
  description: string;
}): Promise<Array<{ profileId: string; eventId: string }>> {
  const out: Array<{ profileId: string; eventId: string }> = [];
  for (const profileId of opts.panelistUserIds) {
    const token = await getCalendarAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    const { id } = await calendarInsertPrimaryEvent(token, {
      summary: opts.summary,
      description: opts.description,
      start: { dateTime: opts.startsAtIso, timeZone: opts.timeZone },
      end: { dateTime: opts.endsAtIso, timeZone: opts.timeZone },
    });
    out.push({ profileId, eventId: id });
  }
  return out;
}

export async function patchInterviewEventsBooked(opts: {
  admin: SupabaseClient;
  events: Array<{ profileId: string; eventId: string }>;
  timeZone: string;
  startsAtIso: string;
  endsAtIso: string;
  summary: string;
  description: string;
  candidateEmail: string;
}): Promise<void> {
  for (const { profileId, eventId } of opts.events) {
    const token = await getCalendarAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    await calendarPatchEvent(token, eventId, {
      summary: opts.summary,
      description: opts.description,
      start: { dateTime: opts.startsAtIso, timeZone: opts.timeZone },
      end: { dateTime: opts.endsAtIso, timeZone: opts.timeZone },
      attendees: [{ email: opts.candidateEmail }],
    });
  }
}

export async function patchInterviewEventsCompleted(opts: {
  admin: SupabaseClient;
  events: Array<{ profileId: string; eventId: string }>;
  summary: string;
}): Promise<void> {
  for (const { profileId, eventId } of opts.events) {
    const token = await getCalendarAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    await calendarPatchEvent(token, eventId, { summary: opts.summary });
  }
}

export async function deleteInterviewCalendarEvents(opts: {
  admin: SupabaseClient;
  events: Array<{ profileId: string; eventId: string }>;
}): Promise<void> {
  for (const { profileId, eventId } of opts.events) {
    const token = await getCalendarAccessTokenForUser(opts.admin, profileId);
    if (!token) continue;
    try {
      await calendarDeleteEvent(token, eventId);
    } catch {
      /* ignore */
    }
  }
}
