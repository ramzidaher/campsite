/**
 * Server-side helpers that push CampSite entities into / out of Outlook Calendar.
 * All functions require a service-role SupabaseClient.
 * All functions are best-effort  failures are logged but not thrown.
 */

import { graphDeleteEvent, graphInsertEvent, graphPatchEvent } from '@/lib/microsoft/graphApi';
import { getMicrosoftAccessTokenForUser } from '@/lib/microsoft/microsoftTokens';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Rota Shifts
// ---------------------------------------------------------------------------

export async function syncShiftToOutlook(admin: SupabaseClient, shiftId: string): Promise<void> {
  const { data: shift } = await admin
    .from('rota_shifts')
    .select('id, user_id, role_label, start_time, end_time, notes, outlook_event_id, organisations(name, timezone)')
    .eq('id', shiftId)
    .maybeSingle();

  if (!shift?.user_id) return;

  const token = await getMicrosoftAccessTokenForUser(admin, shift.user_id as string);
  if (!token) return;

  const org = (shift.organisations as { name?: string; timezone?: string } | null);
  const orgName = org?.name?.trim() || 'CampSite';
  const tz = org?.timezone?.trim() || 'UTC';
  const role = (shift.role_label as string | null)?.trim();
  const subject = role ? `[Shift] ${role}  ${orgName}` : `[Shift] ${orgName}`;
  const content = (shift.notes as string | null)?.trim() || `Scheduled shift at ${orgName}.`;
  const start = { dateTime: (shift.start_time as string).replace('Z', ''), timeZone: tz };
  const end = { dateTime: (shift.end_time as string).replace('Z', ''), timeZone: tz };

  try {
    if (shift.outlook_event_id) {
      await graphPatchEvent(token, shift.outlook_event_id as string, { subject, content, start, end });
    } else {
      const { id } = await graphInsertEvent(token, { subject, content, start, end });
      await admin.from('rota_shifts').update({ outlook_event_id: id }).eq('id', shiftId);
    }
  } catch (e) {
    console.error('[outlook] shift upsert', shiftId, e);
  }
}

export async function deleteShiftFromOutlook(admin: SupabaseClient, shiftId: string): Promise<void> {
  const { data: shift } = await admin
    .from('rota_shifts')
    .select('user_id, outlook_event_id')
    .eq('id', shiftId)
    .maybeSingle();

  if (!shift?.user_id || !shift.outlook_event_id) return;

  const token = await getMicrosoftAccessTokenForUser(admin, shift.user_id as string);
  if (!token) return;

  try {
    await graphDeleteEvent(token, shift.outlook_event_id as string);
  } catch (e) {
    console.error('[outlook] shift delete', shiftId, e);
  }
}

// ---------------------------------------------------------------------------
// Calendar Events (manual + broadcast)
// ---------------------------------------------------------------------------

export async function syncCalendarEventToOutlook(admin: SupabaseClient, eventId: string): Promise<void> {
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
  const subject = (ev.title as string) || 'Event';
  const content = (ev.description as string | null)?.trim() || '';
  const allDay = ev.all_day as boolean;

  const startIso = ev.start_time as string;
  const endIso = (ev.end_time as string | null) ?? new Date(new Date(startIso).getTime() + 3600000).toISOString();

  const start = { dateTime: startIso.replace('Z', ''), timeZone: tz };
  const end = { dateTime: endIso.replace('Z', ''), timeZone: tz };

  // Collect all users: creator + attendees
  const profileIds = [...new Set([
    ev.created_by as string,
    ...((attendeeRows ?? []).map((r) => r.profile_id as string)),
  ])];

  // Fetch existing outlook event IDs for this event
  const { data: existing } = await admin
    .from('calendar_event_outlook_events')
    .select('profile_id, event_id')
    .eq('calendar_event_id', eventId);
  const existingMap = new Map((existing ?? []).map((r) => [r.profile_id as string, r.event_id as string]));

  for (const profileId of profileIds) {
    const token = await getMicrosoftAccessTokenForUser(admin, profileId);
    if (!token) continue;
    try {
      const existingEventId = existingMap.get(profileId);
      if (existingEventId) {
        await graphPatchEvent(token, existingEventId, { subject, content, start, end });
      } else {
        const body = allDay
          ? { subject, content, start: { dateTime: startIso.split('T')[0] + 'T00:00:00', timeZone: tz }, end: { dateTime: endIso.split('T')[0] + 'T00:00:00', timeZone: tz } }
          : { subject, content, start, end };
        const { id } = await graphInsertEvent(token, body);
        await admin.from('calendar_event_outlook_events').upsert(
          { calendar_event_id: eventId, profile_id: profileId, event_id: id },
          { onConflict: 'calendar_event_id,profile_id' }
        );
      }
    } catch (e) {
      console.error('[outlook] calendar event upsert', eventId, profileId, e);
    }
  }
}

export async function deleteCalendarEventFromOutlook(admin: SupabaseClient, eventId: string): Promise<void> {
  const { data: rows } = await admin
    .from('calendar_event_outlook_events')
    .select('profile_id, event_id')
    .eq('calendar_event_id', eventId);

  for (const row of rows ?? []) {
    const token = await getMicrosoftAccessTokenForUser(admin, row.profile_id as string);
    if (!token) continue;
    try {
      await graphDeleteEvent(token, row.event_id as string);
    } catch (e) {
      console.error('[outlook] calendar event delete', eventId, row.profile_id, e);
    }
  }
}

// ---------------------------------------------------------------------------
// 1:1 Meetings
// ---------------------------------------------------------------------------

export async function syncOneOnOneToOutlook(admin: SupabaseClient, meetingId: string): Promise<void> {
  const { data: mtg } = await admin
    .from('one_on_one_meetings')
    .select('id, manager_user_id, report_user_id, starts_at, ends_at, outlook_event_id_manager, outlook_event_id_report, profiles!one_on_one_meetings_manager_user_id_fkey(full_name), organisations(timezone)')
    .eq('id', meetingId)
    .maybeSingle();

  if (!mtg?.manager_user_id || !mtg?.report_user_id) return;

  const tz = ((mtg.organisations as { timezone?: string } | null)?.timezone?.trim()) || 'UTC';
  const managerId = mtg.manager_user_id as string;
  const reportId = mtg.report_user_id as string;

  const startIso = mtg.starts_at as string;
  const endIso = (mtg.ends_at as string | null) ?? new Date(new Date(startIso).getTime() + 3600000).toISOString();
  const start = { dateTime: startIso.replace('Z', ''), timeZone: tz };
  const end = { dateTime: endIso.replace('Z', ''), timeZone: tz };

  const updates: Record<string, string> = {};

  for (const [uid, field, otherUserId] of [
    [managerId, 'outlook_event_id_manager', reportId],
    [reportId, 'outlook_event_id_report', managerId],
  ] as [string, string, string][]) {
    const token = await getMicrosoftAccessTokenForUser(admin, uid);
    if (!token) continue;

    const { data: otherProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', otherUserId)
      .maybeSingle();
    const otherName = (otherProfile?.full_name as string | null)?.trim() || 'Colleague';
    const subject = `1:1 check-in with ${otherName}`;
    const content = 'Scheduled 1:1 meeting via CampSite.';

    const existingId = mtg[field as keyof typeof mtg] as string | null;
    try {
      if (existingId) {
        await graphPatchEvent(token, existingId, { subject, content, start, end });
      } else {
        const { id } = await graphInsertEvent(token, { subject, content, start, end });
        updates[field] = id;
      }
    } catch (e) {
      console.error('[outlook] 1:1 upsert', meetingId, uid, e);
    }
  }

  if (Object.keys(updates).length > 0) {
    await admin.from('one_on_one_meetings').update(updates).eq('id', meetingId);
  }
}

export async function deleteOneOnOneFromOutlook(admin: SupabaseClient, meetingId: string): Promise<void> {
  const { data: mtg } = await admin
    .from('one_on_one_meetings')
    .select('manager_user_id, report_user_id, outlook_event_id_manager, outlook_event_id_report')
    .eq('id', meetingId)
    .maybeSingle();

  if (!mtg) return;

  const pairs = [
    [mtg.manager_user_id, mtg.outlook_event_id_manager],
    [mtg.report_user_id, mtg.outlook_event_id_report],
  ] as [string, string | null][];

  for (const [uid, eventId] of pairs) {
    if (!uid || !eventId) continue;
    const token = await getMicrosoftAccessTokenForUser(admin, uid);
    if (!token) continue;
    try {
      await graphDeleteEvent(token, eventId);
    } catch (e) {
      console.error('[outlook] 1:1 delete', meetingId, uid, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Approved Leave
// ---------------------------------------------------------------------------

export async function syncLeaveToOutlook(admin: SupabaseClient, leaveId: string): Promise<void> {
  const { data: leave } = await admin
    .from('leave_requests')
    .select('id, requester_id, kind, start_date, end_date, status, outlook_event_id, organisations(name, timezone)')
    .eq('id', leaveId)
    .maybeSingle();

  if (!leave?.requester_id) return;
  if ((leave.status as string) !== 'approved') {
    await deleteLeaveFromOutlook(admin, leaveId);
    return;
  }

  const token = await getMicrosoftAccessTokenForUser(admin, leave.requester_id as string);
  if (!token) return;

  const org = (leave.organisations as { name?: string; timezone?: string } | null);
  const tz = org?.timezone?.trim() || 'UTC';
  const kind = ((leave.kind as string) || 'leave').replace('_', ' ');
  const startDate = leave.start_date as string;
  const endDate = leave.end_date as string;
  const subject = `Leave  ${kind.charAt(0).toUpperCase() + kind.slice(1)} (${startDate} to ${endDate})`;
  const content = `Approved leave period via CampSite.`;

  // All-day event: Graph uses exclusive end date for all-day events
  const endExclusive = new Date(endDate);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const start = { dateTime: `${startDate}T00:00:00`, timeZone: tz };
  const end = { dateTime: `${endExclusive.toISOString().split('T')[0]}T00:00:00`, timeZone: tz };

  try {
    if (leave.outlook_event_id) {
      await graphPatchEvent(token, leave.outlook_event_id as string, { subject, content, start, end });
    } else {
      const { id } = await graphInsertEvent(token, { subject, content, start, end });
      await admin.from('leave_requests').update({ outlook_event_id: id }).eq('id', leaveId);
    }
  } catch (e) {
    console.error('[outlook] leave upsert', leaveId, e);
  }
}

export async function deleteLeaveFromOutlook(admin: SupabaseClient, leaveId: string): Promise<void> {
  const { data: leave } = await admin
    .from('leave_requests')
    .select('requester_id, outlook_event_id')
    .eq('id', leaveId)
    .maybeSingle();

  if (!leave?.requester_id || !leave.outlook_event_id) return;

  const token = await getMicrosoftAccessTokenForUser(admin, leave.requester_id as string);
  if (!token) return;

  try {
    await graphDeleteEvent(token, leave.outlook_event_id as string);
    await admin.from('leave_requests').update({ outlook_event_id: null }).eq('id', leaveId);
  } catch (e) {
    console.error('[outlook] leave delete', leaveId, e);
  }
}
