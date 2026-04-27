/**
 * Minimal Microsoft Graph API calls for Outlook Calendar (primary calendar).
 * Caller supplies a valid delegated OAuth access token (Calendars.ReadWrite scope).
 */

export type GraphEventTime = {
  dateTime: string; // ISO-8601, no trailing Z — Graph interprets via timeZone
  timeZone: string; // IANA or Windows tz name
};

export type CreateGraphEventInput = {
  subject: string;
  content?: string;
  start: GraphEventTime;
  end: GraphEventTime;
  attendees?: Array<{ address: string; name?: string }>;
};

export async function graphInsertEvent(
  accessToken: string,
  body: CreateGraphEventInput
): Promise<{ id: string }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: body.subject,
      body: { contentType: 'Text', content: body.content ?? '' },
      start: body.start,
      end: body.end,
      attendees: body.attendees?.length
        ? body.attendees.map((a) => ({
            emailAddress: { address: a.address, name: a.name ?? a.address },
            type: 'required',
          }))
        : undefined,
    }),
  });

  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? `Graph insert failed (${res.status})`);
  }
  return { id: json.id };
}

export async function graphPatchEvent(
  accessToken: string,
  eventId: string,
  patch: Partial<{
    subject: string;
    content: string;
    start: GraphEventTime;
    end: GraphEventTime;
    attendees: Array<{ address: string; name?: string }>;
  }>
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.subject !== undefined) body.subject = patch.subject;
  if (patch.content !== undefined) body.body = { contentType: 'Text', content: patch.content };
  if (patch.start !== undefined) body.start = patch.start;
  if (patch.end !== undefined) body.end = patch.end;
  if (patch.attendees !== undefined) {
    body.attendees = patch.attendees.map((a) => ({
      emailAddress: { address: a.address, name: a.name ?? a.address },
      type: 'required',
    }));
  }

  const enc = encodeURIComponent(eventId);
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${enc}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(json.error?.message ?? `Graph patch failed (${res.status})`);
  }
}

export async function graphDeleteEvent(accessToken: string, eventId: string): Promise<void> {
  const enc = encodeURIComponent(eventId);
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${enc}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Graph delete failed (${res.status}): ${t.slice(0, 120)}`);
  }
}
