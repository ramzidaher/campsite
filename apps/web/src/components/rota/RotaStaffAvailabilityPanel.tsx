'use client';

import { createClient } from '@/lib/supabase/client';
import { addWeeks, startOfWeekMonday } from '@/lib/datetime';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { localYmd } from '@/lib/rota/weekGridLayout';
import { useCallback, useEffect, useMemo, useState } from 'react';

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type TemplateDraft = { weekday: number; start: string; end: string };
type OverrideRow = { id: string; on_date: string; start_time: string; end_time: string };

function toTimeInputValue(pgTime: string): string {
  const t = pgTime?.trim() ?? '';
  if (t.length >= 5) return t.slice(0, 5);
  return '09:00';
}

function daysInWeek(weekStart: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    out.push(d);
  }
  return out;
}

export function RotaStaffAvailabilityPanel({
  profileId,
  orgId,
}: {
  profileId: string;
  orgId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [overrideWeekStart, setOverrideWeekStart] = useState(() => startOfWeekMonday(new Date()));

  const [templateRows, setTemplateRows] = useState<TemplateDraft[]>([]);
  const [overrideRows, setOverrideRows] = useState<OverrideRow[]>([]);

  const reloadTemplate = useCallback(async () => {
    const { data, error } = await supabase
      .from('rota_staff_availability_template')
      .select('weekday,start_time,end_time')
      .eq('org_id', orgId)
      .eq('user_id', profileId)
      .order('weekday');
    if (error) {
      console.error(error);
      setTemplateRows([]);
      return;
    }
    const rows = (data ?? []) as { weekday: number; start_time: string; end_time: string }[];
    if (rows.length === 0) {
      setTemplateRows([]);
    } else {
      setTemplateRows(
        rows.map((r) => ({
          weekday: r.weekday,
          start: toTimeInputValue(r.start_time),
          end: toTimeInputValue(r.end_time),
        })),
      );
    }
  }, [supabase, orgId, profileId]);

  const reloadOverrides = useCallback(async () => {
    const mon = overrideWeekStart;
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const from = localYmd(mon);
    const to = localYmd(sun);
    const { data, error } = await supabase
      .from('rota_staff_availability_override')
      .select('id,on_date,start_time,end_time')
      .eq('org_id', orgId)
      .eq('user_id', profileId)
      .gte('on_date', from)
      .lte('on_date', to)
      .order('on_date');
    if (error) {
      console.error(error);
      setOverrideRows([]);
      return;
    }
    setOverrideRows((data ?? []) as OverrideRow[]);
  }, [supabase, orgId, profileId, overrideWeekStart]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await reloadTemplate();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTemplate]);

  useEffect(() => {
    void reloadOverrides();
  }, [reloadOverrides]);

  function setDayTemplate(day: number, fn: (rows: TemplateDraft[]) => TemplateDraft[]) {
    setTemplateRows((prev) => {
      const other = prev.filter((r) => r.weekday !== day);
      const nextDay = fn(prev.filter((r) => r.weekday === day));
      return [...other, ...nextDay].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
    });
  }

  async function saveTemplate() {
    setMsg(null);
    setSavingTemplate(true);
    try {
      for (const r of templateRows) {
        if (r.start >= r.end) {
          setMsg('Each template row needs end time after start time.');
          return;
        }
      }
      const { error: delErr } = await supabase
        .from('rota_staff_availability_template')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', profileId);
      if (delErr) {
        setMsg(friendlyDbError(delErr.message));
        return;
      }
      if (templateRows.length > 0) {
        const { error: insErr } = await supabase.from('rota_staff_availability_template').insert(
          templateRows.map((r) => ({
            org_id: orgId,
            user_id: profileId,
            weekday: r.weekday,
            start_time: `${r.start}:00`,
            end_time: `${r.end}:00`,
          })),
        );
        if (insErr) {
          setMsg(friendlyDbError(insErr.message));
          return;
        }
      }
      setMsg('Weekly template saved.');
      await reloadTemplate();
    } finally {
      setSavingTemplate(false);
    }
  }

  async function saveDayOverride(onDate: string, slots: { start: string; end: string }[]) {
    setMsg(null);
    for (const s of slots) {
      if (s.start >= s.end) {
        setMsg('Override slots need end after start.');
        return;
      }
    }
    const { error: delErr } = await supabase
      .from('rota_staff_availability_override')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', profileId)
      .eq('on_date', onDate);
    if (delErr) {
      setMsg(friendlyDbError(delErr.message));
      return;
    }
    if (slots.length > 0) {
      const { error: insErr } = await supabase.from('rota_staff_availability_override').insert(
        slots.map((s) => ({
          org_id: orgId,
          user_id: profileId,
          on_date: onDate,
          start_time: `${s.start}:00`,
          end_time: `${s.end}:00`,
        })),
      );
      if (insErr) {
        setMsg(friendlyDbError(insErr.message));
        return;
      }
    }
    setMsg('Day availability updated.');
    await reloadOverrides();
  }

  const weekDays = useMemo(() => daysInWeek(overrideWeekStart), [overrideWeekStart]);

  const field =
    'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-sm text-[#121212] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  if (loading) {
    return <p className="text-sm text-[#6b6b6b]">Loading availability…</p>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-authSerif text-[22px] text-[#121212]">Weekly template</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#5c5c5c]">
          Set usual hours you&apos;re available to be booked. Managers see this when assigning shifts.
        </p>
        {msg ? (
          <p className="mt-4 rounded-xl border border-[#d8d8d8] bg-[#f5f4f1] px-4 py-3 text-[13px] text-[#121212]">
            {msg}
          </p>
        ) : null}
        <div className="mt-6 space-y-6">
          {WEEKDAY_LABELS.map((label, day) => {
            const rows = templateRows.filter((r) => r.weekday === day);
            return (
              <div key={label} className="rounded-xl border border-[#e4e2dc] bg-white px-4 py-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-[#121212]">{label}</span>
                  <button
                    type="button"
                    className="rounded-lg border border-[#d4d2cc] bg-[#faf9f6] px-3 py-1.5 text-[12.5px] font-semibold text-[#121212]"
                    onClick={() =>
                      setDayTemplate(day, (existing) => [...existing, { weekday: day, start: '09:00', end: '17:00' }])
                    }
                  >
                    Add hours
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[13px] text-[#6b6b6b]">Not set  you won&apos;t show as available this day.</p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r, idx) => (
                      <li key={`${day}-${idx}`} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          className={field + ' mt-0 w-[130px]'}
                          value={r.start}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDayTemplate(day, (existing) =>
                              existing.map((x, i) => (i === idx ? { ...x, start: v } : x)),
                            );
                          }}
                        />
                        <span className="text-[#9b9b9b]">to</span>
                        <input
                          type="time"
                          className={field + ' mt-0 w-[130px]'}
                          value={r.end}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDayTemplate(day, (existing) =>
                              existing.map((x, i) => (i === idx ? { ...x, end: v } : x)),
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="text-[12.5px] font-medium text-red-800 hover:underline"
                          onClick={() => setDayTemplate(day, (existing) => existing.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={savingTemplate}
          className="mt-6 rounded-xl bg-[#121212] px-5 py-2.5 text-[13px] font-semibold text-[#faf9f6] disabled:opacity-50"
          onClick={() => void saveTemplate()}
        >
          {savingTemplate ? 'Saving…' : 'Save weekly template'}
        </button>
      </div>

      <div>
        <h2 className="font-authSerif text-[22px] text-[#121212]">Overrides for specific days</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#5c5c5c]">
          Change availability for one week without editing your usual template. Clearing a day removes overrides and uses
          your template again.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-[#d4d2cc] bg-white px-3 py-2 text-[13px] font-medium text-[#121212]"
            onClick={() => setOverrideWeekStart((w) => addWeeks(w, -1))}
          >
            Previous week
          </button>
          <button
            type="button"
            className="rounded-lg border border-[#d4d2cc] bg-white px-3 py-2 text-[13px] font-medium text-[#121212]"
            onClick={() => setOverrideWeekStart(startOfWeekMonday(new Date()))}
          >
            This week
          </button>
          <button
            type="button"
            className="rounded-lg border border-[#d4d2cc] bg-white px-3 py-2 text-[13px] font-medium text-[#121212]"
            onClick={() => setOverrideWeekStart((w) => addWeeks(w, 1))}
          >
            Next week
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weekDays.map((d) => {
            const ymd = localYmd(d);
            const dayRows = overrideRows.filter((o) => o.on_date === ymd);
            const slotKey =
              dayRows.length > 0
                ? dayRows.map((o) => `${o.id}:${o.start_time}-${o.end_time}`).join('|')
                : 'template';
            return (
              <DayOverrideCard
                key={`${ymd}-${slotKey}`}
                label={d.toLocaleDateString('en-GB', { timeZone: 'UTC',  weekday: 'short', month: 'short', day: 'numeric' })}
                ymd={ymd}
                initialSlots={
                  dayRows.length > 0
                    ? dayRows.map((o) => ({
                        start: toTimeInputValue(o.start_time),
                        end: toTimeInputValue(o.end_time),
                      }))
                    : []
                }
                usesTemplateOnly={dayRows.length === 0}
                onSave={(slots) => void saveDayOverride(ymd, slots)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayOverrideCard({
  label,
  ymd,
  initialSlots,
  usesTemplateOnly,
  onSave,
}: {
  label: string;
  ymd: string;
  initialSlots: { start: string; end: string }[];
  usesTemplateOnly: boolean;
  onSave: (slots: { start: string; end: string }[]) => void;
}) {
  const [slots, setSlots] = useState<{ start: string; end: string }[]>(() =>
    initialSlots.length > 0 ? initialSlots : [{ start: '09:00', end: '17:00' }],
  );

  const field =
    'w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-1.5 text-[13px] text-[#121212] outline-none focus:border-[#121212]';

  return (
    <div className="rounded-xl border border-[#e4e2dc] bg-white p-4 shadow-sm">
      <div className="mb-2 text-[13px] font-semibold text-[#121212]">{label}</div>
      <div className="mb-1 text-[11px] text-[#9b9b9b]">{ymd}</div>
      {usesTemplateOnly ? (
        <p className="mb-3 text-[12.5px] text-[#6b6b6b]">Using weekly template</p>
      ) : (
        <p className="mb-3 text-[12.5px] text-[#6b6b6b]">Custom hours for this date</p>
      )}
      <ul className="space-y-2">
        {slots.map((s, idx) => (
          <li key={idx} className="flex flex-wrap items-center gap-1">
            <input
              type="time"
              className={field + ' w-[108px]'}
              value={s.start}
              onChange={(e) =>
                setSlots((prev) => prev.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x)))
              }
            />
            <span className="text-[#9b9b9b]">–</span>
            <input
              type="time"
              className={field + ' w-[108px]'}
              value={s.end}
              onChange={(e) =>
                setSlots((prev) => prev.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x)))
              }
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-[#d4d2cc] bg-[#faf9f6] px-2.5 py-1 text-[12px] font-semibold text-[#121212]"
          onClick={() => setSlots((prev) => [...prev, { start: '09:00', end: '17:00' }])}
        >
          Add slot
        </button>
        <button
          type="button"
          className="rounded-lg bg-[#121212] px-2.5 py-1 text-[12px] font-semibold text-[#faf9f6]"
          onClick={() => onSave(slots)}
        >
          Save day
        </button>
        <button
          type="button"
          className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-red-800 hover:underline"
          onClick={() => {
            setSlots([{ start: '09:00', end: '17:00' }]);
            onSave([]);
          }}
        >
          Use template
        </button>
      </div>
    </div>
  );
}
