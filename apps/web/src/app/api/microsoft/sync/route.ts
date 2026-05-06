import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  deleteCalendarEventFromOutlook,
  deleteLeaveFromOutlook,
  deleteOneOnOneFromOutlook,
  deleteShiftFromOutlook,
  syncCalendarEventToOutlook,
  syncLeaveToOutlook,
  syncOneOnOneToOutlook,
  syncShiftToOutlook,
} from '@/lib/microsoft/outlookEntitySync';
import { NextResponse } from 'next/server';

type SyncBody = {
  type: 'shift' | 'calendar-event' | 'one-on-one' | 'leave';
  id: string;
  action: 'upsert' | 'delete';
};

/** Fire-and-forget Outlook Calendar sync endpoint. Always returns 200. */
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
    return NextResponse.json({ ok: true }); // silently skip if service role not configured
  }

  // All sync operations are best-effort  never error the client
  try {
    if (type === 'shift') {
      if (action === 'delete') {
        await deleteShiftFromOutlook(admin, id);
      } else {
        await syncShiftToOutlook(admin, id);
      }
    } else if (type === 'calendar-event') {
      if (action === 'delete') {
        await deleteCalendarEventFromOutlook(admin, id);
      } else {
        await syncCalendarEventToOutlook(admin, id);
      }
    } else if (type === 'one-on-one') {
      if (action === 'delete') {
        await deleteOneOnOneFromOutlook(admin, id);
      } else {
        await syncOneOnOneToOutlook(admin, id);
      }
    } else if (type === 'leave') {
      if (action === 'delete') {
        await deleteLeaveFromOutlook(admin, id);
      } else {
        await syncLeaveToOutlook(admin, id);
      }
    }
  } catch (e) {
    console.error('[outlook sync]', type, action, id, e);
  }

  return NextResponse.json({ ok: true });
}
