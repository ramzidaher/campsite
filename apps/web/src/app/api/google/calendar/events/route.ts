import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getCalendarAccessTokenForUser } from '@/lib/interviews/calendarTokens';
import { NextResponse } from 'next/server';

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  subject: string;
  start: string;
  end: string;
  allDay: boolean;
  bodyPreview: string;
};

function googleEventToIso(value: string | undefined, allDay: boolean): string {
  if (!value) return '';
  return allDay ? `${value}T00:00:00` : value;
}

/** Returns the authenticated user's Google Calendar events for a date range. Returns [] if not connected. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ events: [] });

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ events: [] });
  }

  const token = await getCalendarAccessTokenForUser(admin, user.id);
  if (!token) return NextResponse.json({ events: [] });

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', from);
  url.searchParams.set('timeMax', to);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '200');
  url.searchParams.set('fields', 'items(id,summary,description,start,end,status)');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[google] events list failed', res.status, err.slice(0, 200));
    return NextResponse.json({ events: [] });
  }

  const json = (await res.json()) as { items?: GoogleEvent[] };
  const events: GoogleCalendarEvent[] = (json.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => {
      const allDay = !e.start.dateTime;
      const startRaw = googleEventToIso(e.start.dateTime ?? e.start.date, allDay);
      const endRaw = googleEventToIso(e.end.dateTime ?? e.end.date, allDay);
      return {
        id: e.id,
        subject: e.summary?.trim() || '(No title)',
        start: startRaw,
        end: endRaw,
        allDay,
        bodyPreview: e.description?.slice(0, 200) ?? '',
      };
    });

  return NextResponse.json({ events });
}
