import type { SupabaseClient } from '@supabase/supabase-js';

import { calendarEventForWeekLayout } from '@/lib/rota/weekGridLayout';

export type RotaCalendarBusyBlock = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
};

type RawEv = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
};

function toBlock(row: RawEv): RotaCalendarBusyBlock | null {
  const lay = calendarEventForWeekLayout(row);
  if (!lay) return null;
  return { id: lay.id, title: row.title, start_time: lay.start_time, end_time: lay.end_time };
}

/**
 * Busy blocks from org calendar for the signed-in user: events they created, plus events
 * they are invited to (non-declined). Excludes `calendar_events.shift_id` rows (mirrors rota shifts).
 */
export async function loadMyCalendarBusyForRotaWeek(
  supabase: SupabaseClient,
  args: { orgId: string; profileId: string; fromIso: string; toIso: string },
): Promise<RotaCalendarBusyBlock[]> {
  const { orgId, profileId, fromIso, toIso } = args;

  const [createdRes, attRes] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('id,title,start_time,end_time,all_day,source,shift_id')
      .eq('org_id', orgId)
      .eq('created_by', profileId)
      .is('shift_id', null)
      .in('source', ['broadcast', 'manual'])
      .gte('start_time', fromIso)
      .lt('start_time', toIso),
    supabase
      .from('calendar_event_attendees')
      .select('event_id,status')
      .eq('org_id', orgId)
      .eq('profile_id', profileId)
      .in('status', ['invited', 'accepted', 'tentative']),
  ]);

  if (createdRes.error) console.error(createdRes.error);
  if (attRes.error) console.error(attRes.error);

  const merged = new Map<string, RawEv>();

  for (const r of createdRes.data ?? []) {
    merged.set(r.id as string, {
      id: r.id as string,
      title: r.title as string,
      start_time: r.start_time as string,
      end_time: (r.end_time as string | null) ?? null,
      all_day: !!(r.all_day as boolean),
    });
  }

  const attendeeIds = [...new Set((attRes.data ?? []).map((x) => x.event_id as string))];
  if (attendeeIds.length > 0) {
    const { data: attEvs, error: attEvErr } = await supabase
      .from('calendar_events')
      .select('id,title,start_time,end_time,all_day,source,shift_id')
      .eq('org_id', orgId)
      .in('id', attendeeIds)
      .is('shift_id', null)
      .in('source', ['broadcast', 'manual'])
      .gte('start_time', fromIso)
      .lt('start_time', toIso);
    if (attEvErr) console.error(attEvErr);
    for (const r of attEvs ?? []) {
      const id = r.id as string;
      if (!merged.has(id)) {
        merged.set(id, {
          id,
          title: r.title as string,
          start_time: r.start_time as string,
          end_time: (r.end_time as string | null) ?? null,
          all_day: !!(r.all_day as boolean),
        });
      }
    }
  }

  const out: RotaCalendarBusyBlock[] = [];
  for (const row of merged.values()) {
    const b = toBlock(row);
    if (b) out.push(b);
  }
  out.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  return out;
}
