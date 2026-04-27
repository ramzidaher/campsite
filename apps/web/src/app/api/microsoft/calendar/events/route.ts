import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getMicrosoftAccessTokenForUser } from '@/lib/microsoft/microsoftTokens';
import { NextResponse } from 'next/server';

type GraphEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  bodyPreview: string;
  isCancelled?: boolean;
};

export type OutlookCalendarEvent = {
  id: string;
  subject: string;
  start: string; // ISO
  end: string;   // ISO
  allDay: boolean;
  bodyPreview: string;
};

/** Returns the authenticated user's Outlook events for a date range. Returns [] if not connected. */
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

  const token = await getMicrosoftAccessTokenForUser(admin, user.id);
  if (!token) return NextResponse.json({ events: [] });

  // Graph calendarView returns events whose time interval overlaps [from, to].
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
  url.searchParams.set('startDateTime', from);
  url.searchParams.set('endDateTime', to);
  url.searchParams.set('$select', 'id,subject,start,end,isAllDay,bodyPreview,isCancelled');
  url.searchParams.set('$top', '200');
  url.searchParams.set('$orderby', 'start/dateTime');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Required header for calendarView with multi-timezone events
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[outlook] calendarView failed', res.status, err.slice(0, 200));
    return NextResponse.json({ events: [] });
  }

  const json = (await res.json()) as { value?: GraphEvent[] };
  const events: OutlookCalendarEvent[] = (json.value ?? [])
    .filter((e) => !e.isCancelled)
    .map((e) => ({
      id: e.id,
      subject: e.subject || '(No title)',
      start: e.start.dateTime.endsWith('Z') ? e.start.dateTime : `${e.start.dateTime}Z`,
      end: e.end.dateTime.endsWith('Z') ? e.end.dateTime : `${e.end.dateTime}Z`,
      allDay: e.isAllDay,
      bodyPreview: e.bodyPreview ?? '',
    }));

  return NextResponse.json({ events });
}
