/**
 * Server-side helpers that push CampSite entities into / out of Google Calendar.
 * All functions require a service-role SupabaseClient.
 * All functions are best-effort — failures are logged but not thrown.
 */

import { calendarDeleteEvent, calendarInsertPrimaryEvent, calendarPatchEvent } from '@/lib/google/googleCalendarApi';
import { getCalendarAccessTokenForUser } from '@/lib/interviews/calendarTokens';
import type { SupabaseClient } from '@supabase/supabase-js';

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Rota Shifts
// ---------------------------------------------------------------------------

export async function syncShiftToGoogle(admin: SupabaseClient, shiftId: string): Promise<void> {
  const { data: shift } = await admin
    .from('rota_shifts')
    .select('id, user_id, role_label, start_time, end_time, notes, google_event_id, organisations(name, timezone)')
    .eq('id', shiftId)
    .maybeSingle();

  if (!shift?.user_id) return;

  const token = await getCalendarAccessTokenForUser(admin, shift.user_id as string);
  if (!token) return;

  const org = (shift.organisations as { name?: string; timezone?: string } | null);
  const orgName = org?.name?.trim() || 'CampSite';
  const tz = org?.timezone?.trim() || 'UTC';
  const role = (shift.role_label as string | null)?.trim();
  const summary = role ? `[Shift] ${role} — ${orgName}` : `[Shift] ${orgName}`;
  const description = (shift.notes as string | null)?.trim() || `Scheduled shift at ${orgName}.`;

  try {
    if (shift.google_event_id) {
      await calendarPatchEvent(token, shift.google_event_id as string, {
        summary,
        description,
        start: { dateTime: shift.start_time as string, timeZone: tz },
        end: { dateTime: shift.end_time as string, timeZone: tz },
      });
    } else {
      const { id } = await calendarInsertPrimaryEvent(token, {
        summary,
        description,
        start: { dateTime: shift.start_time as string, timeZone: tz },
        end: { dateTime: shift.end_time as string, timeZone: tz },
      });
      await admin.from('rota_shifts').update({ google_event_id: id }).eq('id', shiftId);
    }
  } catch (e) {
    console.error('[google] shift upsert', shiftId, e);
  }
}

export async function deleteShiftFromGoogle(admin: SupabaseClient, shiftId: string): Promise<void> {
  const { data: shift } = await admin
    .from('rota_shifts')
    .select('user_id, google_event_id')
    .eq('id', shiftId)
    .maybeSingle();

  if (!shift?.user_id || !shift.google_event_id) return;

  const token = await getCalendarAccessTokenForUser(admin, shift.user_id as string);
  if (!token) return;

  try {
    await calendarDeleteEvent(token, shift.google_event_id as string);
  } catch (e) {
    console.error('[google] shift delete', shiftId, e);
  }
}

// ---------------------------------------------------------------------------
// Calendar Events (manual + broadcast)
// ---------------------------------------------------------------------------

export async function syncCalendarEventToGoogle(admin: SupabaseClient, eventId: string): Promise<void> {
  const { data: ev } = await admin
    .from('calendar_events')
    .select('id, title, description, start_time, end_time, all_day, created_by, organisations(timezone)')
    .eq('id', eventId)
    .maybeSingle();

  if (!ev?.created_by) return;

  const { data: attendeeRows } = await admin
    .from('calendar_event_attendees')
    .select('profile_id')
    .eq('event_id', eventId);

  const tz = ((ev.organisations as { timezone?: string } | null)?.timezone?.trim()) || 'UTC';
  const summary = (ev.title as string) || 'Event';
  const description = (ev.description as string | null)?.trim() || '';
  const allDay = ev.all_day as boolean;

  const startIso = ev.start_time as string;
  const endIso = (ev.end_time as string | null) ?? addHours(startIso, 1);
  const timedStart = { dateTime: startIso, timeZone: tz };
  const timedEnd = { dateTime: endIso, timeZone: tz };
  const allDayStart = { date: startIso.slice(0, 10) };
  const allDayEnd = { date: endIso.slice(0, 10) };

  // Collect all users: creator + attendees
  const profileIds = [...new Set([
    ev.created_by as string,
    ...((attendeeRows ?? []).map((r) => r.profile_id as string)),
  ])];

  // Fetch existing Google event IDs for this event
  const { data: existing } = await admin
    .from('calendar_event_google_events')
    .select('profile_id, event_id')
    .eq('calendar_event_id', eventId);
  const existingMap = new Map((existing ?? []).map((r) => [r.profile_id as string, r.event_id as string]));

  for (const profileId of profileIds) {
    const token = await getCalendarAccessTokenForUser(admin, profileId);
    if (!token) continue;
    try {
      const existingEventId = existingMap.get(profileId);
      if (existingEventId) {
        await calendarPatchEvent(token, existingEventId, {
          summary,
          description,
          start: allDay ? allDayStart : timedStart,
          end: allDay ? allDayEnd : timedEnd,
        });
      } else {
        const { id } = await calendarInsertPrimaryEvent(token, {
          summary,
          description,
          start: allDay ? allDayStart : timedStart,
          end: allDay ? allDayEnd : timedEnd,
        });
        await admin.from('calendar_event_google_events').upsert(
          { calendar_event_id: eventId, profile_id: profileId, event_id: id },
          { onConflict: 'calendar_event_id,profile_id' }
        );
      }
    } catch (e) {
      console.error('[google] calendar event upsert', eventId, profileId, e);
    }
  }
}

export async function deleteCalendarEventFromGoogle(admin: SupabaseClient, eventId: string): Promise<void> {
  const { data: rows } = await admin
    .from('calendar_event_google_events')
    .select('profile_id, event_id')
    .eq('calendar_event_id', eventId);

  for (const row of rows ?? []) {
    const token = await getCalendarAccessTokenForUser(admin, row.profile_id as string);
    if (!token) continue;
    try {
      await calendarDeleteEvent(token, row.event_id as string);
    } catch (e) {
      console.error('[google] calendar event delete', eventId, row.profile_id, e);
    }
  }
}

// ---------------------------------------------------------------------------
// 1:1 Meetings
// ---------------------------------------------------------------------------

export async function syncOneOnOneToGoogle(admin: SupabaseClient, meetingId: string): Promise<void> {
  const { data: mtg } = await admin
    .from('one_on_one_meetings')
    .select('id, manager_user_id, report_user_id, starts_at, ends_at, google_event_id_manager, google_event_id_report, organisations(timezone)')
    .eq('id', meetingId)
    .maybeSingle();

  if (!mtg?.manager_user_id || !mtg?.report_user_id) return;

  const tz = ((mtg.organisations as { timezone?: string } | null)?.timezone?.trim()) || 'UTC';
  const managerId = mtg.manager_user_id as string;
  const reportId = mtg.report_user_id as string;

  const startIso = mtg.starts_at as string;
  const endIso = (mtg.ends_at as string | null) ?? addHours(startIso, 1);

  const updates: Record<string, string> = {};

  for (const [uid, field, otherUserId] of [
    [managerId, 'google_event_id_manager', reportId],
    [reportId, 'google_event_id_report', managerId],
  ] as [string, string, string][]) {
    const token = await getCalendarAccessTokenForUser(admin, uid);
    if (!token) continue;

    const { data: otherProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', otherUserId)
      .maybeSingle();
    const otherName = (otherProfile?.full_name as string | null)?.trim() || 'Colleague';
    const summary = `1:1 check-in with ${otherName}`;
    const description = 'Scheduled 1:1 meeting via CampSite.';

    const existingId = mtg[field as keyof typeof mtg] as string | null;
    try {
      if (existingId) {
        await calendarPatchEvent(token, existingId, {
          summary,
          description,
          start: { dateTime: startIso, timeZone: tz },
          end: { dateTime: endIso, timeZone: tz },
        });
      } else {
        const { id } = await calendarInsertPrimaryEvent(token, {
          summary,
          description,
          start: { dateTime: startIso, timeZone: tz },
          end: { dateTime: endIso, timeZone: tz },
        });
        updates[field] = id;
      }
    } catch (e) {
      console.error('[google] 1:1 upsert', meetingId, uid, e);
    }
  }

  if (Object.keys(updates).length > 0) {
    await admin.from('one_on_one_meetings').update(updates).eq('id', meetingId);
  }
}

export async function deleteOneOnOneFromGoogle(admin: SupabaseClient, meetingId: string): Promise<void> {
  const { data: mtg } = await admin
    .from('one_on_one_meetings')
    .select('manager_user_id, report_user_id, google_event_id_manager, google_event_id_report')
    .eq('id', meetingId)
    .maybeSingle();

  if (!mtg) return;

  const pairs = [
    [mtg.manager_user_id, mtg.google_event_id_manager],
    [mtg.report_user_id, mtg.google_event_id_report],
  ] as [string, string | null][];

  for (const [uid, eventId] of pairs) {
    if (!uid || !eventId) continue;
    const token = await getCalendarAccessTokenForUser(admin, uid);
    if (!token) continue;
    try {
      await calendarDeleteEvent(token, eventId);
    } catch (e) {
      console.error('[google] 1:1 delete', meetingId, uid, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Approved Leave
// ---------------------------------------------------------------------------

export async function syncLeaveToGoogle(admin: SupabaseClient, leaveId: string): Promise<void> {
  const { data: leave } = await admin
    .from('leave_requests')
    .select('id, requester_id, kind, start_date, end_date, status, google_event_id, organisations(timezone)')
    .eq('id', leaveId)
    .maybeSingle();

  if (!leave?.requester_id) return;
  if ((leave.status as string) !== 'approved') {
    await deleteLeaveFromGoogle(admin, leaveId);
    return;
  }

  const token = await getCalendarAccessTokenForUser(admin, leave.requester_id as string);
  if (!token) return;

  const kind = ((leave.kind as string) || 'leave').replace('_', ' ');
  const startDate = leave.start_date as string;
  const endDate = leave.end_date as string;
  const summary = `Leave — ${kind.charAt(0).toUpperCase() + kind.slice(1)} (${startDate} to ${endDate})`;
  const description = 'Approved leave period via CampSite.';

  // All-day: Google Calendar uses exclusive end date for date-only events
  const start = { date: startDate };
  const end = { date: addDays(endDate, 1) };

  try {
    if (leave.google_event_id) {
      await calendarPatchEvent(token, leave.google_event_id as string, { summary, description, start, end });
    } else {
      const { id } = await calendarInsertPrimaryEvent(token, { summary, description, start, end });
      await admin.from('leave_requests').update({ google_event_id: id }).eq('id', leaveId);
    }
  } catch (e) {
    console.error('[google] leave upsert', leaveId, e);
  }
}

export async function deleteLeaveFromGoogle(admin: SupabaseClient, leaveId: string): Promise<void> {
  const { data: leave } = await admin
    .from('leave_requests')
    .select('requester_id, google_event_id')
    .eq('id', leaveId)
    .maybeSingle();

  if (!leave?.requester_id || !leave.google_event_id) return;

  const token = await getCalendarAccessTokenForUser(admin, leave.requester_id as string);
  if (!token) return;

  try {
    await calendarDeleteEvent(token, leave.google_event_id as string);
    await admin.from('leave_requests').update({ google_event_id: null }).eq('id', leaveId);
  } catch (e) {
    console.error('[google] leave delete', leaveId, e);
  }
}
