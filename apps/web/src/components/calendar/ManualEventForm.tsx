'use client';

import { FormSelect } from '@campsite/ui/web';
import { canManageCalendarManualEvents, type ProfileRole } from '@campsite/types';
import { queueEntityCalendarSync } from '@/lib/calendar/queueEntityCalendarSync';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useMemo, useRef, useState } from 'react';

type Profile = {
  id: string;
  org_id: string;
  role: ProfileRole;
  full_name: string;
  org_timezone?: string | null;
};

function toDatetimeLocalValue(d: Date): string {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 16);
}

export function ManualEventForm({
  profile,
  departments,
  defaultDay,
  open,
  onOpenChange,
  onSaved,
  composeKey,
  initialStart,
  initialEnd,
  initialAllDay,
  onDraftTimesChange,
  showToggle = true,
}: {
  profile: Profile;
  departments: { id: string; name: string }[];
  defaultDay: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Increment when opening the composer so fields reset from `initial*`. */
  composeKey: number;
  initialStart: Date;
  initialEnd: Date;
  initialAllDay: boolean;
  onDraftTimesChange: (start: Date, end: Date, allDay: boolean) => void;
  showToggle?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [deptId, setDeptId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [memberOptions, setMemberOptions] = useState<{ id: string; full_name: string | null }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const canManage = canManageCalendarManualEvents(profile.role);
  const lastComposeKey = useRef(-1);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('org_id', profile.org_id)
        .eq('status', 'active')
        .order('full_name');
      if (!error && data) {
        setMemberOptions(data.filter((r) => r.id !== profile.id));
      }
    })();
  }, [supabase, profile.org_id, profile.id]);

  useEffect(() => {
    if (!open) return;
    if (composeKey === lastComposeKey.current) return;
    lastComposeKey.current = composeKey;
    setTitle('');
    setDescription('');
    setDeptId('');
    setInviteeIds([]);
    setMsg(null);
    setAllDay(initialAllDay);
    if (initialAllDay) {
      setStartLocal('');
      setEndLocal('');
    } else {
      setStartLocal(toDatetimeLocalValue(initialStart));
      setEndLocal(toDatetimeLocalValue(initialEnd));
    }
  }, [open, composeKey, initialAllDay, initialStart, initialEnd]);

  useEffect(() => {
    if (!open) return;
    if (allDay) {
      const start = new Date(defaultDay);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      onDraftTimesChange(start, end, true);
      return;
    }
    if (!startLocal) return;
    const start = new Date(startLocal);
    const end = endLocal ? new Date(endLocal) : new Date(start.getTime() + 3600000);
    if (end > start) onDraftTimesChange(start, end, false);
  }, [open, allDay, startLocal, endLocal, defaultDay, onDraftTimesChange]);

  async function save() {
    setMsg(null);
    if (!title.trim()) {
      setMsg('Title is required.');
      return;
    }
    let start: Date;
    let end: Date | null = null;
    if (allDay) {
      start = new Date(defaultDay);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else {
      if (!startLocal) {
        setMsg('Start time required.');
        return;
      }
      start = new Date(startLocal);
      end = endLocal ? new Date(endLocal) : new Date(start.getTime() + 3600000);
      if (end <= start) {
        setMsg('End must be after start.');
        return;
      }
    }
    const { data: row, error } = await supabase
      .from('calendar_events')
      .insert({
        org_id: profile.org_id,
        dept_id: deptId || null,
        title: title.trim(),
        description: description.trim() || null,
        start_time: start.toISOString(),
        end_time: end?.toISOString() ?? null,
        all_day: allDay,
        source: 'manual',
        created_by: profile.id,
      })
      .select('id')
      .single();

    if (error) {
      setMsg(error.message);
      return;
    }

    const evId = row?.id as string | undefined;
    if (evId && inviteeIds.length > 0) {
      const rows = inviteeIds.map((pid) => ({
        org_id: profile.org_id,
        event_id: evId,
        profile_id: pid,
        status: 'invited' as const,
        invited_by: profile.id,
      }));
      const { error: attErr } = await supabase.from('calendar_event_attendees').insert(rows);
      if (attErr) {
        setMsg(attErr.message);
        return;
      }
    }

    if (evId) {
      queueEntityCalendarSync({ type: 'calendar-event', id: evId, action: 'upsert' });
    }

    onOpenChange(false);
    setTitle('');
    setDescription('');
    setInviteeIds([]);
    onSaved();
  }

  const fieldClass =
    'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-sm text-[#121212] outline-none transition focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

  if (!canManage) return null;

  return (
    <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
      {showToggle ? (
        <button
          type="button"
          className="text-[13px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
          onClick={() => onOpenChange(!open)}
        >
          {open ? 'Hide new event' : '+ New event'}
        </button>
      ) : null}
      {open ? (
        <div className={`${showToggle ? 'mt-4' : ''} grid gap-3 sm:grid-cols-2`}>
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Title
            <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#121212] sm:col-span-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => {
                setAllDay(e.target.checked);
              }}
            />
            All day
          </label>
          {!allDay ? (
            <>
              <label className="text-[13px] font-medium text-[#6b6b6b]">
                Start
                <input
                  type="datetime-local"
                  className={fieldClass}
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
              </label>
              <label className="text-[13px] font-medium text-[#6b6b6b]">
                End
                <input
                  type="datetime-local"
                  className={fieldClass}
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                />
              </label>
            </>
          ) : (
            <p className="text-sm text-[#6b6b6b] sm:col-span-2">
              Uses the selected day shown in the calendar header (switch day or view if needed).
            </p>
          )}
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Department (optional)
            <FormSelect className={fieldClass} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">-</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Invite people (optional)
            <FormSelect
              multiple
              className={`${fieldClass} min-h-[88px]`}
              value={inviteeIds}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                setInviteeIds(opts);
              }}
            >
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name?.trim() || 'Member'}
                </option>
              ))}
            </FormSelect>
            <span className="mt-1 block text-[11px] text-[#9b9b9b]">Hold Cmd/Ctrl to select multiple.</span>
          </label>
          <label className="text-[13px] font-medium text-[#6b6b6b] sm:col-span-2">
            Description
            <textarea
              className={fieldClass}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {msg ? <p className="text-sm text-[#b91c1c] sm:col-span-2">{msg}</p> : null}
          <button
            type="button"
            className="rounded-lg bg-[#121212] px-4 py-2.5 text-sm font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a] sm:col-span-2"
            onClick={() => void save()}
          >
            Save event
          </button>
        </div>
      ) : null}
    </div>
  );
}
