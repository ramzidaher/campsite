/**
 * Minimal Google Calendar API v3 calls (events on primary calendar).
 * Caller supplies a valid OAuth access token (calendar.events scope).
 */

export type CalendarEventTime = {
  dateTime: string;
  timeZone: string;
};

export type CreateCalendarEventInput = {
  summary: string;
  description?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  attendees?: Array<{ email: string }>;
};

export async function calendarInsertPrimaryEvent(
  accessToken: string,
  body: CreateCalendarEventInput
): Promise<{ id: string }> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: body.summary,
      description: body.description ?? '',
      start: body.start,
      end: body.end,
      attendees: body.attendees?.length ? body.attendees : undefined,
    }),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? `Calendar insert failed (${res.status})`);
  }
  return { id: json.id };
}

export async function calendarPatchEvent(
  accessToken: string,
  eventId: string,
  patch: Partial<{
    summary: string;
    description: string;
    start: CalendarEventTime;
    end: CalendarEventTime;
    attendees: Array<{ email: string }>;
  }>
): Promise<void> {
  const enc = encodeURIComponent(eventId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(json.error?.message ?? `Calendar patch failed (${res.status})`);
  }
}

export async function calendarDeleteEvent(accessToken: string, eventId: string): Promise<void> {
  const enc = encodeURIComponent(eventId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Calendar delete failed (${res.status}): ${t.slice(0, 120)}`);
  }
}
