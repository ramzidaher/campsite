'use client';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

function mondayIso(d: Date): string {
  const c = new Date(d);
  const dow = c.getDay();
  const mon = dow === 0 ? -6 : 1 - dow;
  c.setDate(c.getDate() + mon);
  return c.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const c = new Date(iso + 'T12:00:00');
  c.setDate(c.getDate() + n);
  return c.toISOString().slice(0, 10);
}

export function AttendanceClockClient({
  orgId,
  userId,
  enabled,
}: {
  orgId: string;
  userId: string;
  enabled: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [weekStart, setWeekStart] = useState(() => mondayIso(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [events, setEvents] = useState<
    { id: string; clocked_at: string; direction: string; source: string }[]
  >([]);
  const [tsStatus, setTsStatus] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setErr(null);
    const [{ data: m }, { data: ev }, { data: ts }] = await Promise.all([
      supabase.rpc('attendance_week_total_minutes', {
        p_org_id: orgId,
        p_user_id: userId,
        p_week_start: weekStart,
        p_week_end: weekEnd,
      }),
      supabase
        .from('attendance_events')
        .select('id, clocked_at, direction, source')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .gte('clocked_at', `${weekStart}T00:00:00.000Z`)
        .lte('clocked_at', `${weekEnd}T23:59:59.999Z`)
        .order('clocked_at', { ascending: false })
        .limit(40),
      supabase
        .from('weekly_timesheets')
        .select('status')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('week_start_date', weekStart)
        .maybeSingle(),
    ]);
    setMinutes(typeof m === 'number' ? m : m != null ? Number(m) : null);
    setEvents((ev as typeof events) ?? []);
    setTsStatus((ts as { status?: string } | null)?.status ?? null);
  }, [orgId, userId, supabase, weekEnd, weekStart]);

  const invalidateAttendanceCaches = useCallback(async () => {
    await invalidateClientCaches({ scopes: ['attendance-self'] });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeClockInIso = useMemo(() => {
    const latest = events[0];
    if (!latest || latest.direction !== 'in') return null;
    return latest.clocked_at;
  }, [events]);

  useEffect(() => {
    if (!activeClockInIso) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeClockInIso]);

  const liveElapsedMs = useMemo(() => {
    if (!activeClockInIso) return 0;
    const diff = nowMs - new Date(activeClockInIso).getTime();
    return Math.max(0, diff);
  }, [activeClockInIso, nowMs]);

  const liveElapsedMinutes = useMemo(() => Math.floor(liveElapsedMs / 60000), [liveElapsedMs]);

  const displayMinutes = useMemo(() => {
    if (minutes == null) return null;
    return minutes + liveElapsedMinutes;
  }, [liveElapsedMinutes, minutes]);

  const liveDurationLabel = useMemo(() => {
    if (!activeClockInIso) return null;
    const totalSeconds = Math.floor(liveElapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutesPart = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutesPart).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }, [activeClockInIso, liveElapsedMs]);

  async function clock(direction: 'in' | 'out') {
    if (!enabled) return;
    setBusy(true);
    setErr(null);
    let lat: number | null = null;
    let lng: number | null = null;
    let acc: number | null = null;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        acc = pos.coords.accuracy;
      } catch {
        // Location is optional: when unavailable we still allow punch events.
      }
    }

    const { error } = await supabase.rpc('attendance_clock_event', {
      p_direction: direction,
      p_source: 'self_web',
      p_lat: lat,
      p_lng: lng,
      p_accuracy_m: acc,
      p_target_user_id: null,
      p_manager_reason: null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await invalidateAttendanceCaches().catch(() => null);
    await refresh();
  }

  async function submitWeek() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('weekly_timesheet_submit', { p_week_start: weekStart });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await invalidateAttendanceCaches().catch(() => null);
    await refresh();
  }

  if (!enabled) {
    return (
      <div className="rounded-lg border border-[#e8e4dc] bg-[#faf9f6] px-4 py-3 text-[13px] text-[#6b6b6b]">
        Clock in/out is not enabled on your HR record. Ask HR to turn on &quot;Timesheet clock&quot; and set your hourly
        rate.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {err ? (
        <p className="status-banner-error rounded-lg px-3 py-2 text-[13px]">{err}</p>
      ) : null}

      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Week starting</label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
        />
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          {weekStart} – {weekEnd} · Timesheet: {tsStatus ?? ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void clock('in')}
          className="rounded-xl bg-[#121212] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          Clock in
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void clock('out')}
          className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#121212] disabled:opacity-50"
        >
          Clock out
        </button>
      </div>
      <p className="text-[12px] text-[#6b6b6b]">
        Location is optional. If permitted, we attach it to your punch for attendance accuracy.
      </p>

      <div className="rounded-xl border border-[#e8e4dc] bg-white px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">This week (from punches)</p>
        <p className="mt-1 font-authSerif text-[22px] text-[#121212]">
          {displayMinutes != null ? `${Math.floor(displayMinutes / 60)}h ${displayMinutes % 60}m` : ''}
        </p>
      </div>

      {liveDurationLabel ? (
        <div className="rounded-xl border border-[#e8e4dc] bg-[#faf9f6] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Live timer</p>
          <p className="mt-1 font-authSerif text-[22px] text-[#121212]">{liveDurationLabel}</p>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          disabled={busy || tsStatus === 'submitted' || tsStatus === 'approved'}
          onClick={() => void submitWeek()}
          className="rounded-lg border border-[#121212] bg-[#faf9f6] px-4 py-2 text-[12.5px] font-medium text-[#121212] disabled:opacity-40"
        >
          Submit week for manager approval
        </button>
        <p className="mt-2 text-[12px] text-[#6b6b6b]">
          After submit, your manager can approve, edit hours, or reject. A wagesheet is generated when approved.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Recent punches</h2>
        <ul className="divide-y divide-[#eee] rounded-lg border border-[#e8e4dc]">
          {events.length === 0 ? (
            <li className="px-3 py-3 text-[13px] text-[#6b6b6b]">No punches this week.</li>
          ) : (
            events.map((e) => (
              <li key={e.id} className="flex justify-between px-3 py-2 text-[13px] text-[#121212]">
                <span className="capitalize">{e.direction}</span>
                <span className="text-[#6b6b6b]">
                  {new Date(e.clocked_at).toLocaleString()} · {e.source.replace('_', ' ')}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
