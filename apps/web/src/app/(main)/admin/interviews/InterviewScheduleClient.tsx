'use client';

import { useInHiringHub } from '@/app/(main)/hr/hiring/HiringHubContext';
import {
  bulkCreateInterviewSlots,
  cancelAvailableInterviewSlot,
  completeInterviewSlot,
} from '@/app/(main)/admin/interviews/actions';
import { isInterviewSlotStatus } from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

type JobOption = { id: string; title: string; status: string };
type ProfileOption = { id: string; full_name: string | null; email: string | null };

type SlotListRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  job_listing_id: string;
  job_listings: { title: string } | { title: string }[] | null;
  interview_slot_panelists: Array<{
    profile_id: string;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  }> | null;
};

type ParsedSlot = { startsAt: Date; endsAt: Date; label: string };

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// ---------------------------------------------------------------------------
// Natural language parser
// ---------------------------------------------------------------------------

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Returns the next occurrence of a given weekday (0=Sun … 6=Sat), always >= today */
function nextWeekday(dayNum: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = new Date(today);
  const diff = (dayNum - today.getDay() + 7) % 7;
  result.setDate(today.getDate() + (diff === 0 ? 7 : diff));
  return result;
}

/** Parse times from a string like "2, 4 and 1 pm" or "9am, 10am, 11am" or "14:00" */
function parseTimes(raw: string): number[] {
  // Normalise: "two pm" etc. not handled — numeric only
  const times: number[] = [];

  // Match patterns like "2:30pm", "14:30", "2pm", "14", "2 pm"
  // We process left to right and track trailing am/pm that applies to bare numbers
  const tokens = raw.match(/(\d{1,2}:\d{2})\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)/gi) ?? [];

  for (const tok of tokens) {
    const lower = tok.trim().toLowerCase();
    const isPm = lower.includes('pm');
    const isAm = lower.includes('am');
    const cleaned = lower.replace(/[apm\s]/g, '');
    const [hStr, mStr] = cleaned.split(':');
    let h = parseInt(hStr ?? '0', 10);
    const m = parseInt(mStr ?? '0', 10);
    if (isNaN(h)) continue;
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    times.push(h * 60 + m);
  }

  // Fallback: if no explicit am/pm, handle "at 2, 4 and 1 pm" style
  // Find trailing am/pm after a list of bare numbers
  if (times.length === 0) {
    const trailingPm = /(\d+(?:[,\s](?:and\s+)?\d+)*)\s*pm/i.exec(raw);
    const trailingAm = /(\d+(?:[,\s](?:and\s+)?\d+)*)\s*am/i.exec(raw);
    const group = trailingPm ?? trailingAm;
    const ampm = trailingPm ? 'pm' : 'am';
    if (group?.[1]) {
      const nums = group[1].match(/\d+/g) ?? [];
      for (const n of nums) {
        let h = parseInt(n, 10);
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        times.push(h * 60);
      }
    }
  }

  return times;
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${displayH}${ampm}` : `${displayH}:${String(m).padStart(2, '0')}${ampm}`;
}

function parsePrompt(text: string, durationMin: number): ParsedSlot[] {
  const lower = text.toLowerCase();

  // Extract day names in order of appearance
  const dayMatches: Array<{ name: string; dayNum: number; index: number }> = [];
  for (const [name, dayNum] of Object.entries(DAY_MAP)) {
    // Only match full words
    const re = new RegExp(`\\b${name}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      // Avoid duplicate short forms shadowing full names (e.g. "tue" in "tuesday")
      const alreadyCovered = dayMatches.some(
        (d) => Math.abs(d.index - m!.index) < 3 && d.dayNum === dayNum
      );
      if (!alreadyCovered) {
        dayMatches.push({ name, dayNum, index: m.index });
      }
    }
  }
  dayMatches.sort((a, b) => a.index - b.index);

  // Deduplicate: prefer longer name at same position
  const dedupedDays: typeof dayMatches = [];
  for (const d of dayMatches) {
    const prev = dedupedDays[dedupedDays.length - 1];
    if (prev && Math.abs(prev.index - d.index) <= prev.name.length) {
      // Keep the longer one
      if (d.name.length > prev.name.length) dedupedDays[dedupedDays.length - 1] = d;
    } else {
      dedupedDays.push(d);
    }
  }

  // Extract times (everything after "at" or in the text)
  const atIdx = lower.lastIndexOf(' at ');
  const timePart = atIdx >= 0 ? text.slice(atIdx + 4) : text;
  const times = parseTimes(timePart);

  if (dedupedDays.length === 0 || times.length === 0) return [];

  const isRespectively = lower.includes('respectively');
  const slots: ParsedSlot[] = [];

  if (isRespectively || times.length === dedupedDays.length) {
    // Pair day[i] with time[i]
    for (let i = 0; i < dedupedDays.length; i++) {
      const day = dedupedDays[i]!;
      const timeMin = times[i] ?? times[times.length - 1]!;
      const base = nextWeekday(day.dayNum);
      const startsAt = new Date(base);
      startsAt.setHours(Math.floor(timeMin / 60), timeMin % 60, 0, 0);
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      const label = `${base.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${minutesToHHMM(timeMin)}`;
      slots.push({ startsAt, endsAt, label });
    }
  } else if (dedupedDays.length === 1) {
    // One day, multiple times
    const day = dedupedDays[0]!;
    const base = nextWeekday(day.dayNum);
    for (const timeMin of times) {
      const startsAt = new Date(base);
      startsAt.setHours(Math.floor(timeMin / 60), timeMin % 60, 0, 0);
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      const label = `${base.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${minutesToHHMM(timeMin)}`;
      slots.push({ startsAt, endsAt, label });
    }
  } else {
    // Multiple days, one time → apply the single time to each day
    const timeMin = times[0]!;
    for (const day of dedupedDays) {
      const base = nextWeekday(day.dayNum);
      const startsAt = new Date(base);
      startsAt.setHours(Math.floor(timeMin / 60), timeMin % 60, 0, 0);
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      const label = `${base.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${minutesToHHMM(timeMin)}`;
      slots.push({ startsAt, endsAt, label });
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function slotStatusPill(status: string) {
  const s = isInterviewSlotStatus(status) ? status : 'available';
  const tone =
    s === 'available'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : s === 'booked'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InterviewScheduleClient({
  canCreateSlot,
  canCompleteSlot,
  jobs,
  profiles,
  initialSlots,
}: {
  canCreateSlot: boolean;
  canCompleteSlot: boolean;
  jobs: JobOption[];
  profiles: ProfileOption[];
  initialSlots: SlotListRow[];
}) {
  const inHiringHub = useInHiringHub();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Prompt-based creation state
  const [prompt, setPrompt] = useState('');
  const [durationMin, setDurationMin] = useState(45);
  const [parsedSlots, setParsedSlots] = useState<ParsedSlot[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '');
  const [slotTitle, setSlotTitle] = useState('Interview');
  const [selectedPanel, setSelectedPanel] = useState<Record<string, boolean>>({});
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('list');

  const selectedIds = useMemo(() => Object.keys(selectedPanel).filter((k) => selectedPanel[k]), [selectedPanel]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, SlotListRow[]>();
    for (const slot of initialSlots) {
      const key = new Date(slot.starts_at).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      const arr = map.get(key) ?? [];
      arr.push(slot);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [initialSlots]);

  function handleParse() {
    setParseError(null);
    if (!prompt.trim()) { setParseError('Enter a description of the slots you want to create.'); return; }
    const result = parsePrompt(prompt, durationMin);
    if (result.length === 0) {
      setParseError("Couldn't understand that. Try: \"Monday at 2pm, Thursday at 4pm, Friday at 1pm\"");
      return;
    }
    setParsedSlots(result);
  }

  function removeSlot(index: number) {
    setParsedSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCreate() {
    if (!canCreateSlot) { setMsg({ type: 'err', text: 'You do not have permission to create interview slots.' }); return; }
    if (!jobId) { setMsg({ type: 'err', text: 'Choose a job listing.' }); return; }
    if (parsedSlots.length === 0) { setMsg({ type: 'err', text: 'No slots to create.' }); return; }
    if (selectedIds.length === 0) { setMsg({ type: 'err', text: 'Select at least one panel member.' }); return; }
    setMsg(null);
    startTransition(async () => {
      const res = await bulkCreateInterviewSlots({
        jobListingId: jobId,
        title: slotTitle,
        slots: parsedSlots.map((s) => ({
          startsAtIso: s.startsAt.toISOString(),
          endsAtIso: s.endsAt.toISOString(),
        })),
        panelistProfileIds: selectedIds,
      });
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      const w = res.warnings?.join(' ') ?? '';
      setMsg({
        type: 'ok',
        text: `${res.created ?? parsedSlots.length} slot${(res.created ?? parsedSlots.length) === 1 ? '' : 's'} created.${w ? ` ${w}` : ''}`,
      });
      setParsedSlots([]);
      setPrompt('');
      router.refresh();
    });
  }

  return (
    <div className={inHiringHub ? 'min-w-0 space-y-8 pt-0' : 'mx-auto max-w-6xl space-y-8 px-5 py-7 sm:px-7'}>
      {inHiringHub ? null : (
        <div>
          <h1 className="mt-1 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Interview slots
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6b6b6b]">
            Describe the slots you need in plain text, assign panel members, and create them in one go.
            Once a candidate is moved to <strong>Interview scheduled</strong> on the hiring pipeline, they get a
            confirmation email and the slot is booked.
          </p>
        </div>
      )}

      {msg ? (
        <div
          role={msg.type === 'err' ? 'alert' : 'status'}
          className={[
            'rounded-lg border px-3 py-2 text-[13px]',
            msg.type === 'err'
              ? 'status-banner-error'
              : 'status-banner-success',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      {/* ── Prompt-based slot creation ───────────────────────────── */}
      {canCreateSlot ? (
      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="font-authSerif text-lg text-[#121212]">Create slots</h2>
        <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
          Describe when you want interviews in plain English, then add panel members below.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#505050]">Slot description</label>
            <div className="flex gap-2">
              <textarea
                rows={2}
                className="flex-1 rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] leading-relaxed placeholder:text-[#b0b0b0] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                placeholder='e.g. "Monday at 2pm, Thursday at 4pm and Friday at 1pm" or "Tuesday and Wednesday at 10am and 2pm"'
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setParsedSlots([]); setParseError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleParse(); } }}
              />
              <button
                type="button"
                onClick={handleParse}
                disabled={!prompt.trim()}
                className="self-start rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Parse
              </button>
            </div>
            {parseError ? (
              <p className="mt-1 text-[12px] text-red-700">{parseError}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[12px] font-medium text-[#505050]">
              Duration
              <select
                value={durationMin}
                onChange={(e) => { setDurationMin(Number(e.target.value)); setParsedSlots([]); }}
                className="ml-2 rounded-lg border border-[#d8d8d8] px-2 py-1.5 text-[12px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </label>
            <label className="text-[12px] font-medium text-[#505050]">
              Slot label
              <input
                value={slotTitle}
                onChange={(e) => setSlotTitle(e.target.value)}
                className="ml-2 w-36 rounded-lg border border-[#d8d8d8] px-2 py-1.5 text-[12px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                placeholder="Interview"
              />
            </label>
          </div>

          {/* Parsed preview */}
          {parsedSlots.length > 0 ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-[#fafaf9]">
              <div className="border-b border-[#ececec] px-4 py-2.5">
                <p className="text-[12px] font-semibold text-[#121212]">
                  {parsedSlots.length} slot{parsedSlots.length === 1 ? '' : 's'} to create — review before confirming
                </p>
              </div>
              <ul className="divide-y divide-[#f0f0f0]">
                {parsedSlots.map((s, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="text-[13px]">
                      <span className="font-medium text-[#121212]">
                        {s.startsAt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="ml-2 text-[#6b6b6b]">
                        {s.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {s.endsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="ml-2 text-[11px] text-[#9b9b9b]">({durationMin} min)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSlot(i)}
                      className="ml-4 text-[12px] text-[#9b9b9b] hover:text-[#b91c1c]"
                      aria-label="Remove slot"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Job listing */}
        <div className="mt-5">
          <label className="mb-1 block text-[12px] font-medium text-[#505050]">Job listing</label>
          {jobs.length === 0 ? (
            <p className="text-[13px] text-[#9b9b9b]">
              No active job listings.{' '}
              <Link href="/hr/jobs" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">Create one first</Link>.
            </p>
          ) : (
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {(j.title || 'Untitled').trim()}{j.status !== 'live' ? ` (${j.status})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Panel members */}
        <div className="mt-5">
          <p className="mb-2 text-[12px] font-medium text-[#505050]">
            Panel members
            {selectedIds.length > 0 ? (
              <span className="ml-2 rounded-full bg-[#121212] px-2 py-0.5 text-[10.5px] font-medium text-white">
                {selectedIds.length} selected
              </span>
            ) : null}
          </p>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-[#e8e8e8]">
            {profiles.length === 0 ? (
              <p className="p-4 text-[13px] text-[#9b9b9b]">No active team members.</p>
            ) : (
              <ul className="divide-y divide-[#f5f5f5]">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[#fafaf9]">
                      <input
                        type="checkbox"
                        checked={!!selectedPanel[p.id]}
                        onChange={() => setSelectedPanel((s) => ({ ...s, [p.id]: !s[p.id] }))}
                        className="h-4 w-4 rounded border-[#d8d8d8] accent-[#121212]"
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#121212]">{p.full_name?.trim() || '—'}</p>
                        {p.email ? <p className="text-[11.5px] text-[#9b9b9b]">{p.email}</p> : null}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Create button */}
        <div className="mt-5">
          <button
            type="button"
            disabled={pending || parsedSlots.length === 0 || selectedIds.length === 0 || !jobId}
            onClick={handleCreate}
            className="rounded-lg bg-[#121212] px-5 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending
              ? 'Creating…'
              : parsedSlots.length > 0
                ? `Create ${parsedSlots.length} slot${parsedSlots.length === 1 ? '' : 's'}`
                : 'Create slots'}
          </button>
          {parsedSlots.length === 0 && !parseError ? (
            <p className="mt-1.5 text-[11.5px] text-[#9b9b9b]">
              Parse your description first, then select panel members and hit Create.
            </p>
          ) : null}
        </div>
      </section>
      ) : (
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-5">
          <h2 className="font-authSerif text-lg text-[#121212]">Create slots</h2>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            You can view interview scheduling, but only users with slot-creation permission can create or cancel slots.
          </p>
        </section>
      )}

      {/* ── Upcoming slots ───────────────────────────────────────── */}
      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-authSerif text-lg text-[#121212]">Upcoming slots</h2>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setScheduleView('list')}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${scheduleView === 'list' ? 'bg-[#121212] text-white' : 'border border-[#d8d8d8] bg-white text-[#505050] hover:bg-[#f5f5f5]'}`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setScheduleView('calendar')}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${scheduleView === 'calendar' ? 'bg-[#121212] text-white' : 'border border-[#d8d8d8] bg-white text-[#505050] hover:bg-[#f5f5f5]'}`}
            >
              By day
            </button>
          </div>
        </div>

        {scheduleView === 'list' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-[#f0f0f0] text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Job</th>
                  <th className="py-2 pr-4">Panel</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {initialSlots.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-[#9b9b9b]">No upcoming slots. Create some above.</td>
                  </tr>
                ) : (
                  initialSlots.map((s) => {
                    const jl = relOne(s.job_listings);
                    const pan = s.interview_slot_panelists ?? [];
                    const panNames = pan
                      .map((p) => relOne(p.profiles)?.full_name?.trim() || '—')
                      .join(', ');
                    const when = new Date(s.starts_at).toLocaleString(undefined, {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    });
                    const endTime = new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <tr key={s.id} className="border-b border-[#f5f5f5] last:border-0">
                        <td className="py-3 pr-4 align-top text-[#121212]">{when} – {endTime}</td>
                        <td className="py-3 pr-4 align-top">
                          <span className="text-[#242424]">{jl?.title?.trim() || '—'}</span>
                          <div>
                            <Link href={`/hr/jobs/${s.job_listing_id}/applications`} className="text-[11.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
                              Pipeline →
                            </Link>
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top text-[#505050]">{panNames || '—'}</td>
                        <td className="py-3 pr-4 align-top">{slotStatusPill(s.status)}</td>
                        <td className="py-3 align-top">
                          <div className="flex flex-wrap gap-2">
                            {s.status === 'available' && canCreateSlot ? (
                              <button
                                type="button"
                                disabled={pending}
                                className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-800 hover:bg-red-100 disabled:opacity-50"
                                onClick={() => {
                                  if (!window.confirm('Cancel this slot?')) return;
                                  startTransition(async () => {
                                    const r = await cancelAvailableInterviewSlot(s.id);
                                    if (!r.ok) setMsg({ type: 'err', text: r.error });
                                    else router.refresh();
                                  });
                                }}
                              >
                                Cancel
                              </button>
                            ) : null}
                            {s.status === 'booked' && canCompleteSlot ? (
                              <button
                                type="button"
                                disabled={pending}
                                className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px] hover:bg-[#f5f5f5] disabled:opacity-50"
                                onClick={() => {
                                  startTransition(async () => {
                                    const r = await completeInterviewSlot(s.id);
                                    if (!r.ok) setMsg({ type: 'err', text: r.error });
                                    else router.refresh();
                                  });
                                }}
                              >
                                Mark done
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {slotsByDay.length === 0 ? (
              <p className="text-[13px] text-[#9b9b9b]">No upcoming slots.</p>
            ) : (
              slotsByDay.map(([day, daySlots]) => (
                <div key={day} className="rounded-xl border border-[#e8e8e8] bg-[#fafaf9] p-3">
                  <p className="text-[12px] font-semibold text-[#121212]">{day}</p>
                  <div className="mt-2 space-y-2">
                    {daySlots.map((s) => {
                      const jl = relOne(s.job_listings);
                      const pan = s.interview_slot_panelists ?? [];
                      const panNames = pan.map((p) => relOne(p.profiles)?.full_name?.trim()).filter(Boolean).join(', ');
                      return (
                        <div key={s.id} className="rounded-lg border border-[#e4e4e4] bg-white p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-medium text-[#121212]">
                              {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {' – '}
                              {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {slotStatusPill(s.status)}
                          </div>
                          <p className="mt-1 text-[11.5px] text-[#6b6b6b]">{jl?.title?.trim() || '—'}</p>
                          {panNames ? <p className="mt-0.5 text-[11px] text-[#9b9b9b]">Panel: {panNames}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
