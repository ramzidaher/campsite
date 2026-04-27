import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  deleteCalendarEventFromGoogle,
  deleteLeaveFromGoogle,
  deleteOneOnOneFromGoogle,
  deleteShiftFromGoogle,
  syncCalendarEventToGoogle,
  syncLeaveToGoogle,
  syncOneOnOneToGoogle,
  syncShiftToGoogle,
} from '@/lib/google/googleEntitySync';
import { NextResponse } from 'next/server';

type SyncBody = {
  type: 'shift' | 'calendar-event' | 'one-on-one' | 'leave';
  id: string;
  action: 'upsert' | 'delete';
};

/** Fire-and-forget Google Calendar sync endpoint. Always returns 200. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: SyncBody;
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { type, id, action } = body;
  if (!type || !id || !action) return NextResponse.json({ ok: false }, { status: 400 });

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (type === 'shift') {
      if (action === 'delete') {
        await deleteShiftFromGoogle(admin, id);
      } else {
        await syncShiftToGoogle(admin, id);
      }
    } else if (type === 'calendar-event') {
      if (action === 'delete') {
        await deleteCalendarEventFromGoogle(admin, id);
      } else {
        await syncCalendarEventToGoogle(admin, id);
      }
    } else if (type === 'one-on-one') {
      if (action === 'delete') {
        await deleteOneOnOneFromGoogle(admin, id);
      } else {
        await syncOneOnOneToGoogle(admin, id);
      }
    } else if (type === 'leave') {
      if (action === 'delete') {
        await deleteLeaveFromGoogle(admin, id);
      } else {
        await syncLeaveToGoogle(admin, id);
      }
    }
  } catch (e) {
    console.error('[google sync]', type, action, id, e);
  }

  return NextResponse.json({ ok: true });
}
